import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

// Real STDIO -> HTTP -> browser acceptance; all editor operations are read-only.
// Pair an isolated test editor through its Agent menu first. Change selection
// through the UI between invocations; --previous proves source/revision stayed
// unchanged. Never record the one-use readToken or connection credentials.
const { values } = parseArgs({ options: {
  origin: { type: 'string', default: 'http://127.0.0.1:2004' },
  session: { type: 'string' },
  expected: { type: 'string' },
  previous: { type: 'string' },
  output: { type: 'string' },
  handoff: { type: 'string' },
  focus: { type: 'string' },
} })
const root = process.cwd(), client = new Client({ name: 'Selection acceptance', version: '1.0.0' })
const transport = new StdioClientTransport({ command: process.execPath,
  args: [path.join(root, 'dist/mcp/server.cjs')], cwd: root, stderr: 'pipe',
  env: { ...process.env, CHORONO_PROJECT_ROOT: root, CHORONO_EDITOR_URL: values.origin },
})

/** Read a public MCP JSON result without exposing its authorization envelope. */
async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args })
  assert(!result.isError, name + ' failed')
  return JSON.parse(result.content.find(item => item.type === 'text').text)
}

try {
  await client.connect(transport)
  const { sessions } = await call('list_sessions')
  assert(values.session || sessions.length === 1, 'Pair exactly one isolated editor or pass --session')
  const sessionId = values.session ?? sessions[0].id
  const read = await call('get_scene', { sessionId }), selected = read.selected
  assert(selected, 'Browser must expose the selected context')
  assert(selected.primaryLayerId === null ? selected.layerIds.length === 0 : selected.layerIds.includes(selected.primaryLayerId))
  assert.equal(new Set(selected.layerIds).size, selected.layerIds.length)
  assert.deepEqual(selected.layers.map(layer => layer.id), selected.layerIds)
  for (const layer of selected.layers) {
    const source = read.scene.layers.find(item => item.id === layer.id)
    assert(source, 'Selected layer must resolve in the same scene')
    assert.deepEqual(layer, { id: source.id, name: source.name, type: source.type,
      address: ['layer', source.id], parentId: source.parentId ?? null })
  }
  if (values.expected !== undefined) assert.deepEqual(selected.layerIds, values.expected ? values.expected.split(',') : [])
  assert(!Object.hasOwn(read.scene, 'selected'), 'Selection must stay outside saved source')
  const sourceHash = createHash('sha256').update(JSON.stringify(read.scene)).digest('hex')
  if (values.previous) {
    const previous = JSON.parse(await readFile(values.previous, 'utf8'))
    assert.equal(read.documentEpoch, previous.documentEpoch)
    assert.equal(read.revision, previous.revision)
    assert.equal(sourceHash, previous.sourceHash, 'UI selection must not rewrite source')
  }
  let focusLayerIds
  if (values.handoff) {
    const handoff = await call('get_handoff_context', { sessionId, handoffId: values.handoff })
    focusLayerIds = handoff.focus.layers.map(layer => layer.id)
    if (values.focus !== undefined) assert.deepEqual(focusLayerIds, values.focus ? values.focus.split(',') : [])
    assert.equal(handoff.readToken, undefined)
  }
  const report = { passed: true, sessionId, revision: read.revision, documentEpoch: read.documentEpoch,
    sourceHash, selected, ...(focusLayerIds ? { focusLayerIds } : {}) }
  if (values.output) {
    await mkdir(path.dirname(values.output), { recursive: true })
    await writeFile(values.output, JSON.stringify(report, null, 2) + '\n')
  }
  console.log(JSON.stringify(report, null, 2))
} finally {
  await client.close()
}
