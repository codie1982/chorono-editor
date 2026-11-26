import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { compareRgbaPngs } from './png-rgba.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const editorUrl = process.env.CHORONO_EDITOR_URL ?? 'http://127.0.0.1:2010'
const outputDir = path.join(root, '.chorono/acceptance/fracture-bond-actions-2026-11-22')
const projectName = 'fracture-bond-actions-acceptance-2026-11-22'
const timelineId = 'fracture2-bond-actions'

if (!/^http:\/\/(127\.0\.0\.1|localhost):2010\/?$/.test(editorUrl)) {
  throw new Error('This acceptance harness is intentionally pinned to the isolated editor on port 2010.')
}

await mkdir(outputDir, { recursive: true })
const client = new Client({ name: 'fracture-bond-actions-live-acceptance', version: '2.1.0' })
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, 'dist/mcp/server.cjs')],
  cwd: root,
  env: { ...process.env, CHORONO_PROJECT_ROOT: root, CHORONO_EDITOR_URL: editorUrl },
})
await client.connect(transport)

/** Invoke one real MCP tool while retaining image blocks for visual proof. */
async function rawCall(name, arguments_ = {}) {
  const response = await client.callTool({ name, arguments: arguments_ }, undefined, { timeout: 130_000 })
  if (response.isError) throw new Error(`${name}: ${response.content[0]?.text ?? 'unknown failure'}`)
  return response
}

/** Parse the JSON text block returned by a native MCP tool. */
async function jsonCall(name, arguments_ = {}) {
  const response = await rawCall(name, arguments_)
  return JSON.parse(response.content.find(item => item.type === 'text')?.text ?? '{}')
}

const sourceGuardCache = new Map()
let sessionId

/** Discover source guards so the harness follows the running server contract. */
async function requiresReadToken(name) {
  if (!sourceGuardCache.has(name)) {
    const capability = await jsonCall('get_capabilities', { toolName: name })
    sourceGuardCache.set(name, capability.tool.inputSchema.required?.includes('readToken') === true)
  }
  return sourceGuardCache.get(name)
}

/** Scope a call to the clean editor and acquire a fresh one-use write token. */
async function call(name, arguments_ = {}) {
  const scoped = ['list_sessions', 'get_capabilities'].includes(name)
    ? { ...arguments_ }
    : { sessionId, ...arguments_ }
  if (await requiresReadToken(name) && scoped.readToken === undefined) {
    const read = await jsonCall('get_scene', { sessionId })
    scoped.expectedRevision = read.revision
    scoped.readToken = read.readToken
  }
  return jsonCall(name, scoped)
}

/** Author the fixture through QuickJS dry-run/apply without rerunning script code. */
async function applyScript(code) {
  const read = await call('get_scene')
  const plan = await jsonCall('run_script', {
    sessionId,
    code,
    dryRun: true,
    expectedRevision: read.revision,
    readToken: read.readToken,
  })
  assert(plan.planId && plan.readToken, 'Script planner did not return commit authority.')
  return jsonCall('apply_script_plan', {
    sessionId,
    planId: plan.planId,
    expectedRevision: plan.revision,
    readToken: plan.readToken,
  })
}

