import path from 'node:path'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import Ajv from 'ajv'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

// Read-only stdio acceptance. Only tools/list and local metadata discovery run;
// no connected scene, file export, user token or broker HTTP request is used.
const [directory = '.', target = 'artifacts/validation/mcp-quality-20261110/after'] = process.argv.slice(2)
const root = path.resolve(directory), output = path.resolve(target)
const report = { profiles: {}, aliases: 0 }
await mkdir(output, { recursive: true })

/** Count actual schema property docs through composition branches; no raw user
 * values or scenes are involved. A missing doc names the exact tool/schema path. */
function parameterCoverage(schema, prefix, result = { count: 0, missing: [] }) {
  if (!schema || typeof schema !== 'object') return result
  for (const [name, child] of Object.entries(schema.properties ?? {})) {
    result.count++
    if (!child.description?.trim()) result.missing.push(`${prefix}.${name}`)
    parameterCoverage(child, `${prefix}.${name}`, result)
  }
  if (schema.items) parameterCoverage(schema.items, `${prefix}[]`, result)
  for (const group of ['anyOf', 'oneOf', 'allOf']) for (const child of schema[group] ?? []) parameterCoverage(child, prefix, result)
  return result
}

/** Use one fresh MCP connection per immutable discovery profile, closing its
 * stdio process even on assertion failure. Metadata calls never need an editor. */
async function inspect(profile) {
  const client = new Client({ name: 'chorono-catalog-acceptance', version: '1.0.0' })
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath,
      args: [path.join(root, 'dist/mcp/server.cjs')], cwd: root, stderr: 'pipe',
      env: { ...process.env, CHORONO_PROJECT_ROOT: root, CHORONO_MCP_TOOL_PROFILE: profile } }))
    const call = async arguments_ => {
      const result = await client.callTool({ name: 'get_capabilities', arguments: arguments_ })
      assert(!result.isError, 'Metadata discovery must succeed')
      return JSON.parse(result.content[0].text)
    }
    const { tools } = await client.listTools(), summary = await call({ summary: true })
    assert.equal(tools.length, profile === 'standard' ? 40 : 77)
    assert.equal(summary.version, '2.1.0'); assert.equal(summary.sourceEditing.required, true)
    assert.equal(summary.sourceEditing.authoring.version, 1)
    const sourceDetail = await call({toolName:'create_layer'})
    assert(sourceDetail.tool.inputSchema.required.includes('readToken'))
    assert(sourceDetail.tool.inputSchema.required.includes('expectedRevision'))
    assert(!sourceDetail.batchInputSchema.required.includes('readToken'))
    assert(!sourceDetail.batchInputSchema.required.includes('expectedRevision'))
    assert.equal(new Set(tools.map(tool => tool.name)).size, tools.length)
    assert.deepEqual(tools.map(tool => tool.name), summary.catalog.advertisedToolNames)
    assert.equal(summary.tools, undefined); assert.equal(summary.scripting, undefined)
    const ajv = new Ajv({ strict: false }), docs = { count: 0, missing: [] }
    for (const tool of tools) {
      ajv.compile(tool.inputSchema)
      parameterCoverage(tool.inputSchema, tool.name, docs)
      for (const hint of ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint']) assert.equal(typeof tool.annotations[hint], 'boolean')
    }
    assert.deepEqual(docs.missing, [])
    for (const alias of summary.catalog.aliases) {
      const modern = await call({ toolName: alias.name }), legacy = await call({ toolName: alias.implementationName })
      assert.equal(modern.implementationName, alias.implementationName)
      assert.deepEqual(modern.tool.inputSchema, legacy.tool.inputSchema)
    }
    const full = await call({})
    assert.equal(full.tools.length, 77); assert.equal(typeof full.scripting, 'string')
    await writeFile(path.join(output, `${profile}-catalog.json`), JSON.stringify(tools, null, 2) + '\n')
    report.profiles[profile] = { tools: tools.length, schemaProperties: docs.count,
      undocumentedProperties: docs.missing.length, jsonBytes: Buffer.byteLength(JSON.stringify(tools)),
      summaryBytes: Buffer.byteLength(JSON.stringify(summary)), fullCapabilitiesBytes: Buffer.byteLength(JSON.stringify(full)) }
    report.aliases = summary.catalog.aliases.length
  } finally { await client.close() }
}
await inspect('standard'); await inspect('legacy')
assert(report.profiles.standard.jsonBytes < report.profiles.legacy.jsonBytes)
report.passed = true
await writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report))
