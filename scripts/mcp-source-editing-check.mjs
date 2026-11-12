import path from 'node:path'
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

// Real STDIO/browser acceptance. Only an isolated port-2002 source snapshot is
// allowed. Model-authored code runs in QuickJS, never in Node. After READY, edit
// the named clock through browser UI to 09:05, then create manual-edit.done in
// the output directory. No token or private connection credential is logged.
const [directory, target] = process.argv.slice(2)
const root = path.resolve(directory ?? ''), output = path.resolve(target ?? 'artifacts/validation/mcp-source-editing-20261110/browser')
assert(root.startsWith('/private/tmp/chorono-e11-validation-'), 'Isolated source snapshot required')
await mkdir(output, { recursive: true })
const clients = [0, 1].map(() => new Client({ name: 'same-agent-name', version: '1.0.0' }))
const stamp = Date.now(), report = { passed: false, checks: [] }
const authority = read => ({ expectedRevision: read.revision, readToken: read.readToken })

/** Raw source calls deliberately never auto-refresh source authority. */
async function raw(index, name, args = {}) {
  return clients[index].callTool({ name, arguments: args }, undefined, { timeout: 130000 })
}
/** A successful JSON reply; rendered images are handled separately. */
async function call(index, name, args = {}) {
  const result = await raw(index, name, args)
  assert(!result.isError, `${name}: ${result.content.find(item => item.type === 'text')?.text}`)
  return JSON.parse(result.content[0].text)
}
/** Assert structured credential-free failure without recording caller args. */
async function reject(index, name, args, code) {
  const result = await raw(index, name, args)
  assert(result.isError, `${name} must reject ${code}`)
  assert.equal(result.structuredContent.error.code, code)
}

try {
  for (const client of clients) await client.connect(new StdioClientTransport({ command: process.execPath,
    args: [path.join(root, 'dist/mcp/server.cjs')], cwd: root, stderr: 'pipe', env: {
      ...process.env, CHORONO_PROJECT_ROOT: root, CHORONO_EDITOR_URL: 'http://127.0.0.1:2002',
      CHORONO_MCP_TOOL_PROFILE: 'standard',
    } }))
  const sessions = (await call(0, 'list_sessions')).sessions
  assert.equal(sessions.length, 1, 'Connect one isolated test editor')
  const sessionId = sessions[0].id, scope = { sessionId }
  let read = await call(0, 'get_scene', scope)
  const clock = read.scene.layers.find(layer => layer.name === 'Human clock setting')
  assert(clock, 'Run mcp-catalog-editor-check.mjs first')
  await call(0, 'update_layer', { ...scope, layerId: clock.id, text: '10:10', ...authority(read) })
  // Prepare the stale payload before the real browser's manual edit.
  const stale = await call(0, 'get_scene', scope)
  await reject(0, 'update_layer', { ...scope, layerId: clock.id, text: 'wrong' }, 'EXPECTED_REVISION_REQUIRED')
  await reject(0, 'update_layer', { ...scope, layerId: clock.id, text: 'wrong', expectedRevision: stale.revision }, 'SOURCE_READ_REQUIRED')
  await reject(1, 'update_layer', { ...scope, layerId: clock.id, text: 'wrong', ...authority(stale) }, 'SOURCE_READ_SCOPE')
  console.log(JSON.stringify({ readyForManualEdit: true, layerName: clock.name, expectedText: '09:05' }))
  const deadline = Date.now() + 300000
  while (true) {
    if (await access(path.join(output, 'manual-edit.done')).then(() => true, () => false)) break
    assert(Date.now() < deadline, 'Timed out waiting for browser manual edit')
    await delay(500)
  }
  await reject(0, 'update_layer', { ...scope, layerId: clock.id, text: '10:10', textColor: '#ff0000', ...authority(stale) }, 'SOURCE_REVISION_CONFLICT')
  read = await call(0, 'get_scene', scope)
  assert.equal(read.scene.layers.find(layer => layer.id === clock.id).text.value, '09:05')
  assert.deepEqual(read.scene.timelines, stale.scene.timelines)
  assert.deepEqual(read.scene.layers.filter(layer => layer.id !== clock.id), stale.scene.layers.filter(layer => layer.id !== clock.id))
  report.checks.push('Real browser manual 09:05 survives stale write; other layers and animation data unchanged')
  const args = { ...scope, layerId: clock.id, textColor: '#22c55e', ...authority(read), requestId: `color-${stamp}` }
  const changed = await call(0, 'update_layer', args)
  assert(changed.changeSummary.changedPaths.includes(`layers.${clock.id}.text.color`))
  assert.deepEqual(await call(0, 'update_layer', args), changed)
  const after = await call(0, 'get_scene', scope)
  assert.equal(after.revision, changed.revision)
  assert.equal(after.scene.layers.find(layer => layer.id === clock.id).text.value, '09:05')
  const other = await call(1, 'get_scene', scope)
  const otherResult = await call(1, 'update_layer', { ...scope, layerId: clock.id, textColor: '#38bdf8', ...authority(other), requestId: args.requestId })
  assert(otherResult.revision > changed.revision)
  report.checks.push('Fresh narrow write, exact retry and same-name clients with equal request IDs are isolated')
  read = await call(0, 'get_scene', scope)
  const noop = { ...scope, code: `scene.log('Source authorization check')`, ...authority(read) }
  await call(0, 'run_script', noop)
  await reject(0, 'run_script', noop, 'SOURCE_READ_USED')
  assert.equal((await call(0, 'get_scene', scope)).revision, read.revision)
  report.checks.push('No-op scripts consume one-use read without changing source revision')
  const saved = await call(0, 'save_project', { ...scope, name: `e11-human-preserved-${stamp}` })
  const portable = JSON.parse(await readFile(saved.path, 'utf8'))
  assert.equal(portable.layers.find(layer => layer.id === clock.id).text.value, '09:05')
  assert(!JSON.stringify(portable).includes('readToken'))
  const preview = await raw(0, 'render_preview', { ...scope, timeMs: 500, timelineIds: ['qa'], width: 640 })
  assert(!preview.isError)
  const png = preview.content.find(item => item.type === 'image')
  await writeFile(path.join(output, 'human-preserved-preview.png'), Buffer.from(png.data, 'base64'))
  report.savedProject = saved.path; report.sessionId = sessionId; report.passed = true
  await writeFile(path.join(output, 'source-result.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report))
} finally { await Promise.allSettled(clients.map(client => client.close())) }
