import type { AuthoringHints } from '../types/authoring'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { getCapabilities, validateToolCall } from './catalog'
import { runSafeScript } from './sandbox'
import { assertScene, summarize, MCP_VERSION, type BridgeJob, type JsonObject, type Snapshot } from './protocol'
import { tokenEquals, writeArtifact, listProjects, loadProject, audit } from './storage'
import { implementationToolName } from './tools/ToolCatalogPolicy'
import { ClientConnections, type MCPClientIdentity } from './source/ClientConnections'
import { ReadAccessRegistry } from './source/ReadAccessRegistry'
import { SourceAccessError, sourceFailure } from './source/SourceAccessError'
import { isSourceMutation } from './source/ToolSourcePolicy'
import type { SourceAuthorization } from './source/EditorSourceIdentity'
import { summarizeSourceChanges } from './source/SourceChangeSummary'

interface Pending { job: BridgeJob; resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
interface Session { id: string; token: string; label: string; seenAt: number; queue: Pending[]; pending: Map<string, Pending>; wake?: () => void; tail: Promise<unknown>; results: Map<string, { hash: string; result: Promise<any> }> }
interface Plan { clientId: string; sessionId: string; documentEpoch: string; revision: number; scene: Snapshot['scene']; expiresAt: number; logs: string[]; commandCount: number; authoringHints?: AuthoringHints }
interface BrokerState { sessions: Map<string, Session>; plans: Map<string, Plan>; reads?: ReadAccessRegistry; clients?: ClientConnections }
const globalBroker = globalThis as typeof globalThis & { __choronoBroker?: BrokerState }
const state: BrokerState = globalBroker.__choronoBroker ??= { sessions: new Map(), plans: new Map() }
const reads = state.reads ??= new ReadAccessRegistry(() => randomBytes(32).toString('hex'))
const clients = state.clients ??= new ClientConnections(() => randomBytes(32).toString('hex'), id => {
  reads.revoke({ clientId: id })
  for (const [planId, plan] of Array.from(state.plans)) if (plan.clientId === id) state.plans.delete(planId)
})

/** Authenticated local-transport registration. The supplied name is audit text,
 * never authority. Only the resulting private connection credential resolves
 * an identity; source access is deliberately incompatible with old bridges. */
export function openClientConnection(label: string, version: string) {
  if (version !== MCP_VERSION) throw new SourceAccessError('SOURCE_PROTOCOL_REQUIRED')
  return clients.open(label)
}
/** Called by the authenticated route, never from a model tool argument. */
export const getClientConnection = (token?: string): MCPClientIdentity => clients.require(token)
/** Revoke connection/plan/read state when STDIO closes; lazy TTL is fallback. */
export const closeClientConnection = (token: string): void => clients.close(token)

function cleanup() {
  for (const [id, session] of Array.from(state.sessions)) if (Date.now() - session.seenAt > 120000) disconnect(id, session.token)
  for (const [id, plan] of Array.from(state.plans)) if (plan.expiresAt < Date.now()) { state.plans.delete(id); reads.revoke({ planId: id }) }
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
  for (const pending of Array.from(session.pending.values())) { clearTimeout(pending.timer); pending.reject(new Error('Editor disconnected')) }
  session.wake?.()
  state.sessions.delete(id)
  reads.revoke({ sessionId: id })
  for (const [planId, plan] of Array.from(state.plans)) if (plan.sessionId === id) state.plans.delete(planId)
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

export function answerEditor(id: string, token: string, jobId: string, result: any, error?: string, errorData?: unknown) {
  const session = editorSession(id, token)
  const pending = session.pending.get(jobId)
  if (!pending) return
  session.pending.delete(jobId)
  clearTimeout(pending.timer)
  if (error || errorData) pending.reject(sourceFailure(errorData) ?? new Error((error ?? 'Editor operation failed').slice(0, 2000)))
  else pending.resolve(result)
}

function ask(session: Session, method: string, args: JsonObject = {}, timeoutMs = 30000, sourceAuthorization?: SourceAuthorization): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = randomUUID()
    const timer = setTimeout(() => {
      session.pending.delete(id)
      session.queue = session.queue.filter(p => p.job.id !== id)
      reject(new Error('Editor response timed out; outcome may be unknown. Read the scene before retrying a mutation.'))
    }, timeoutMs)
    const pending = { job: { id, method, args, ...(sourceAuthorization ? { sourceAuthorization } : {}) }, resolve, reject, timer }
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

/** Validate the requested transport name, then execute its existing native
 * implementation. Retry identity retains the exact requested name: changing an
 * alias is a different request, even when the underlying command is identical.
 * Aliases share all revision, transaction, plan and audit gates below. */
export async function callEditorTool(requestedName: string, args: JsonObject, client?: MCPClientIdentity) {
  await validateToolCall(requestedName, args)
  const name = implementationToolName(requestedName)
  if (name === 'list_sessions') return { sessions: listSessions() }
  if (name === 'get_capabilities') return getCapabilities('standard', args)
  if (name === 'list_projects') return { projects: await listProjects() }
  const session = chooseSession(args.sessionId)
  const sourceWrite = isSourceMutation(name)
  if (sourceWrite || name === 'get_scene') clients.verify(client)
  const hash = createHash('sha256').update(JSON.stringify({ name: requestedName, args })).digest('hex')
  const requestKey = args.requestId && name !== 'get_scene' ? `${client?.id ?? 'read-only'}:${args.requestId}` : undefined
  if (requestKey && session.results.has(requestKey)) {
    const cached = session.results.get(requestKey)!
    if (cached.hash !== hash) throw new Error('requestId was already used with different arguments')
    return cached.result
  }
  const result = session.tail.catch(() => {}).then(async () => {
    const snapshot = (): Promise<Snapshot> => ask(session, 'snapshot')
    const checkRevision = (revision: number) => { if (args.expectedRevision !== undefined && args.expectedRevision !== revision) throw new Error(`Scene revision conflict: expected ${args.expectedRevision}, actual ${revision}`) }
    let before: Snapshot | undefined, authorization: SourceAuthorization | undefined
    if (sourceWrite || name === 'get_scene') {
      const identity = clients.verify(client)
      before = await snapshot()
      if (!before.documentEpoch || typeof before.transactionActive !== 'boolean') throw new SourceAccessError('SOURCE_PROTOCOL_REQUIRED')
      if (before.transactionActive) throw new SourceAccessError('SOURCE_EDITOR_BUSY')
      const scope = { clientId: identity.id, sessionId: session.id, documentEpoch: before.documentEpoch, revision: before.revision }
      if (name === 'get_scene') return { ...before, ...reads.issue(scope) }
      if (args.expectedRevision !== before.revision) throw new SourceAccessError('SOURCE_REVISION_CONFLICT')
      reads.consume(args.readToken, scope, name === 'apply_script_plan' ? args.planId : undefined)
      authorization = { documentEpoch: before.documentEpoch, expectedRevision: before.revision,
        authoring: { actor: { kind: 'agent', name: identity.label }, transactionId: randomUUID(), ...(args.requestId ? { requestId: args.requestId } : {}) },
        ...(name === 'load_project' ? { sourceMode: 'restore' } : name === 'import_asset' ? { sourceMode: 'import' } : {}) }
    }
    if (name === 'run_script') {
      const source = before!
      const generated = await runSafeScript(args.code, source.scene)
      clients.verify(client)
      const summary = { ...summarize(generated.scene), logs: generated.logs, commandCount: generated.commandCount,
        changeSummary: summarizeSourceChanges(source.scene, generated.scene) }
      if (args.dryRun) {
        const planId = randomUUID()
        if (state.plans.size >= 50) throw new Error('Too many uncommitted script plans')
        const access = reads.issue({ clientId: client!.id, sessionId: session.id, documentEpoch: source.documentEpoch, revision: source.revision }, planId)
        state.plans.set(planId, { clientId: client!.id, sessionId: session.id, documentEpoch: source.documentEpoch, revision: source.revision,
          ...generated, expiresAt: access.readTokenExpiresAtMs })
        return { planId, revision: source.revision, documentEpoch: source.documentEpoch, ...access, dryRun: true, ...summary }
      }
      const applied = generated.commandCount ? await ask(session, 'apply_scene', { scene: generated.scene, authoringHints: generated.authoringHints, expectedRevision: source.revision, label: 'MCP script' }, 30000, authorization) : { revision: source.revision }
      return { ...applied, ...summary }
    }
    if (name === 'apply_script_plan') {
      const plan = state.plans.get(args.planId)
      if (!plan || plan.sessionId !== session.id || plan.clientId !== client?.id || plan.expiresAt < Date.now()) throw new Error('Script plan expired or belongs to a different client/session')
      if (plan.documentEpoch !== before!.documentEpoch || plan.revision !== before!.revision) throw new SourceAccessError('SOURCE_REVISION_CONFLICT')
      const result = plan.commandCount ? await ask(session, 'apply_scene', { scene: plan.scene, authoringHints: plan.authoringHints, expectedRevision: plan.revision, label: 'MCP script plan' }, 30000, authorization) : { revision: plan.revision }
      state.plans.delete(args.planId)
      reads.revoke({ planId: args.planId })
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
      return ask(session, 'apply_scene', { scene: await loadProject(args.name), expectedRevision: before!.revision, label: 'Load MCP project' }, 30000, authorization)
    }
    if (['export_runtime', 'export_svg', 'export_sequence', 'render_audio_preview', 'export_audio'].includes(name)) {
      const exported = await ask(session, name, args, 120000)
      const data = Buffer.from(exported.data, 'base64')
      const { data: _data, extension: _extension, ...metadata } = exported
      return { ...metadata, ...await writeArtifact(args.name ?? 'animation-' + Date.now(), exported.extension, data, false, 'exports'), revision: exported.revision, warnings: exported.warnings ?? [] }
    }
    return ask(session, name, args, name === 'render_preview' ? 60000 : 30000, authorization)
  })
  session.tail = result
  if (requestKey) {
    session.results.set(requestKey, { hash, result })
    if (session.results.size > 64) session.results.delete(session.results.keys().next().value!)
  }
  try {
    const value = await result
    await audit({ client: client?.label ?? 'MCP read-only client', sessionId: session.id, tool: requestedName, revision: value?.revision, ok: true }).catch(() => {})
    return value
  } catch (error) {
    await audit({ client: client?.label ?? 'MCP read-only client', sessionId: session.id, tool: requestedName, ok: false }).catch(() => {})
    throw error
  }
}
