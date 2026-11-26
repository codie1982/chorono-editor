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
const outputDir = path.join(root, '.chorono/acceptance/recursive-fracture-2026-11-22')
const projectName = 'recursive-fracture-acceptance-2026-11-22'
const timelineId = 'fracture3-recursive'

if (!/^http:\/\/(127\.0\.0\.1|localhost):2010\/?$/.test(editorUrl)) {
  throw new Error('This acceptance harness is intentionally pinned to the isolated editor on port 2010.')
}

await mkdir(outputDir, { recursive: true })
const client = new Client({ name: 'recursive-fracture-live-acceptance', version: '2.1.0' })
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, 'dist/mcp/server.cjs')],
  cwd: root,
  env: { ...process.env, CHORONO_PROJECT_ROOT: root, CHORONO_EDITOR_URL: editorUrl },
})
await client.connect(transport)

async function rawCall(name, arguments_ = {}) {
  const response = await client.callTool({ name, arguments: arguments_ }, undefined, { timeout: 130_000 })
  if (response.isError) throw new Error(`${name}: ${response.content[0]?.text ?? 'unknown failure'}`)
  return response
}

async function jsonCall(name, arguments_ = {}) {
  const response = await rawCall(name, arguments_)
  return JSON.parse(response.content.find(item => item.type === 'text')?.text ?? '{}')
}

const sourceGuardCache = new Map()
let sessionId

async function requiresReadToken(name) {
  if (!sourceGuardCache.has(name)) {
    const capability = await jsonCall('get_capabilities', { toolName: name })
    sourceGuardCache.set(name, capability.tool.inputSchema.required?.includes('readToken') === true)
  }
  return sourceGuardCache.get(name)
}

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

function visibleDynamicCount(preview) {
  return preview.bodies.filter(body => body.motionType === 'dynamic' && body.visible).length
}

