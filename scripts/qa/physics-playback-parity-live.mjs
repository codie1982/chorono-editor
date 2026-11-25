import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { compareRgbaPngs } from './png-rgba.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const editorUrl = process.env.CHORONO_EDITOR_URL ?? 'http://127.0.0.1:2010'
const outputDir = path.join(root, '.chorono/acceptance/physics-playback-parity-2026-11-21')
const projectName = 'physics-visual-matrix-panel-32-2026-11-21'

if (!/^http:\/\/(127\.0\.0\.1|localhost):2010\/?$/.test(editorUrl)) {
  throw new Error('This acceptance harness is intentionally pinned to the isolated editor on port 2010.')
}

await mkdir(outputDir, { recursive: true })
const client = new Client({ name: 'physics-playback-parity-live-acceptance', version: '1.0.0' })
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, 'dist/mcp/server.cjs')],
  cwd: root,
  env: { ...process.env, CHORONO_PROJECT_ROOT: root, CHORONO_EDITOR_URL: editorUrl },
})
await client.connect(transport)

/** Invoke the real stdio MCP transport and retain image blocks. */
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

/** Discover source guards without hard-coding mutation policy. */
async function requiresReadToken(name) {
  if (!sourceGuardCache.has(name)) {
    const capability = await jsonCall('get_capabilities', { toolName: name })
    sourceGuardCache.set(name, capability.tool.inputSchema.required?.includes('readToken') === true)
  }
  return sourceGuardCache.get(name)
}

/** Scope a call to the selected editor and authorize source mutations freshly. */
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

/** Author one clean fixture through dry-run/apply without rerunning generated code. */
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

/** Wait for a persistent Worker bake preview. */
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

/** Return PNG bytes and metadata for explicit or live viewport rendering. */
async function previewPng(arguments_) {
  const response = await rawCall('render_preview', { sessionId, width: 800, ...arguments_ })
  const image = response.content.find(item => item.type === 'image')
  const metadata = JSON.parse(response.content.find(item => item.type === 'text')?.text ?? '{}')
  assert(image?.data && image.mimeType === 'image/png', 'render_preview did not return PNG bytes.')
  return { bytes: Buffer.from(image.data, 'base64'), metadata }
}

/** Compare one explicit player frame with live scrub and built-in final render. */
async function compareFrame(scenario, timeMs, timelineId, runId, sequenceIndex, width) {
  const explicitValues = await call('evaluate_frame', { timeMs, timelineIds: [timelineId] })
  const explicit = await previewPng({ timeMs, timelineIds: [timelineId], width })

  await call('control_playback', { action: 'seek', timeMs, timelineId, timelineIds: [timelineId] })
  const runtime = await call('get_runtime')
  const liveValues = await call('evaluate_frame')
  const live = await previewPng({ width })

  assert.equal(runtime.currentTimeMs, timeMs)
  assert.deepEqual(liveValues.values, explicitValues.values)
  const scrubDiff = compareRgbaPngs(explicit.bytes, live.bytes)
  assert.equal(scrubDiff.changedPixelCount, 0, `Live scrub differs at ${timeMs} ms.`)

  const final = await call('render_2d', {
    name: `physics-parity-${scenario}-${runId}-${sequenceIndex}-${timeMs}`,
    intent: 'still',
    backend: 'builtin',
    timeMs,
    scale: 1,
    background: 'scene',
    timelineIds: [timelineId],
  })
  assert.equal(final.backend, 'builtin')
  assert.equal(final.artifact, 'png')
  const finalBytes = await readFile(final.path)
  const renderDiff = compareRgbaPngs(explicit.bytes, finalBytes)
  assert.equal(renderDiff.changedPixelCount, 0, `Built-in final render differs at ${timeMs} ms.`)

  await writeFile(path.join(outputDir, `${scenario}-${timeMs}ms.png`), explicit.bytes)
  return {
    timeMs,
    revision: explicit.metadata.revision,
    scrubDiff,
    renderDiff,
    runtime: { currentTimeMs: runtime.currentTimeMs, selectedTimelineId: runtime.selectedTimelineId },
    final: { path: final.path, sha256: final.sha256, bytes: final.bytes },
  }
}

/** Compare exact runtime-export tracks with committed source tracks. */
function assertRuntimeTrackParity(scene, runtime) {
  const sourceTracks = new Map(scene.timelines.flatMap(timeline => timeline.tracks.map(track => [track.target, track])))
  const runtimeTracks = new Map(runtime.timelines.flatMap(timeline => timeline.tracks.map(track => [track.target, track])))
  assert.equal(runtimeTracks.size, sourceTracks.size)
  let sourceKeyCount = 0
  let runtimeKeyCount = 0
  for (const [target, sourceTrack] of sourceTracks) {
    const runtimeTrack = runtimeTracks.get(target)
    assert(runtimeTrack, `Runtime export omitted ${target}.`)
    sourceKeyCount += sourceTrack.keyframes.length
    runtimeKeyCount += runtimeTrack.keyframes.length
    const keyTimes = [...sourceTrack.keyframes, ...runtimeTrack.keyframes].map(key => key.timeMs)
    const sampleTimes = new Set(keyTimes)
    const sortedTimes = [...new Set(keyTimes)].sort((left, right) => left - right)
    for (let index = 1; index < sortedTimes.length; index += 1) {
      sampleTimes.add((sortedTimes[index - 1] + sortedTimes[index]) / 2)
    }
    for (const timeMs of sampleTimes) {
      const sourceValue = evaluateNumericTrack(sourceTrack, timeMs)
      const runtimeValue = evaluateNumericTrack(runtimeTrack, timeMs)
      assert(Math.abs(runtimeValue - sourceValue) <= 1e-9, `Runtime export changed ${target} at ${timeMs} ms.`)
    }
  }
  return { trackCount: sourceTracks.size, sourceKeyCount, runtimeKeyCount }
}

