import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const editorUrl = process.env.CHORONO_EDITOR_URL ?? 'http://127.0.0.1:2010'
const outputDir = path.join(root, '.chorono/acceptance/fracture-topology-collider-2026-11-21')
const projectName = 'fracture-topology-collider-acceptance-2026-11-21'

if (!/^http:\/\/(127\.0\.0\.1|localhost):2010\/?$/.test(editorUrl)) {
  throw new Error('This acceptance harness is intentionally pinned to the isolated editor on port 2010.')
}

await mkdir(outputDir, { recursive: true })
const client = new Client({ name: 'fracture-topology-collider-live-acceptance', version: '1.0.0' })
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, 'dist/mcp/server.cjs')],
  cwd: root,
  env: { ...process.env, CHORONO_PROJECT_ROOT: root, CHORONO_EDITOR_URL: editorUrl },
})
await client.connect(transport)

/** Parse one native result while preserving image blocks for raster evidence. */
async function callRaw(name, arguments_ = {}) {
  const reply = await client.callTool({ name, arguments: arguments_ }, undefined, { timeout: 130_000 })
  if (reply.isError) throw new Error(`${name}: ${reply.content[0]?.text ?? 'unknown failure'}`)
  return reply
}

/** Read one JSON text result from the actual MCP transport. */
async function call(name, arguments_ = {}) {
  const reply = await callRaw(name, arguments_)
  return JSON.parse(reply.content.find(item => item.type === 'text')?.text ?? '{}')
}

/** Persist a real renderer PNG and return its bounded metadata. */
async function renderFrame(sessionId, fileName, timeMs, timelineId) {
  const reply = await callRaw('render_preview', {
    sessionId,
    timeMs,
    timelineIds: [timelineId],
    width: 800,
  })
  const image = reply.content.find(item => item.type === 'image')
  const metadata = reply.content.find(item => item.type === 'text')
  assert(image?.data && image.mimeType === 'image/png', 'render_preview did not return a PNG')
  await writeFile(path.join(outputDir, fileName), Buffer.from(image.data, 'base64'))
  return JSON.parse(metadata?.text ?? '{}')
}

try {
  const capabilities = await call('get_capabilities', { summary: true })
  const inspectionCapability = await call('get_capabilities', { toolName: 'inspect_physics_bake' })
  const scripting = await client.readResource({ uri: 'chorono://scripting' })
  assert.equal(capabilities.version, '2.1.0')
  assert.match(JSON.stringify(inspectionCapability), /topology event/i)
  assert(scripting.contents.some(item => item.text?.includes('SceneAPI 2.1.0')))

  const sessions = (await call('list_sessions')).sessions
  assert.equal(sessions.length, 1, 'Connect exactly one editor on port 2010.')
  const sessionId = sessions[0].id
  const source = await call('get_scene', { sessionId })
  const records = source.scene.physics?.rigidBakes?.filter(record => record.recipe.fractureEvents?.length) ?? []
  assert.equal(records.length, 1, 'Acceptance scene must contain exactly one committed fracture bake.')
  const record = records[0]
  const event = record.recipe.fractureEvents[0]
  const eventTimeMs = record.recipe.startTimeMs + event.timeMs

  const inspection = await call('inspect_physics_bake', { sessionId, recordId: record.id })
  assert.deepEqual(inspection.bake.topologyEvent, {
    sourceBodyId: event.sourceBodyId,
    fragmentBodyIds: event.fragmentBodyIds,
    localTimeMs: event.timeMs,
    absoluteTimeMs: eventTimeMs,
    tick: event.tick,
  })
  assert.equal(inspection.bake.renderColliderQuality.status, 'pass')
  assert.equal(inspection.bake.renderColliderQuality.atEvent, true)
  assert.equal(inspection.bake.renderColliderQuality.renderPolygonCount, event.fragmentBodyIds.length)
  assert.equal(inspection.bake.renderColliderQuality.colliderPolygonCount, event.fragmentBodyIds.length)
  assert(inspection.bake.renderColliderQuality.maxBoundaryDeltaPx <= 0.01)

  const before = await renderFrame(sessionId, 'before-event.png', Math.max(0, eventTimeMs - 1), record.recipe.timelineId)
  const exact = await renderFrame(sessionId, 'exact-event.png', eventTimeMs, record.recipe.timelineId)
  const after = await renderFrame(sessionId, 'after-event.png', Math.min(record.recipe.durationMs, eventTimeMs + 300), record.recipe.timelineId)
  const validation = await call('validate_scene', { sessionId })
  assert.equal(validation.valid, true)
  assert.deepEqual(validation.warnings, [])

  const playback = await call('control_playback', {
    sessionId,
    action: 'seek',
    timeMs: eventTimeMs,
    timelineId: record.recipe.timelineId,
    timelineIds: [record.recipe.timelineId],
  })
  assert(Math.abs(playback.timeMs - eventTimeMs) <= 1e-6)
  const saved = await call('save_project', { sessionId, name: projectName })

  console.log(JSON.stringify({
    sessionId,
    revision: source.revision,
    recordId: record.id,
    topologyEvent: inspection.bake.topologyEvent,
    renderColliderQuality: inspection.bake.renderColliderQuality,
    previews: { before, exact, after },
    validation,
    playback,
    saved,
  }, null, 2))
} finally {
  await client.close()
}
