import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { getCapabilities, validateToolCall } from './catalog'
import { runSafeScript } from './sandbox'
import { assertScene, summarize, type BridgeJob, type JsonObject, type Snapshot } from './protocol'
import { tokenEquals, writeArtifact, listProjects, loadProject, audit } from './storage'

interface Pending { job: BridgeJob; resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
interface Session { id: string; token: string; label: string; seenAt: number; queue: Pending[]; pending: Map<string, Pending>; wake?: () => void; tail: Promise<unknown>; results: Map<string, { hash: string; result: Promise<any> }> }
interface Plan { sessionId: string; revision: number; scene: Snapshot['scene']; expiresAt: number; logs: string[]; commandCount: number }
interface BrokerState { sessions: Map<string, Session>; plans: Map<string, Plan> }
const globalBroker = globalThis as typeof globalThis & { __choronoBroker?: BrokerState }
const state = globalBroker.__choronoBroker ??= { sessions: new Map(), plans: new Map() }

function cleanup() {
  for (const [id, session] of Array.from(state.sessions)) if (Date.now() - session.seenAt > 120000) disconnect(id, session.token)
  for (const [id, plan] of Array.from(state.plans)) if (plan.expiresAt < Date.now()) state.plans.delete(id)
}

export function pairEditor(label: string) {
  cleanup()
  if (state.sessions.size >= 12) throw new Error('Too many editor sessions')
  const id = randomUUID(), token = randomBytes(32).toString('hex')
  state.sessions.set(id, { id, token, label: label.slice(0, 100), seenAt: Date.now(), queue: [], pending: new Map(), tail: Promise.resolve(), results: new Map() })
  return { id, token }
}

function editorSession(id: string, token: string) {
  const session = state.sessions.get(id)
  if (!session || !tokenEquals(token, session.token)) throw new Error('Editor session not authorized')
  session.seenAt = Date.now()
  return session
}

export function disconnect(id: string, token: string) {
  const session = editorSession(id, token)
  for (const pending of session.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('Editor disconnected')) }
  session.wake?.()
  state.sessions.delete(id)
}

export function listSessions() {
  cleanup()
  return Array.from(state.sessions.values(), s => ({ id: s.id, label: s.label, lastSeenAt: new Date(s.seenAt).toISOString() }))
}

export async function pollEditor(id: string, token: string, signal?: AbortSignal): Promise<BridgeJob | null> {
  const session = editorSession(id, token)
  if (signal?.aborted) return null
  if (!session.queue.length) await new Promise<void>(resolve => {
    const timer = setTimeout(done, 15000)
    function done() { clearTimeout(timer); signal?.removeEventListener('abort', done); if (session.wake === done) session.wake = undefined; resolve() }
    session.wake?.()
    session.wake = done
    signal?.addEventListener('abort', done, { once: true })
  })
  session.seenAt = Date.now()
  if (signal?.aborted) return null
  return session.queue.shift()?.job ?? null
}

export function answerEditor(id: string, token: string, jobId: string, result: any, error?: string) {
  const session = editorSession(id, token)
  const pending = session.pending.get(jobId)
  if (!pending) return
  session.pending.delete(jobId)
  clearTimeout(pending.timer)
  if (error) pending.reject(new Error(error.slice(0, 2000)))
  else pending.resolve(result)
}

function ask(session: Session, method: string, args: JsonObject = {}, timeoutMs = 30000): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = randomUUID()
    const timer = setTimeout(() => {
      session.pending.delete(id)
      session.queue = session.queue.filter(p => p.job.id !== id)
      reject(new Error('Editor response timed out; outcome may be unknown. Read the scene before retrying a mutation.'))
    }, timeoutMs)
    const pending = { job: { id, method, args }, resolve, reject, timer }
    session.pending.set(id, pending)
    session.queue.push(pending)
    session.wake?.()
  })
}

function chooseSession(id?: string) {
  cleanup()
  if (id) { const session = state.sessions.get(id); if (!session) throw new Error('Editor session not found'); return session }
  if (state.sessions.size !== 1) throw new Error(state.sessions.size ? 'Multiple editors connected; choose sessionId using list_sessions' : 'No editor connected. Start npm run dev:mcp, open the editor, then connect MCP in its toolbar.')
  return Array.from(state.sessions.values())[0]
}

