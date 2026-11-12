import path from 'node:path'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema, ListPromptsRequestSchema, GetPromptRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { getToolCatalog, getCapabilities, SCRIPT_HELP, validateToolCall } from '../lib/mcp/catalog'
import { MCP_VERSION } from '../lib/mcp/protocol'
import { parseToolCatalogProfile } from '../lib/mcp/tools/ToolCatalogPolicy'
import { EditorConnection } from './EditorConnection'
import { SourceAccessError } from '../lib/mcp/source/SourceAccessError'

process.chdir(process.env.CHORONO_PROJECT_ROOT ?? path.resolve(__dirname, '../..'))
const origin = new URL(process.env.CHORONO_EDITOR_URL ?? 'http://127.0.0.1:2000')
if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) throw new Error('CHORONO_EDITOR_URL must be an HTTP loopback address')
const endpoint = new URL('/api/mcp', origin)
const toolProfile = parseToolCatalogProfile(process.env.CHORONO_MCP_TOOL_PROFILE)
const server = new Server({ name: 'chorono', version: MCP_VERSION }, { capabilities: { tools: {}, resources: {}, prompts: {} }, instructions: 'Control the real connected Chorono editor. Start with list_sessions and get_capabilities summary:true; choose sessionId explicitly for multiple editors. Before EACH source mutation read get_scene and pass its revision as expectedRevision plus its one-use readToken. An atomic batch needs only its outer authorization. A script dry run returns a NEW plan-bound readToken: apply_script_plan uses that token and the plan revision, without rerunning code. Every legacy alias shares these mandatory guards. Optional scene.authoring v1 distinguishes creation, field writers and copied content; unknown records are not implicitly human. Actor labels do not permit overwriting unrelated edits. Undo/redo restores attribution and runtime outputs omit it. Reuse exact requestId/name/arguments for uncertain retries; do not replace only a revision/token in stale work. A structured source conflict requires a new read and adapting the edit. Prefer create_layer/get_layer/get_timeline/upsert_keyframes for their documented scopes. Standard discovery is focused; get_capabilities toolName yields one schema, callableInBatch and batchInputSchema. Use advanced native edits inside batch_actions. Scripts run only in isolated QuickJS; read chorono://scripting first. Inspect render_preview PNGs; evaluate_frame gives values only. Save portable projects with save_project.' })
const editorConnection = new EditorConnection(endpoint, () => server.getClientVersion()?.name ?? 'MCP client')
server.onclose = () => { void editorConnection.close() }

async function call(name: string, args: Record<string, any>) {
  await validateToolCall(name, args)
  if (name === 'get_capabilities') return getCapabilities(toolProfile, args)
  return editorConnection.call(name, args)
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: await getToolCatalog(toolProfile) }))
server.setRequestHandler(CallToolRequestSchema, async request => {
  try {
    const result = await call(request.params.name, request.params.arguments ?? {})
    if (request.params.name === 'render_preview') return { content: [{ type: 'image' as const, data: result.data, mimeType: result.mimeType }, { type: 'text' as const, text: JSON.stringify({ revision: result.revision, width: result.width, height: result.height, timeMs: result.timeMs }) }] }
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
  } catch (error) {
    if (error instanceof SourceAccessError) {
      const failure = { error: error.toJSON() }
      return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(failure) }], structuredContent: failure }
    }
    return { isError: true, content: [{ type: 'text' as const, text: (error as Error).message }] }
  }
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