/** Poll one persistent Worker bake to a terminal preview state. */
async function waitForPreview(jobId) {
  let snapshot
  for (let attempt = 0; attempt < 400; attempt += 1) {
    snapshot = (await call('get_bake_job', { jobId })).bakeJob
    if (snapshot.status === 'preview-ready') return snapshot
    if (['failed', 'cancelled', 'stale'].includes(snapshot.status)) {
      throw new Error(`Bake job ended as ${snapshot.status}: ${snapshot.error ?? 'no detail'}`)
    }
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error(`Bake preview did not become ready: ${JSON.stringify(snapshot)}`)
}

/** Save one renderer PNG with metadata for later visual and pixel checks. */
async function render(fileName, timeMs) {
  const response = await rawCall('render_preview', {
    sessionId,
    timeMs,
    timelineIds: [timelineId],
    width: 900,
  })
  const image = response.content.find(item => item.type === 'image')
  const metadata = JSON.parse(response.content.find(item => item.type === 'text')?.text ?? '{}')
  assert(image?.data && image.mimeType === 'image/png', 'render_preview did not return a PNG.')
  const filePath = path.join(outputDir, fileName)
  await writeFile(filePath, Buffer.from(image.data, 'base64'))
  return { ...metadata, filePath }
}

try {
  const capabilities = await jsonCall('get_capabilities', { summary: true })
  const prepareCapability = await jsonCall('get_capabilities', { toolName: 'prepare_voronoi_fracture_bake' })
  const inspectCapability = await jsonCall('get_capabilities', { toolName: 'inspect_physics_bake' })
  const scripting = await client.readResource({ uri: 'chorono://scripting' })
  assert.equal(capabilities.version, '2.1.0')
  assert.match(JSON.stringify(prepareCapability), /forcedBreaks/)
  assert.match(JSON.stringify(prepareCapability), /damageResets/)
  assert.match(JSON.stringify(inspectCapability), /bond/i)
  assert(scripting.contents.some(item => item.text?.includes('SceneAPI 2.1.0')))

  const sessions = (await jsonCall('list_sessions')).sessions
  assert.equal(sessions.length, 1, 'Connect exactly one clean editor on port 2010.')
  sessionId = sessions[0].id

  await call('clear_scene')
  await applyScript(`
    scene.composition({id:'FRACTURE2 Bond Actions MCP Acceptance',width:900,height:500,durationMs:1600,frameRate:30,backgroundColor:'#101318'});
    scene.createTimeline({id:'fracture2-bond-actions',durationMs:1600});
    const source=scene.add('rect');source.set({name:'Bond Action Source'});source.pos=[350,70];source.size=[200,130];source.fill='#f97316';source.cornerRadius=0;
    const floor=scene.add('rect');floor.set({name:'Bond Action Floor'});floor.pos=[100,420];floor.size=[700,30];floor.fill='#475569';floor.cornerRadius=0;
  `)
  const authored = await call('get_scene')
  assert.equal(authored.scene.layers.length, 2)
  const source = authored.scene.layers.find(layer => layer.name === 'Bond Action Source')
  const floor = authored.scene.layers.find(layer => layer.name === 'Bond Action Floor')
  assert(source && floor)
  const commonBake = {
    sourceLayerId: source.id,
    staticLayerIds: [floor.id],
    timelineId,
    startTimeMs: 0,
    durationMs: 1600,
    fractureTimeMs: 300,
    fragmentCount: 8,
    seed: 20261122,
    generationId: 'fracture2-bond-actions-live',
    stepHz: 120,
    sampleFps: 30,
    pixelsPerMeter: 100,
    gravity: { x: 0, y: 9.81 },
    cluster: {
      defaults: {
        impulseStrength: 1_000_000,
        damageThreshold: 1_000_000,
        damageDecayPerSecond: 0,
        relativeNormalSpeedScale: 0,
        variation: 0,
        seed: 20261122,
      },
    },
  }

  const initialStarted = await call('prepare_voronoi_fracture_bake', commonBake)
  const initialReady = await waitForPreview(initialStarted.bakeJob.jobId)
  assert.equal(initialReady.report.execution, 'worker')
  assert(initialReady.report.bondCount > 0)
  await call('commit_bake_job', { jobId: initialReady.jobId })

  const initialScene = await call('get_scene')
  const initialRecord = initialScene.scene.physics?.rigidBakes?.[0]
  const initialCluster = initialRecord?.recipe.fractureClusters?.[0]
  const targetBond = initialCluster?.graph.bonds?.[0]
  assert(initialRecord && initialCluster && targetBond, 'Initial bonded graph was not persisted.')

  const replacementStarted = await call('prepare_voronoi_fracture_bake', {
    ...commonBake,
    replaceRecordId: initialRecord.id,
    cluster: {
      ...commonBake.cluster,
      overrides: [{
        fragmentAId: targetBond.fragmentAId,
        fragmentBId: targetBond.fragmentBId,
        unbreakable: true,
      }],
      damageResets: [{ bondId: targetBond.bondId, timeMs: 450, source: 'user' }],
      forcedBreaks: [{ bondId: targetBond.bondId, timeMs: 600, source: 'user' }],
    },
  })
  const replacementReady = await waitForPreview(replacementStarted.bakeJob.jobId)
  assert.equal(replacementReady.report.forcedBreakActionCount, 1)
  assert.equal(replacementReady.report.damageResetActionCount, 1)
  assert(replacementReady.report.bondBreakCount >= 1)

  const beforePreview = await call('preview_bake_job', { jobId: replacementReady.jobId, timeMs: 599 })
  const exactPreview = await call('preview_bake_job', { jobId: replacementReady.jobId, timeMs: 600 })
  assert.equal(beforePreview.preview.event.timeMs, 300)
  assert.equal(exactPreview.preview.event.timeMs, 300)

  await call('commit_bake_job', { jobId: replacementReady.jobId })
  const committed = await call('get_scene')
  const record = committed.scene.physics?.rigidBakes?.find(item => item.id === initialRecord.id)
  assert(record, 'Replacement did not retain the owned bake record.')
  assert.equal(committed.scene.physics.rigidBakes.length, 1)
  assert.equal(record.recipe.fractureClusters?.[0]?.forcedBreaks?.length, 1)
  assert.equal(record.recipe.fractureClusters?.[0]?.damageResets?.length, 1)

  const inspection = await call('inspect_physics_bake', { recordId: record.id })
  const bonded = inspection.bake.bondedCluster
  assert.equal(bonded.forcedBreakCount, 1)
  assert.equal(bonded.damageResetCount, 1)
  assert.equal(bonded.forcedBreaks[0].bondId, targetBond.bondId)
  assert.equal(bonded.damageResets[0].bondId, targetBond.bondId)
  const forcedEvent = bonded.breakEvents.find(event => event.bondId === targetBond.bondId)
  assert(forcedEvent, 'Forced bond event was not inspectable.')
  assert.equal(forcedEvent.reason, 'forced')
  assert(Math.abs(forcedEvent.timeMs - 600) < 1e-7)

  const before = await render('before-forced-break-599ms.png', 599)
  const exact = await render('forced-break-600ms.png', 600)
  const after = await render('after-forced-break-1000ms.png', 1000)
  const motionDiff = compareRgbaPngs(
    await readFile(before.filePath),
    await readFile(after.filePath),
  )
  assert(motionDiff.changedPixelCount > 0, 'The committed fracture did not change rendered pixels.')

  const validation = await call('validate_scene')
  assert.equal(validation.valid, true)
  assert.deepEqual(validation.errors ?? [], [])
  const saved = await call('save_project', { name: projectName, overwrite: true })
  const savedBytes = await readFile(saved.path)
  const report = {
    sessionId,
    revision: committed.revision,
    recordId: record.id,
    graphId: bonded.graphId,
    fragmentCount: bonded.fragmentCount,
    bondCount: bonded.bondCount,
    forcedBreakCount: bonded.forcedBreakCount,
    damageResetCount: bonded.damageResetCount,
    targetBond: {
      bondId: targetBond.bondId,
      fragmentAId: targetBond.fragmentAId,
      fragmentBId: targetBond.fragmentBId,
      unbreakable: true,
    },
    forcedEvent,
    replacement: {
      jobId: replacementReady.jobId,
      recipeHash: replacementReady.recipeHash,
      execution: replacementReady.report.execution,
    },
    previews: { before, exact, after, motionDiff },
    validation,
    saved: {
      ...saved,
      sha256: createHash('sha256').update(savedBytes).digest('hex'),
    },
  }
  await writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
} finally {
  await client.close()
}
