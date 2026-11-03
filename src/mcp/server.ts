import path from 'node:path'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema, ListPromptsRequestSchema, GetPromptRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { getToolCatalog, getCapabilities, SCRIPT_HELP, validateToolCall } from '../lib/mcp/catalog'
import { getLocalToken } from '../lib/mcp/storage'
import { MCP_VERSION } from '../lib/mcp/protocol'

process.chdir(process.env.CHORONO_PROJECT_ROOT ?? path.resolve(__dirname, '../..'))
const origin = new URL(process.env.CHORONO_EDITOR_URL ?? 'http://127.0.0.1:2000')
if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) throw new Error('CHORONO_EDITOR_URL must be an HTTP loopback address')
const endpoint = new URL('/api/mcp', origin)
const server = new Server({ name: 'chorono', version: MCP_VERSION }, { capabilities: { tools: {}, resources: {}, prompts: {} }, instructions: 'Control the real connected Chorono editor. Start with list_sessions and get_capabilities; choose sessionId if more than one tab is connected. Read get_scene before editing existing work. Use expectedRevision to prevent overwriting manual edits, and requestId for retry-safe mutations. run_script is isolated and atomic. Create/select explicit timelines for multiple animations. Use render_preview and inspect the returned image; evaluate_frame alone does not prove visual quality. Save portable projects with save_project. Use only documented SceneAPI methods.' })

async function call(name: string, args: Record<string, any>) {
  await validateToolCall(name, args)
  if (name === 'get_capabilities') return getCapabilities()
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getLocalToken()}` }, body: JSON.stringify({ op: 'call', name, arguments: args, clientName: server.getClientVersion()?.name ?? 'MCP client' }), signal: AbortSignal.timeout(130000) })
  const body = await response.json()
  if (!response.ok || body.error) throw new Error(body.error ?? `Editor HTTP ${response.status}`)
  return body.result
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: await getToolCatalog() }))
server.setRequestHandler(CallToolRequestSchema, async request => {
  try {
    const result = await call(request.params.name, request.params.arguments ?? {})
    if (request.params.name === 'render_preview') return { content: [{ type: 'image' as const, data: result.data, mimeType: result.mimeType }, { type: 'text' as const, text: JSON.stringify({ revision: result.revision, width: result.width, height: result.height, timeMs: result.timeMs }) }] }
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
  } catch (error) { return { isError: true, content: [{ type: 'text' as const, text: (error as Error).message }] } }
})
server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [
  { uri: 'chorono://scripting', name: 'Chorono scripting API', mimeType: 'text/plain' },
  { uri: 'chorono://capabilities', name: 'Tools, object kinds and particle presets', mimeType: 'application/json' },
  { uri: 'chorono://sessions', name: 'Connected editor sessions', mimeType: 'application/json' },
] }))
server.setRequestHandler(ReadResourceRequestSchema, async request => {
  const uri = request.params.uri
  if (uri === 'chorono://scripting') return { contents: [{ uri, mimeType: 'text/plain', text: SCRIPT_HELP }] }
  if (uri === 'chorono://capabilities' || uri === 'chorono://sessions') return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(await call(uri.endsWith('sessions') ? 'list_sessions' : 'get_capabilities', {})) }] }
  throw new Error('Unknown Chorono resource')
})
server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: [{ name: 'animate_scene', description: 'Read, build, preview, refine and save a Chorono animation.', arguments: [{ name: 'brief', description: 'Animation brief', required: true }] }] }))
server.setRequestHandler(GetPromptRequestSchema, async request => {
  if (request.params.name !== 'animate_scene') throw new Error('Unknown prompt')
  return { messages: [{ role: 'user' as const, content: { type: 'text' as const, text: `Create this editable animation: ${request.params.arguments?.brief ?? ''}\nFirst read the scene and scripting resource. Use named objects and explicit timelines. Batch related edits, preview at meaningful timestamps, fix layout/timing, validate and save the portable project. Preserve unrelated existing work.` } }] }
})
async function main() {
  await server.connect(new StdioServerTransport())
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