try {
  const capabilities = await jsonCall('get_capabilities', { summary: true })
  const prepareCapability = await jsonCall('get_capabilities', { toolName: 'prepare_voronoi_fracture_bake' })
  const inspectCapability = await jsonCall('get_capabilities', { toolName: 'inspect_physics_bake' })
  const scripting = await client.readResource({ uri: 'chorono://scripting' })
  assert.equal(capabilities.version, '2.1.0')
  assert.match(JSON.stringify(prepareCapability), /secondary/)
  assert.match(JSON.stringify(prepareCapability), /maxPortableBytes/)
  assert.match(JSON.stringify(inspectCapability), /recursive/i)
  assert(scripting.contents.some(item => item.text?.includes('SceneAPI 2.1.0')))

  const sessions = (await jsonCall('list_sessions')).sessions
  assert.equal(sessions.length, 1, 'Connect exactly one clean editor on port 2010.')
  sessionId = sessions[0].id

  await call('clear_scene')
  await applyScript(`
    scene.composition({id:'FRACTURE3 Recursive MCP Acceptance',width:900,height:500,durationMs:1800,frameRate:30,backgroundColor:'#101318'});
    scene.createTimeline({id:'fracture3-recursive',durationMs:1800});
    const source=scene.add('rect');source.set({name:'Recursive Source'});source.pos=[350,55];source.size=[220,150];source.fill='#d946ef';source.cornerRadius=0;
    const floor=scene.add('rect');floor.set({name:'Recursive Floor'});floor.pos=[100,425];floor.size=[700,30];floor.fill='#475569';floor.cornerRadius=0;
  `)
  const authored = await call('get_scene')
  const source = authored.scene.layers.find(layer => layer.name === 'Recursive Source')
  const floor = authored.scene.layers.find(layer => layer.name === 'Recursive Floor')
  assert(source && floor)

  const started = await call('prepare_voronoi_fracture_bake', {
    sourceLayerId: source.id,
    staticLayerIds: [floor.id],
    timelineId,
    startTimeMs: 0,
    durationMs: 1800,
    fractureTimeMs: 400,
    fragmentCount: 6,
    seed: 20261122,
    generationId: 'fracture3-recursive-live',
    stepHz: 120,
    sampleFps: 30,
    pixelsPerMeter: 100,
    gravity: { x: 0, y: 9.81 },
    secondary: {
      parentFragmentIndex: 2,
      fractureTimeMs: 800,
      fragmentCount: 4,
      seed: 20261123,
      generationId: 'fracture3-recursive-live-g1',
      budgets: {
        maxDepth: 1,
        maxGenerations: 2,
        maxFragments: 16,
        maxTriangles: 128,
        maxPortableBytes: 2 * 1024 * 1024,
      },
    },
  })
  const ready = await waitForPreview(started.bakeJob.jobId)
  assert.equal(ready.report.execution, 'worker')
  assert.equal(ready.generationCount, 2)
  assert.equal(ready.totalFragmentCount, 10)

  const preview399 = (await call('preview_bake_job', { jobId: ready.jobId, timeMs: 399 })).preview
  const preview600 = (await call('preview_bake_job', { jobId: ready.jobId, timeMs: 600 })).preview
  const preview800 = (await call('preview_bake_job', { jobId: ready.jobId, timeMs: 800 })).preview
  const preview1000 = (await call('preview_bake_job', { jobId: ready.jobId, timeMs: 1000 })).preview
  assert.equal(preview399.events.length, 2)
  assert.deepEqual(preview399.events.map(event => event.tick), [48, 96])
  assert.equal(visibleDynamicCount(preview399), 1)
  assert.equal(visibleDynamicCount(preview600), 6)
  assert.equal(visibleDynamicCount(preview800), 9)
  assert.equal(visibleDynamicCount(preview1000), 9)

  await call('commit_bake_job', { jobId: ready.jobId })
  const committed = await call('get_scene')
  const record = committed.scene.physics?.rigidBakes?.[0]
  assert(record, 'Recursive bake record was not persisted.')
  assert.equal(committed.scene.physics.rigidBakes.length, 1)
  assert.equal(committed.scene.physics.fractureGenerations.length, 2)
  assert.equal(record.fractureGenerations.length, 2)
  assert.equal(record.generatedLayers.length, 10)
  assert.equal(record.recipe.fractureEvents.length, 2)
  assert.equal(record.recipe.fractureHierarchy.usage.fragments, 10)

  const inspection = await call('inspect_physics_bake', { recordId: record.id })
  assert.equal(inspection.bake.ownershipState, 'current')
  assert.equal(inspection.bake.sourceState, 'current')
  assert.equal(inspection.bake.generationCount, 2)
  assert.equal(inspection.bake.topologyEvents.length, 2)
  assert.deepEqual(inspection.bake.topologyEvents.map(event => event.tick), [48, 96])
  assert.equal(inspection.bake.recursiveHierarchy.usage.fragments, 10)
  assert.equal(inspection.bake.recursiveHierarchy.usage.generations, 2)
  assert.equal(inspection.bake.recursiveHierarchy.entries[1].parentFragmentId, 'fracture3-recursive-live-fragment-2')

  const beforeRoot = await render('before-root-399ms.png', 399)
  const between = await render('between-events-600ms.png', 600)
  const atChild = await render('child-event-800ms.png', 800)
  const afterChild = await render('after-child-1000ms.png', 1000)
  const rootDiff = compareRgbaPngs(await readFile(beforeRoot.filePath), await readFile(between.filePath))
  const childDiff = compareRgbaPngs(await readFile(atChild.filePath), await readFile(afterChild.filePath))
  assert(rootDiff.changedPixelCount > 0, 'Root fracture did not change rendered pixels.')
  assert(childDiff.changedPixelCount > 0, 'Child fracture motion did not change rendered pixels.')

  const validation = await call('validate_scene')
  assert.equal(validation.valid, true)
  assert.deepEqual(validation.errors ?? [], [])
  const saved = await call('save_project', { name: projectName, overwrite: true })
  const savedBytes = await readFile(saved.path)
  const report = {
    sessionId,
    revision: committed.revision,
    recordId: record.id,
    rootGenerationId: inspection.bake.recursiveHierarchy.rootGenerationId,
    childGenerationId: inspection.bake.recursiveHierarchy.entries[1].generationId,
    topologyEvents: inspection.bake.topologyEvents,
    hierarchy: inspection.bake.recursiveHierarchy,
    job: {
      jobId: ready.jobId,
      recipeHash: ready.recipeHash,
      execution: ready.report.execution,
      sampleCount: ready.report.sampleCount,
      keyframeCount: ready.report.keyframeCount,
      generationCount: ready.generationCount,
      totalFragmentCount: ready.totalFragmentCount,
    },
    previews: {
      visibleDynamicCounts: {
        beforeRoot: visibleDynamicCount(preview399),
        betweenEvents: visibleDynamicCount(preview600),
        atChild: visibleDynamicCount(preview800),
        afterChild: visibleDynamicCount(preview1000),
      },
      beforeRoot, between, atChild, afterChild, rootDiff, childDiff,
    },
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
