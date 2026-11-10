import path from 'node:path'
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

// Isolated real STDIO + browser authoring acceptance. After READY, change the
// named clock through UI to 09:05 and create manual-edit.done in the output dir.
// No model-generated script is evaluated in Node; only the QuickJS bridge runs it.
const [directory, target] = process.argv.slice(2)
const root = path.resolve(directory ?? ''), output = path.resolve(target ?? 'artifacts/validation/authoring-provenance-20261110/browser')
assert(root.startsWith('/private/tmp/chorono-e12-validation-'), 'Isolated source snapshot required')
await mkdir(output, { recursive: true })
const client = new Client({ name: 'Hermes acceptance', version: '1.0.0' })
const report = { passed: false, checks: [] }, stamp = Date.now()
let scope = {}
const authority = read => ({ expectedRevision: read.revision, readToken: read.readToken })
const field = (scene, id, path) => scene.authoring?.records[JSON.stringify(['layer', id])]?.fields[JSON.stringify(path)]
const record = (scene, id) => scene.authoring?.records[JSON.stringify(['layer', id])]

/** Exact raw call; rejection paths never refresh authorization. */
async function raw(name, args = {}) { return client.callTool({ name, arguments: { ...scope, ...args } }, undefined, { timeout: 130000 }) }
/** Successful JSON tool call; authentication data is never logged. */
async function call(name, args = {}) {
  const result = await raw(name, args)
  assert(!result.isError, `${name}: ${result.content.find(item => item.type === 'text')?.text}`)
  return JSON.parse(result.content[0].text)
}
/** Disposable QA's explicit fresh-read path for known narrow operations. */
async function mutate(name, args = {}) {
  const read = await call('get_scene')
  return call(name, { ...args, ...authority(read) })
}

try {
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'dist/mcp/server.cjs')],
    cwd: root, stderr: 'pipe', env: { ...process.env, CHORONO_PROJECT_ROOT: root,
      CHORONO_EDITOR_URL: 'http://127.0.0.1:2002', CHORONO_MCP_TOOL_PROFILE: 'standard' } }))
  const sessions = (await call('list_sessions')).sessions
  assert.equal(sessions.length, 1); scope = { sessionId: sessions[0].id }
  const capability = await call('get_capabilities', { summary: true })
  assert.equal(capability.version, '2.1.0'); assert.equal(capability.sourceEditing.authoring.version, 1)
  let read = await call('get_scene')
  const clock = read.scene.layers.find(layer => layer.name === 'Human clock setting')
  assert(clock, 'Run mcp-catalog-editor-check first')
  assert.equal(record(read.scene, clock.id).createdBy.actor.kind, 'agent')
  await mutate('update_layer', { layerId: clock.id, text: '10:10' })
  const stale = await call('get_scene')
  console.log(JSON.stringify({ readyForManualEdit: true, layerName: clock.name, expectedText: '09:05' }))
  const deadline = Date.now() + 300000
  while (!(await access(path.join(output, 'manual-edit.done')).then(() => true, () => false))) {
    assert(Date.now() < deadline, 'Timed out waiting for manual UI edit'); await delay(500)
  }
  const denied = await raw('update_layer', { layerId: clock.id, text: '10:10', ...authority(stale) })
  assert(denied.isError); assert.equal(denied.structuredContent.error.code, 'SOURCE_REVISION_CONFLICT')
  const manual = await call('get_scene')
  assert.equal(manual.scene.layers.find(layer => layer.id === clock.id).text.value, '09:05')
  assert.equal(field(manual.scene, clock.id, ['text', 'value']).actor.kind, 'human')
  assert.equal(record(manual.scene, clock.id).createdBy.actor.kind, 'agent')
  assert.deepEqual(manual.scene.timelines, stale.scene.timelines)
  report.checks.push('Browser manual field is human; agent creation, key identities and easing remain intact; stale edit rejected')
  await mutate('update_layer', { layerId: clock.id, textColor: '#fbbf24' })
  const after = await call('get_scene')
  assert.equal(field(after.scene, clock.id, ['text', 'value']).actor.kind, 'human')
  assert.deepEqual(field(after.scene, clock.id, ['text', 'color']).actor, { kind: 'agent', name: 'Hermes acceptance' })
  assert.equal(after.scene.layers.find(layer => layer.id === clock.id).text.value, '09:05')
  assert((await call('get_layer', { layerId: clock.id })).content.includes('mixed'))
  await mutate('undo'); assert.deepEqual((await call('get_scene')).scene, manual.scene)
  await mutate('redo'); assert.deepEqual((await call('get_scene')).scene, after.scene)
  report.checks.push('Fresh narrow edit retains human text writer; undo/redo restores exact source and attribution')
  const prepared = await mutate('run_script', { code: `scene.clone(scene.get('${clock.id}'),1,{offsetX:40})`, dryRun: true })
  await call('apply_script_plan', { planId: prepared.planId, expectedRevision: prepared.revision, readToken: prepared.readToken })
  const copied = await call('get_scene'), clone = copied.scene.layers.find(layer => !after.scene.layers.some(old => old.id === layer.id))
  assert.equal(field(copied.scene, clone.id, ['text', 'value']).actor.kind, 'human')
  assert.equal(record(copied.scene, clone.id).createdBy.actor.kind, 'agent')
  await mutate('undo'); assert.deepEqual((await call('get_scene')).scene, after.scene)
  report.checks.push('Prepared script copy inherits human field attribution independently of new agent creation')
  const saved = await call('save_project', { name: `e12-authoring-${stamp}` })
  const portable = JSON.parse(await readFile(saved.path, 'utf8'))
  assert.deepEqual(portable.authoring, after.scene.authoring)
  await mutate('load_project', { name: path.basename(saved.path) })
  assert.deepEqual((await call('get_scene')).scene, portable)
  const runtime = await call('export_runtime', { name: `e12-runtime-${stamp}` })
  const pkg = JSON.parse(await readFile(runtime.path, 'utf8'))
  assert(!Object.hasOwn(pkg.runtime, 'authoring')); assert(!JSON.stringify(pkg).includes('createdBy'))
  assert.deepEqual((await call('get_scene')).scene.authoring, portable.authoring)
  report.checks.push('Portable save/load preserves exact ledger; real runtime artifact omits it without modifying source')
  const rendered = await raw('render_preview', { timeMs: 500, timelineIds: ['qa'], width: 640 })
  assert(!rendered.isError)
  const image = rendered.content.find(item => item.type === 'image')
  await writeFile(path.join(output, 'authoring-preview.png'), Buffer.from(image.data, 'base64'))
  report.savedProject = saved.path; report.runtimeExport = runtime.path; report.sessionId = scope.sessionId; report.passed = true
  await writeFile(path.join(output, 'authoring-result.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report))
} finally { await client.close() }
