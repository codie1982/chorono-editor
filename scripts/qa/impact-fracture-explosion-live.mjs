import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { compareRgbaPngs } from './png-rgba.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const mode = process.argv[2] ?? 'setup'
const sourceProjectName = 'image-fracture-uv-source-acceptance-2026-11-21'
const acceptedProjectName = 'impact-explosion-fracture-acceptance-2026-11-21'
const outputDir = path.join(root, '.chorono/acceptance/impact-explosion-fracture-2026-11-21')
const editorUrl = process.env.CHORONO_EDITOR_URL ?? 'http://127.0.0.1:2010'

if (!['setup', 'accept'].includes(mode)) throw new Error('Use setup or accept.')
if (!/^http:\/\/(127\.0\.0\.1|localhost):2010\/?$/.test(editorUrl)) {
  throw new Error('This acceptance harness is intentionally pinned to the isolated editor on port 2010.')
}

await mkdir(outputDir, { recursive: true })
const client = new Client({ name: 'impact-explosion-fracture-live-acceptance', version: '1.0.0' })
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, 'dist/mcp/server.cjs')],
  cwd: root,
  env: { ...process.env, CHORONO_PROJECT_ROOT: root, CHORONO_EDITOR_URL: editorUrl },
})
await client.connect(transport)

/** Parse one text tool result while preserving image blocks for previews. */
async function rawCall(name, arguments_ = {}) {
  const result = await client.callTool({ name, arguments: arguments_ }, undefined, { timeout: 130_000 })
  if (result.isError) throw new Error(`${name}: ${result.content[0]?.text ?? 'unknown failure'}`)
  if (name === 'render_preview') return result
  return JSON.parse(result.content[0]?.text ?? '{}')
}

const sourceGuardCache = new Map()

/** Discover source authorization requirements from the actual connected server. */
async function requiresReadToken(name) {
  if (!sourceGuardCache.has(name)) {
    const capability = await rawCall('get_capabilities', { toolName: name })
    sourceGuardCache.set(name, capability.tool.inputSchema.required?.includes('readToken') === true)
  }
  return sourceGuardCache.get(name)
}

let sessionId

/** Scope every editor operation and acquire a fresh one-use write token. */
async function call(name, arguments_ = {}) {
  const scoped = ['list_sessions', 'get_capabilities'].includes(name)
    ? { ...arguments_ }
    : { sessionId, ...arguments_ }
  if (await requiresReadToken(name) && scoped.readToken === undefined) {
    const read = await rawCall('get_scene', { sessionId })
    scoped.expectedRevision = read.revision
    scoped.readToken = read.readToken
  }
  return rawCall(name, scoped)
}

/** Save one real renderer PNG and return its metadata. */
async function writePreview(fileName, options) {
  const preview = await call('render_preview', options)
  const image = preview.content.find(item => item.type === 'image')
  const metadata = preview.content.find(item => item.type === 'text')
  assert(image?.data && image.mimeType === 'image/png', 'render_preview did not return a PNG')
  await writeFile(path.join(outputDir, fileName), Buffer.from(image.data, 'base64'))
  return metadata?.text ? JSON.parse(metadata.text) : {}
}