export async function callEditorTool(name: string, args: JsonObject, clientName = 'MCP client') {
  await validateToolCall(name, args)
  if (name === 'list_sessions') return { sessions: listSessions() }
  if (name === 'get_capabilities') return getCapabilities()
  if (name === 'list_projects') return { projects: await listProjects() }
  const session = chooseSession(args.sessionId)
  const hash = createHash('sha256').update(JSON.stringify({ name, args })).digest('hex')
  if (args.requestId && session.results.has(args.requestId)) {
    const cached = session.results.get(args.requestId)!
    if (cached.hash !== hash) throw new Error('requestId was already used with different arguments')
    return cached.result
  }
  const result = session.tail.catch(() => {}).then(async () => {
    const snapshot = (): Promise<Snapshot> => ask(session, 'snapshot')
    const checkRevision = (revision: number) => { if (args.expectedRevision !== undefined && args.expectedRevision !== revision) throw new Error(`Scene revision conflict: expected ${args.expectedRevision}, actual ${revision}`) }
    if (name === 'get_scene') return snapshot()
    if (name === 'run_script') {
      const before = await snapshot()
      checkRevision(before.revision)
      const generated = await runSafeScript(args.code, before.scene)
      const summary = { ...summarize(generated.scene), logs: generated.logs, commandCount: generated.commandCount }
      if (args.dryRun) {
        const planId = randomUUID()
        if (state.plans.size >= 50) throw new Error('Too many uncommitted script plans')
        state.plans.set(planId, { sessionId: session.id, revision: before.revision, ...generated, expiresAt: Date.now() + 300000 })
        return { planId, revision: before.revision, dryRun: true, ...summary }
      }
      const applied = generated.commandCount ? await ask(session, 'apply_scene', { scene: generated.scene, expectedRevision: before.revision, label: 'MCP script' }) : { revision: before.revision }
      return { ...applied, ...summary }
    }
    if (name === 'apply_script_plan') {
      const plan = state.plans.get(args.planId)
      if (!plan || plan.sessionId !== session.id || plan.expiresAt < Date.now()) throw new Error('Script plan expired or belongs to a different session')
      checkRevision(plan.revision)
      const result = plan.commandCount ? await ask(session, 'apply_scene', { scene: plan.scene, expectedRevision: plan.revision, label: 'MCP script plan' }) : { revision: plan.revision }
      state.plans.delete(args.planId)
      return { ...result, logs: plan.logs, commandCount: plan.commandCount, ...summarize(plan.scene) }
    }
    if (name === 'save_project') {
      const before: Snapshot = await ask(session, 'portable_snapshot')
      checkRevision(before.revision)
      assertScene(before.scene)
      const defaultName = String(before.scene.composition.id || 'scene').replace(/[^a-zA-Z0-9_-]/g, '_')
      return { ...await writeArtifact(args.name ?? defaultName, '.chorono.json', JSON.stringify(before.scene, null, 2), args.overwrite), revision: before.revision }
    }
    if (name === 'load_project') {
      const before = await snapshot()
      checkRevision(before.revision)
      return ask(session, 'apply_scene', { scene: await loadProject(args.name), expectedRevision: before.revision, label: 'Load MCP project' })
    }
    if (['export_runtime', 'export_svg', 'export_sequence'].includes(name)) {
      const exported = await ask(session, name, args, 120000)
      const data = Buffer.from(exported.data, 'base64')
      return { ...await writeArtifact(args.name ?? 'animation-' + Date.now(), exported.extension, data, false, 'exports'), revision: exported.revision, warnings: exported.warnings ?? [] }
    }
    return ask(session, name, args, name === 'render_preview' ? 60000 : 30000)
  })
  session.tail = result
  if (args.requestId) {
    session.results.set(args.requestId, { hash, result })
    if (session.results.size > 64) session.results.delete(session.results.keys().next().value!)
  }
  try {
    const value = await result
    await audit({ client: clientName.slice(0, 80), sessionId: session.id, tool: name, revision: value?.revision, ok: true }).catch(() => {})
    return value
  } catch (error) {
    await audit({ client: clientName.slice(0, 80), sessionId: session.id, tool: name, ok: false }).catch(() => {})
    throw error
  }
}
