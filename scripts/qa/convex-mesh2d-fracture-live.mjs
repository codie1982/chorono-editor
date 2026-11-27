import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const editorUrl = process.env.CHORONO_EDITOR_URL ?? 'http://127.0.0.1:2010'
const outputDir = path.join(root, '.chorono/acceptance/convex-mesh2d-fracture-2026-11-21')
const projectName = 'convex-mesh2d-fracture-acceptance-2026-11-21'

if (!/^http:\/\/(127\.0\.0\.1|localhost):2010\/?$/.test(editorUrl)) {
  throw new Error('This acceptance harness is intentionally pinned to the isolated editor on port 2010.')
}

await mkdir(outputDir, { recursive: true })
const client = new Client({ name: 'convex-mesh2d-fracture-live-acceptance', version: '1.0.0' })
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

let sessionId
const sourceGuardCache = new Map()

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
  assert(plan.planId && plan.readToken)
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
    timelineIds: ['convex-mesh2d'],
    width: 640,
  })
  const image = response.content.find(item => item.type === 'image')
  const metadata = JSON.parse(response.content.find(item => item.type === 'text')?.text ?? '{}')
  assert(image?.data && image.mimeType === 'image/png')
  await writeFile(path.join(outputDir, fileName), Buffer.from(image.data, 'base64'))
  return metadata
}

try {
  const capability = await jsonCall('get_capabilities', { toolName: 'prepare_voronoi_fracture_bake' })
  assert.match(JSON.stringify(capability), /fixed-topology Mesh2D/i)
  const sessions = (await jsonCall('list_sessions')).sessions
  assert.equal(sessions.length, 1, 'Connect exactly one editor on port 2010.')
  sessionId = sessions[0].id

  await call('clear_scene')
  await applyScript(`
    scene.composition({id:'Convex Mesh2D fracture acceptance',width:640,height:420,durationMs:1800,frameRate:30,backgroundColor:'#111827'});
    scene.createTimeline({id:'convex-mesh2d',durationMs:1800});
    const source=scene.add('rect');source.set({name:'Convex Mesh2D Source Shape'});source.pos=[230,70];source.size=[180,110];source.fill='#8b5cf6';source.cornerRadius=0;source.patch({hidden:true});
    const floor=scene.add('rect');floor.set({name:'Convex Mesh2D Floor'});floor.pos=[70,350];floor.size=[500,28];floor.fill='#64748b';floor.cornerRadius=0;
  `)
  const authored = await call('get_scene')
  const sourceShape = authored.scene.layers.find(layer => layer.name === 'Convex Mesh2D Source Shape')
  const floor = authored.scene.layers.find(layer => layer.name === 'Convex Mesh2D Floor')
  assert(sourceShape?.type === 'shape' && floor)

  await call('create_mesh2d_from_source', { sourceLayerId: sourceShape.id, flattenTolerance: 0.25 })
  const meshed = await call('get_scene')
  const mesh = meshed.scene.layers.find(layer => layer.type === 'mesh2d')
  assert(mesh?.mesh2d)

  const started = await call('prepare_voronoi_fracture_bake', {
    sourceLayerId: mesh.id,
    staticLayerIds: [floor.id],
    timelineId: 'convex-mesh2d',
    durationMs: 1800,
    fractureTimeMs: 400,
    fragmentCount: 10,
    seed: 20261121,
    generationId: 'convex-mesh2d-live',
    stepHz: 120,
    sampleFps: 30,
    gravity: { x: 0, y: 9.81 },
    initialAngularVelocityDegPerSecond: 30,
  })
  const ready = await waitForPreview(started.bakeJob.jobId)
  assert.equal(ready.report.execution, 'worker')
  await call('commit_bake_job', { jobId: ready.jobId })

  const committed = await call('get_scene')
  const record = committed.scene.physics?.rigidBakes?.[0]
  const generation = committed.scene.physics?.fractureGenerations?.[0]
  assert(record && generation)
  assert.equal(record.recipe.fractureAppearance?.kind, 'mesh2d')
  assert.equal(record.recipe.bodies[0].collider, 'convexPolygon')
  const fragments = committed.scene.layers.filter(layer => layer.id.startsWith('convex-mesh2d-live-fragment-'))
  assert.equal(fragments.length, 10)
  assert(fragments.every(layer => layer.type === 'mesh2d' && layer.mesh2d?.source.kind === 'fractureFragment'))
  assert(fragments.every(layer => layer.mesh2d.geometry.positions.length === layer.mesh2d.geometry.uvs.length))

  const before = await render('before-event.png', 399)
  const exact = await render('exact-event.png', 400)
  const settled = await render('settled.png', 1600)
  const inspection = await call('inspect_physics_bake', { recordId: record.id })
  assert.equal(inspection.bake.renderColliderQuality.status, 'pass')
  assert(inspection.bake.renderColliderQuality.maxBoundaryDeltaPx <= 0.01)
  const validation = await call('validate_scene')
  assert.equal(validation.valid, true)
  assert.deepEqual(validation.errors ?? [], [])
  const saved = await call('save_project', { name: projectName, overwrite: true })

  console.log(JSON.stringify({
    sessionId,
    recordId: record.id,
    source: {
      layerId: mesh.id,
      sourceKind: mesh.mesh2d.source.kind,
      sourceTriangles: mesh.mesh2d.geometry.topology.triangleIndices.length / 3,
      collider: record.recipe.bodies[0].collider,
    },
    worker: ready.report.execution,
    fragmentCount: generation.fragments.length,
    fragmentTriangles: fragments.reduce((sum, layer) => sum + layer.mesh2d.geometry.topology.triangleIndices.length / 3, 0),
    renderColliderQuality: inspection.bake.renderColliderQuality,
    previews: { before, exact, settled },
    validation,
    saved,
  }, null, 2))
} finally {
  await client.close()
}