/** Poll one persistent job without hiding terminal failure states. */
async function waitForPreview(jobId) {
  let snapshot
  for (let attempt = 0; attempt < 300; attempt += 1) {
    snapshot = (await call('get_bake_job', { jobId })).bakeJob
    if (snapshot.status === 'preview-ready') return snapshot
    if (['failed', 'cancelled', 'stale'].includes(snapshot.status)) {
      throw new Error(`Bake job ended as ${snapshot.status}: ${snapshot.error ?? 'no detail'}`)
    }
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error(`Bake preview did not become ready: ${JSON.stringify(snapshot)}`)
}

try {
  const capabilities = await rawCall('get_capabilities', { summary: true })
  const fractureTool = await rawCall('get_capabilities', { toolName: 'prepare_voronoi_fracture_bake' })
  const scripting = await client.readResource({ uri: 'chorono://scripting' })
  assert.equal(capabilities.version, '2.1.0')
  assert.match(JSON.stringify(fractureTool), /impact/i)
  assert.match(JSON.stringify(fractureTool), /explosion/i)
  assert(scripting.contents.some(item => item.text?.includes('SceneAPI 2.1.0')))

  const sessions = (await rawCall('list_sessions')).sessions
  assert.equal(sessions.length, 1, 'Connect exactly one editor on port 2010.')
  sessionId = sessions[0].id

  if (mode === 'setup') {
    await call('load_project', { name: sourceProjectName })
    await new Promise(resolve => setTimeout(resolve, 750))
    const current = await call('get_scene')
    assert.equal(current.scene.layers.length, 2)
    assert.equal(current.scene.physics?.rigidBakes?.length ?? 0, 0)
    const validation = await call('validate_scene')
    assert.equal(validation.valid, true)
    const preview = await writePreview('clean-source-0ms.png', {
      timeMs: 0,
      timelineIds: ['image_fracture_uv_timeline'],
      width: 800,
    })
    console.log(JSON.stringify({ mode, sessionId, revision: current.revision, validation, preview }, null, 2))
  } else {
    const source = await call('get_scene')
    assert.equal(source.scene.layers.length, 2, 'Acceptance must start from the clean two-layer source project.')
    const started = await call('prepare_voronoi_fracture_bake', {
      sourceLayerId: 'image_fracture_source',
      staticLayerIds: ['image_fracture_floor'],
      timelineId: 'image_fracture_uv_timeline',
      startTimeMs: 0,
      durationMs: 3000,
      stepHz: 120,
      sampleFps: 30,
      pixelsPerMeter: 100,
      gravity: { x: 0, y: 9.81 },
      fractureTrigger: {
        kind: 'impact',
        minimumRelativeNormalSpeedPxPerSecond: 100,
        colliderLayerIds: ['image_fracture_floor'],
      },
      explosion: {
        centerLocalOffsetPx: { x: 0, y: 0 },
        radialVelocityPxPerSecond: 180,
        directionDeg: 270,
        directionalVelocityPxPerSecond: 20,
        spinVelocityDegPerSecond: 180,
        variation: 0.15,
        seed: 20261121,
      },
      fragmentCount: 16,
      seed: 20261121,
      generationId: 'impact-explosion-20261121',
    })
    const ready = await waitForPreview(started.bakeJob.jobId)
    assert.equal(ready.fragmentCount, 16)
    assert.equal(ready.report.execution, 'worker')
    assert.equal(ready.recipeHash, ready.report.recipeHash)

    const eventPreview = await call('preview_bake_job', { jobId: ready.jobId })
    const eventTimeMs = eventPreview.preview.event.timeMs
    assert(eventTimeMs > 0 && eventTimeMs < 3000)
    const beforePreview = await call('preview_bake_job', {
      jobId: ready.jobId,
      timeMs: Math.max(0, eventTimeMs - 1),
    })
    const afterPreview = await call('preview_bake_job', {
      jobId: ready.jobId,
      timeMs: Math.min(3000, eventTimeMs + 300),
    })
    assert.equal(beforePreview.preview.bodies.filter(body => body.visible).length, 2)
    assert.equal(afterPreview.preview.bodies.filter(body => body.visible).length, 17)

    await call('commit_bake_job', { jobId: ready.jobId })
    const committed = await call('get_scene')
    const record = committed.scene.physics?.rigidBakes?.[0]
    const event = record?.recipe.fractureEvents?.[0]
    assert(record && event, 'Committed fracture provenance is missing.')
    assert.deepEqual(event.trigger, {
      kind: 'impact',
      minimumRelativeNormalSpeedPxPerSecond: 100,
      colliderBodyIds: ['rigid:image_fracture_floor'],
    })
    assert.equal(event.realization?.kind, 'impact')
    assert.equal(event.realization.contactBodyId, 'rigid:image_fracture_floor')
    assert(event.realization.relativeNormalSpeedPxPerSecond >= 100)
    assert.equal(event.timeMs, eventTimeMs)
    assert.equal(record.recipe.recipeHash, ready.recipeHash)
    assert.deepEqual(event.explosion, {
      centerLocalOffsetPx: { x: 0, y: 0 },
      radialVelocityPxPerSecond: 180,
      directionDeg: 270,
      directionalVelocityPxPerSecond: 20,
      spinVelocityDegPerSecond: 180,
      variation: 0.15,
      seed: 20261121,
    })

    const previewTimes = [Math.max(0, eventTimeMs - 1), eventTimeMs, Math.min(3000, eventTimeMs + 300)]
    const previewNames = ['before-impact.png', 'impact-event.png', 'after-explosion.png']
    const previews = []
    for (let index = 0; index < previewTimes.length; index += 1) {
      previews.push(await writePreview(previewNames[index], {
        timeMs: previewTimes[index],
        timelineIds: ['image_fracture_uv_timeline'],
        width: 800,
      }))
    }
    const motionDiff = compareRgbaPngs(
      await readFile(path.join(outputDir, 'impact-event.png')),
      await readFile(path.join(outputDir, 'after-explosion.png')),
    )
    assert(motionDiff.changedPixelCount > 0, 'Explosion preview did not change rendered pixels after activation.')

    const validation = await call('validate_scene')
    assert.equal(validation.valid, true)
    assert.deepEqual(validation.errors ?? [], [])
    const saved = await call('save_project', { name: acceptedProjectName, overwrite: true })
    const bytes = await readFile(saved.path)
    const report = {
      mode,
      sessionId,
      revision: committed.revision,
      job: ready,
      recipeHash: record.recipe.recipeHash,
      event,
      previewTimes,
      previews,
      motionDiff,
      validation,
      savedPath: saved.path,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    }
    await writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
    console.log(JSON.stringify(report, null, 2))
  }
} finally {
  await client.close()
}
