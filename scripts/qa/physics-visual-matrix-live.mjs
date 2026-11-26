import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const editorUrl = process.env.CHORONO_EDITOR_URL ?? 'http://127.0.0.1:2010'
const outputDir = path.join(root, '.chorono/acceptance/physics-visual-matrix-2026-11-21')
const sourceProjectName = 'image-fracture-uv-source-acceptance-2026-11-21'

if (!/^http:\/\/(127\.0\.0\.1|localhost):2010\/?$/.test(editorUrl)) {
  throw new Error('This acceptance harness is intentionally pinned to the isolated editor on port 2010.')
}

await mkdir(outputDir, { recursive: true })
const client = new Client({ name: 'physics-visual-matrix-live-acceptance', version: '1.0.0' })
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, 'dist/mcp/server.cjs')],
  cwd: root,
  env: { ...process.env, CHORONO_PROJECT_ROOT: root, CHORONO_EDITOR_URL: editorUrl },
})
await client.connect(transport)

/** Invoke the real stdio MCP transport and preserve image response blocks. */
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

/** Discover whether a source mutation needs a fresh one-use read token. */
async function requiresReadToken(name) {
  if (!sourceGuardCache.has(name)) {
    const capability = await jsonCall('get_capabilities', { toolName: name })
    sourceGuardCache.set(name, capability.tool.inputSchema.required?.includes('readToken') === true)
  }
  return sourceGuardCache.get(name)
}

/** Scope one tool call and authorize source mutation from the latest revision. */
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

/** Author a clean fixture through the isolated script planner without rerunning code. */
async function applyScript(code) {
  const read = await call('get_scene')
  const plan = await jsonCall('run_script', {
    sessionId,
    code,
    dryRun: true,
    expectedRevision: read.revision,
    readToken: read.readToken,
  })
  assert(plan.planId && plan.readToken, 'Script planner did not return a commit token.')
  return jsonCall('apply_script_plan', {
    sessionId,
    planId: plan.planId,
    expectedRevision: plan.revision,
    readToken: plan.readToken,
  })
}

/** Wait for one reviewed Worker job and surface terminal failures. */
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

/** Persist one real renderer frame for visual inspection. */
async function renderFrame(scenario, fileName, timeMs, timelineId) {
  const response = await rawCall('render_preview', {
    sessionId,
    timeMs,
    timelineIds: [timelineId],
    width: 800,
  })
  const image = response.content.find(item => item.type === 'image')
  const metadata = response.content.find(item => item.type === 'text')
  assert(image?.data && image.mimeType === 'image/png', 'render_preview did not return a PNG')
  const directory = path.join(outputDir, scenario)
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, fileName), Buffer.from(image.data, 'base64'))
  return JSON.parse(metadata?.text ?? '{}')
}

/** Validate and save one editable portable acceptance project. */
async function validateAndSave(name) {
  const validation = await call('validate_scene')
  assert.equal(validation.valid, true)
  assert.deepEqual(validation.errors ?? [], [])
  const saved = await call('save_project', { name, overwrite: true })
  return { validation, saved }
}

/** Return one requested body from a retained preview frame. */
function body(frame, layerId) {
  const found = frame.preview.bodies.find(candidate => candidate.layerId === layerId)
  assert(found, `Preview body for ${layerId} was not found.`)
  return found
}