/** Minimal independent evaluator for rigid bake tracks (linear/hold numeric keys). */
function evaluateNumericTrack(track, timeMs) {
  const keys = [...track.keyframes].sort((left, right) => left.timeMs - right.timeMs)
  assert(keys.length > 0, `Track ${track.target} has no keys.`)
  assert(keys.every(key => typeof key.value === 'number'), `Track ${track.target} is not numeric.`)
  if (timeMs <= keys[0].timeMs) return keys[0].value
  if (timeMs >= keys[keys.length - 1].timeMs) return keys[keys.length - 1].value
  let index = 1
  while (index < keys.length && timeMs >= keys[index].timeMs) index += 1
  const left = keys[index - 1]
  const right = keys[index]
  if (left.easing?.type === 'hold') return left.value
  assert.equal(left.easing?.type ?? 'linear', 'linear', `Unsupported bake easing on ${track.target}.`)
  const progress = (timeMs - left.timeMs) / (right.timeMs - left.timeMs)
  return left.value + (right.value - left.value) * progress
}

try {
  const capabilities = await jsonCall('get_capabilities', { summary: true })
  const playbackCapability = await jsonCall('get_capabilities', { toolName: 'control_playback' })
  const renderCapability = await jsonCall('get_capabilities', { toolName: 'render_2d' })
  const exportCapability = await jsonCall('get_capabilities', { toolName: 'export_runtime' })
  const scripting = await client.readResource({ uri: 'chorono://scripting' })
  assert.equal(capabilities.version, '2.1.0')
  assert.match(JSON.stringify(playbackCapability), /timelineIds/)
  assert.match(JSON.stringify(renderCapability), /builtin/)
  assert.match(JSON.stringify(exportCapability), /physics ownership recipes are omitted/)
  assert(scripting.contents.some(item => item.text?.includes('SceneAPI 2.1.0')))

  const sessions = (await jsonCall('list_sessions')).sessions
  assert.equal(sessions.length, 1, 'Connect exactly one editor on port 2010.')
  sessionId = sessions[0].id
  await call('load_project', { name: projectName })

  const source = await call('get_scene')
  const scene = source.scene
  const record = scene.physics?.rigidBakes?.[0]
  assert(record, 'Committed fracture bake is missing.')
  assert.equal(scene.assets.length, 1)
  assert.equal(scene.layers.length, 34)
  assert.equal(scene.timelines.length, 1)
  const timelineId = scene.timelines[0].id
  const event = record.recipe.fractureEvents?.[0]
  assert(event, 'Fracture event is missing.')
  const sourceBody = record.recipe.bodies.find(body => body.bodyId === event.sourceBodyId)
  const fragmentBody = record.recipe.bodies.find(body => body.bodyId === event.fragmentBodyIds[0])
  assert(sourceBody && fragmentBody)

  const before = await call('evaluate_frame', { timeMs: event.timeMs - 1, timelineIds: [timelineId] })
  const atEvent = await call('evaluate_frame', { timeMs: event.timeMs, timelineIds: [timelineId] })
  assert.equal(before.values[`layers.${sourceBody.layerId}.opacity`], 1)
  assert.equal(before.values[`layers.${fragmentBody.layerId}.opacity`], 0)
  assert.equal(atEvent.values[`layers.${sourceBody.layerId}.opacity`], 0)
  assert.equal(atEvent.values[`layers.${fragmentBody.layerId}.opacity`], 1)

  const runId = Date.now()
  const frameTimes = [0, event.timeMs - 1, event.timeMs, 1200, 2800, 400]
  const frames = []
  for (let index = 0; index < frameTimes.length; index += 1) {
    frames.push(await compareFrame('panel-32', frameTimes[index], timelineId, runId, index, scene.composition.width))
  }

  const runtimeExport = await call('export_runtime', { name: `physics-parity-${runId}` })
  const packaged = JSON.parse(await readFile(runtimeExport.path, 'utf8'))
  const runtime = packaged.runtime
  assert.equal(runtime.assets.length, scene.assets.length)
  assert.equal(runtime.layers.length, scene.layers.length)
  assert.equal(runtime.timelines.length, scene.timelines.length)
  assert.equal(runtime.initialState !== undefined, true)
  assert.equal('physics' in runtime, false)
  assert.equal('authoring' in runtime, false)
  assert.equal('editorGuides' in runtime, false)
  const runtimeTrackParity = assertRuntimeTrackParity(scene, runtime)

  const rotations = runtime.timelines.flatMap(timeline => timeline.tracks)
    .filter(track => track.target.endsWith('.transform.rotationDeg'))
    .flatMap(track => track.keyframes.map(key => Math.abs(Number(key.value))))
  const panelMaximumAbsoluteRotationDeg = Math.max(...rotations)

  const panelValidation = await call('validate_scene')
  assert.equal(panelValidation.valid, true)
  assert.deepEqual(panelValidation.errors ?? [], [])

  // Dedicated full-turn fixture: topology and rotation are independent acceptance claims.
  await call('clear_scene')
  await applyScript(`
    scene.composition({id:'Physics full-turn playback parity',width:400,height:300,durationMs:1000,frameRate:30,backgroundColor:'#111827'});
    scene.createTimeline({id:'full-turn',durationMs:1000});
    const spinner=scene.add('rect');spinner.set({name:'Full-turn Rigid Body'});spinner.pos=[170,120];spinner.size=[60,60];spinner.fill='#a78bfa';spinner.cornerRadius=0;
  `)
  const fullTurnSource = await call('get_scene')
  const spinner = fullTurnSource.scene.layers.find(layer => layer.name === 'Full-turn Rigid Body')
  assert(spinner)
  assert.equal(fullTurnSource.scene.physics?.rigidBakes?.length ?? 0, 0)
  const fullTurnStarted = await call('prepare_rigid_body_bake', {
    timelineId: 'full-turn',
    durationMs: 1000,
    stepHz: 120,
    sampleFps: 60,
    pixelsPerMeter: 100,
    gravity: { x: 0, y: 0 },
    bodies: [{
      layerId: spinner.id,
      motionType: 'dynamic',
      initialAngularVelocityDegPerSecond: 720,
      material: { friction: 0, restitution: 0, airFriction: 0 },
    }],
  })
  const fullTurnReady = await waitForPreview(fullTurnStarted.bakeJob.jobId)
  assert.equal(fullTurnReady.report.execution, 'worker')
  await call('commit_bake_job', { jobId: fullTurnReady.jobId })
  const fullTurnCommitted = await call('get_scene')
  assert.equal(fullTurnCommitted.scene.physics?.rigidBakes?.length, 1)
  const fullTurnFrames = []
  const fullTurnTimes = [0, 250, 500, 750, 1000, 250]
  for (let index = 0; index < fullTurnTimes.length; index += 1) {
    fullTurnFrames.push(await compareFrame('full-turn', fullTurnTimes[index], 'full-turn', runId, index, fullTurnCommitted.scene.composition.width))
  }
  const fullTurnRuntimeExport = await call('export_runtime', { name: `physics-full-turn-parity-${runId}` })
  const fullTurnRuntime = JSON.parse(await readFile(fullTurnRuntimeExport.path, 'utf8')).runtime
  const fullTurnTrackParity = assertRuntimeTrackParity(fullTurnCommitted.scene, fullTurnRuntime)
  const fullTurnRotations = fullTurnRuntime.timelines.flatMap(timeline => timeline.tracks)
    .filter(track => track.target.endsWith('.transform.rotationDeg'))
    .flatMap(track => track.keyframes.map(key => Math.abs(Number(key.value))))
  const maximumAbsoluteRotationDeg = Math.max(...fullTurnRotations)
  assert(maximumAbsoluteRotationDeg > 360, 'The dedicated fixture did not preserve unwrapped full-turn rotation.')
  const fullTurnValidation = await call('validate_scene')
  assert.equal(fullTurnValidation.valid, true)
  assert.deepEqual(fullTurnValidation.errors ?? [], [])
  const fullTurnSaved = await call('save_project', { name: 'physics-playback-parity-full-turn-2026-11-21', overwrite: true })
  await call('control_playback', { action: 'pause', timelineIds: [] })

  const report = {
    sessionId,
    revision: source.revision,
    projectName,
    timelineId,
    topologyEvent: { timeMs: event.timeMs, tick: event.tick, fragmentCount: event.fragmentBodyIds.length },
    panel32: {
      maximumAbsoluteRotationDeg: panelMaximumAbsoluteRotationDeg,
      frames,
      runtimeExport: {
        path: runtimeExport.path,
        sha256: runtimeExport.sha256,
        bytes: runtimeExport.bytes,
        assetCount: runtime.assets.length,
        layerCount: runtime.layers.length,
        ...runtimeTrackParity,
        physicsOmitted: !('physics' in runtime),
      },
      validation: panelValidation,
    },
    fullTurn: {
      worker: fullTurnReady.report.execution,
      maximumAbsoluteRotationDeg,
      frames: fullTurnFrames,
      runtimeExport: {
        path: fullTurnRuntimeExport.path,
        sha256: fullTurnRuntimeExport.sha256,
        bytes: fullTurnRuntimeExport.bytes,
        ...fullTurnTrackParity,
        physicsOmitted: !('physics' in fullTurnRuntime),
      },
      saved: fullTurnSaved,
      validation: fullTurnValidation,
    },
  }
  await writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
} finally {
  await client.close()
}