try {
  const capabilities = await jsonCall('get_capabilities', { summary: true })
  const rigidCapability = await jsonCall('get_capabilities', { toolName: 'prepare_rigid_body_bake' })
  const fractureCapability = await jsonCall('get_capabilities', { toolName: 'prepare_voronoi_fracture_bake' })
  const scripting = await client.readResource({ uri: 'chorono://scripting' })
  assert.equal(capabilities.version, '2.1.0')
  assert.match(JSON.stringify(rigidCapability), /initialVelocityPxPerSecond/)
  assert.match(JSON.stringify(fractureCapability), /fragmentCount/)
  assert(scripting.contents.some(item => item.text?.includes('SceneAPI 2.1.0')))

  const sessions = (await jsonCall('list_sessions')).sessions
  assert.equal(sessions.length, 1, 'Connect exactly one editor on port 2010.')
  sessionId = sessions[0].id
  const report = { sessionId, scenarios: {} }

  // Matrix A: a full 32-fragment textured panel with atomic source→fragment topology.
  await call('load_project', { name: sourceProjectName })
  const panelSource = await call('get_scene')
  assert.equal(panelSource.scene.physics?.rigidBakes?.length ?? 0, 0, 'Panel source must start without a previous bake record.')
  const panelStarted = await call('prepare_voronoi_fracture_bake', {
    sourceLayerId: 'image_fracture_source',
    staticLayerIds: ['image_fracture_floor'],
    timelineId: 'image_fracture_uv_timeline',
    durationMs: 3000,
    fractureTimeMs: 400,
    stepHz: 120,
    sampleFps: 30,
    pixelsPerMeter: 100,
    gravity: { x: 0, y: 9.81 },
    fragmentCount: 32,
    seed: 20261121,
    generationId: 'visual-matrix-panel-32',
  })
  const panelReady = await waitForPreview(panelStarted.bakeJob.jobId)
  assert.equal(panelReady.report.execution, 'worker')
  assert.equal(panelReady.fragmentCount, 32)
  const panelBefore = await call('preview_bake_job', { jobId: panelReady.jobId, timeMs: 399 })
  const panelEvent = await call('preview_bake_job', { jobId: panelReady.jobId, timeMs: 400 })
  const panelAfter = await call('preview_bake_job', { jobId: panelReady.jobId, timeMs: 1200 })
  assert.equal(panelBefore.preview.bodies.filter(item => item.visible).length, 2)
  assert.equal(panelEvent.preview.bodies.filter(item => item.visible).length, 33)
  assert.equal(panelAfter.preview.bodies.filter(item => item.visible).length, 33)
  await call('commit_bake_job', { jobId: panelReady.jobId })
  const panelScene = await call('get_scene')
  const panelRecord = panelScene.scene.physics?.rigidBakes?.[0]
  assert(panelRecord, 'The 32-fragment bake record was not committed.')
  const panelInspection = await call('inspect_physics_bake', { recordId: panelRecord.id })
  assert.equal(panelInspection.bake.topologyEvent.fragmentBodyIds.length, 32)
  assert.equal(panelInspection.bake.renderColliderQuality.status, 'pass')
  assert.equal(panelInspection.bake.renderColliderQuality.renderPolygonCount, 32)
  assert.equal(panelInspection.bake.renderColliderQuality.colliderPolygonCount, 32)
  const panelFrames = {
    before: await renderFrame('panel-32', 'before-399ms.png', 399, 'image_fracture_uv_timeline'),
    event: await renderFrame('panel-32', 'event-400ms.png', 400, 'image_fracture_uv_timeline'),
    collision: await renderFrame('panel-32', 'collision-1200ms.png', 1200, 'image_fracture_uv_timeline'),
    settled: await renderFrame('panel-32', 'settled-2800ms.png', 2800, 'image_fracture_uv_timeline'),
  }
  report.scenarios.panel32 = {
    job: panelReady,
    inspection: panelInspection.bake,
    frames: panelFrames,
    ...await validateAndSave('physics-visual-matrix-panel-32-2026-11-21'),
  }

  // Matrix B: a dynamic box visibly falls onto and slides along an inclined collider.
  await call('clear_scene')
  await applyScript(`
    scene.composition({id:'Physics inclined floor acceptance',width:800,height:450,durationMs:3000,frameRate:30,backgroundColor:'#111827'});
    scene.createTimeline({id:'inclined-floor',durationMs:3000});
    const box=scene.add('rect');box.set({name:'Inclined Dynamic Box'});box.pos=[340,45];box.size=[76,76];box.fill='#38bdf8';box.cornerRadius=0;
    const floor=scene.add('rect');floor.set({name:'Inclined Static Floor'});floor.pos=[115,320];floor.size=[570,30];floor.fill='#64748b';floor.cornerRadius=0;floor.patch({transform:{rotationDeg:-12}});
  `)
  const inclinedSource = await call('get_scene')
  const inclinedBox = inclinedSource.scene.layers.find(layer => layer.name === 'Inclined Dynamic Box')
  const inclinedFloor = inclinedSource.scene.layers.find(layer => layer.name === 'Inclined Static Floor')
  assert(inclinedBox && inclinedFloor)
  assert.equal(inclinedSource.scene.physics?.rigidBakes?.length ?? 0, 0, 'clear_scene retained a previous fracture bake.')
  assert.equal(inclinedFloor.transform.rotationDeg, -12)
  const inclinedStarted = await call('prepare_rigid_body_bake', {
    timelineId: 'inclined-floor',
    durationMs: 3000,
    stepHz: 120,
    sampleFps: 30,
    pixelsPerMeter: 100,
    gravity: { x: 0, y: 9.81 },
    bodies: [
      { layerId: inclinedBox.id, motionType: 'dynamic', material: { friction: 0.08, restitution: 0.1, airFriction: 0.002 } },
      { layerId: inclinedFloor.id, motionType: 'static', material: { friction: 0.08, restitution: 0.1 } },
    ],
  })
  const inclinedReady = await waitForPreview(inclinedStarted.bakeJob.jobId)
  const inclinedStart = await call('preview_bake_job', { jobId: inclinedReady.jobId, timeMs: 0 })
  const inclinedMid = await call('preview_bake_job', { jobId: inclinedReady.jobId, timeMs: 1400 })
  const inclinedEnd = await call('preview_bake_job', { jobId: inclinedReady.jobId, timeMs: 2800 })
  const inclinedStartBody = body(inclinedStart, inclinedBox.id)
  const inclinedEndBody = body(inclinedEnd, inclinedBox.id)
  assert(Math.abs(inclinedEndBody.centerX - inclinedStartBody.centerX) > 20, 'The box did not slide along the incline.')
  assert(Math.abs(inclinedEndBody.angleDeg - inclinedStartBody.angleDeg) > 5, 'The box did not rotate on the incline.')
  await call('commit_bake_job', { jobId: inclinedReady.jobId })
  const inclinedCommitted = await call('get_scene')
  assert.equal(inclinedCommitted.scene.physics?.rigidBakes?.length, 1, 'Inclined fixture must contain only its own rigid bake.')
  report.scenarios.inclinedFloor = {
    job: inclinedReady,
    preview: { start: inclinedStartBody, mid: body(inclinedMid, inclinedBox.id), end: inclinedEndBody },
    frames: {
      start: await renderFrame('inclined-floor', 'start-0ms.png', 0, 'inclined-floor'),
      contact: await renderFrame('inclined-floor', 'contact-1400ms.png', 1400, 'inclined-floor'),
      slide: await renderFrame('inclined-floor', 'slide-2800ms.png', 2800, 'inclined-floor'),
    },
    ...await validateAndSave('physics-visual-matrix-inclined-floor-2026-11-21'),
  }

  // Matrix C: a 24 px body crosses many pixels per second yet collides with a thin wall.
  await call('clear_scene')
  await applyScript(`
    scene.composition({id:'Physics high-speed small body acceptance',width:800,height:450,durationMs:1200,frameRate:30,backgroundColor:'#111827'});
    scene.createTimeline({id:'high-speed-small-body',durationMs:1200});
    const chip=scene.add('rect');chip.set({name:'High-speed Small Body'});chip.pos=[80,210];chip.size=[24,24];chip.fill='#fbbf24';chip.cornerRadius=0;
    const wall=scene.add('rect');wall.set({name:'Thin Static Wall'});wall.pos=[520,70];wall.size=[28,310];wall.fill='#64748b';wall.cornerRadius=0;
  `)
  const speedSource = await call('get_scene')
  const chip = speedSource.scene.layers.find(layer => layer.name === 'High-speed Small Body')
  const wall = speedSource.scene.layers.find(layer => layer.name === 'Thin Static Wall')
  assert(chip && wall)
  assert.equal(speedSource.scene.physics?.rigidBakes?.length ?? 0, 0, 'clear_scene retained the inclined-floor bake.')
  const speedStarted = await call('prepare_rigid_body_bake', {
    timelineId: 'high-speed-small-body',
    durationMs: 1200,
    stepHz: 120,
    sampleFps: 60,
    pixelsPerMeter: 100,
    gravity: { x: 0, y: 0 },
    bodies: [
      {
        layerId: chip.id,
        motionType: 'dynamic',
        initialVelocityPxPerSecond: { x: 1200, y: 0 },
        material: { friction: 0, restitution: 0.7, airFriction: 0 },
      },
      { layerId: wall.id, motionType: 'static', material: { friction: 0, restitution: 0.7 } },
    ],
  })
  const speedReady = await waitForPreview(speedStarted.bakeJob.jobId)
  const speedStart = await call('preview_bake_job', { jobId: speedReady.jobId, timeMs: 0 })
  const speedNearWall = await call('preview_bake_job', { jobId: speedReady.jobId, timeMs: 350 })
  const speedAfter = await call('preview_bake_job', { jobId: speedReady.jobId, timeMs: 800 })
  const startChip = body(speedStart, chip.id)
  const nearWallChip = body(speedNearWall, chip.id)
  const afterChip = body(speedAfter, chip.id)
  assert(nearWallChip.centerX > startChip.centerX + 300, 'The small body did not approach the wall at high speed.')
  assert(afterChip.centerX < nearWallChip.centerX - 100, 'The small body did not rebound from the wall.')
  assert(nearWallChip.centerX < wall.transform.x + wall.size.width, 'The small body tunneled through the wall.')
  await call('commit_bake_job', { jobId: speedReady.jobId })
  const speedCommitted = await call('get_scene')
  assert.equal(speedCommitted.scene.physics?.rigidBakes?.length, 1, 'High-speed fixture must contain only its own rigid bake.')
  report.scenarios.highSpeedSmallBody = {
    job: speedReady,
    preview: { start: startChip, nearWall: nearWallChip, after: afterChip },
    frames: {
      start: await renderFrame('high-speed-small-body', 'start-0ms.png', 0, 'high-speed-small-body'),
      nearWall: await renderFrame('high-speed-small-body', 'near-wall-350ms.png', 350, 'high-speed-small-body'),
      rebound: await renderFrame('high-speed-small-body', 'rebound-800ms.png', 800, 'high-speed-small-body'),
    },
    ...await validateAndSave('physics-visual-matrix-high-speed-small-body-2026-11-21'),
  }

  await writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
} finally {
  await client.close()
}
