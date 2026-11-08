import type { JsonObject, ToolDefinition } from './protocol'

const discoveryTools = new Set(['list_sessions', 'get_capabilities', 'list_projects'])
const unguardedTools = new Set(['control_playback', 'control_runtime', 'export_runtime', 'export_svg', 'export_sequence'])

/**
 * Add the broker's common parameter documentation without mutating the source
 * schema. Existing validation keywords and parameter types remain unchanged.
 * Discovery ignores these optional fields; most reads, playback and visual exports do not
 * enforce expectedRevision. Retry results are session-local, bounded and volatile.
 */
export function withBridgeParameters(tool: ToolDefinition): ToolDefinition {
  const discovery = discoveryTools.has(tool.name)
  const guarded = ['render_audio_preview', 'export_audio'].includes(tool.name) || (!discovery && !tool.annotations?.readOnlyHint && !unguardedTools.has(tool.name))
  const unused = 'Unused by this discovery tool; omit.'
  const properties: JsonObject = {
    ...tool.inputSchema.properties,
    sessionId: {
      type: 'string',
      description: discovery ? unused : 'Connected editor id from list_sessions. May be omitted only when exactly one editor tab is connected.',
    },
    expectedRevision: {
      type: 'integer', minimum: 0,
      description: guarded
        ? 'Scene revision from get_scene. Rejects a stale edit or save; on conflict read the scene again before preparing new arguments.'
        : 'Not checked by this tool; omit. Use the returned revision, when present, to identify the observed scene.',
    },
    requestId: {
      type: 'string', maxLength: 128,
      description: discovery ? unused : 'Optional retry token, not a background job id. Reuse with the same tool and identical arguments to reuse its result. Only the last 64 ids per editor session are cached in memory; changed arguments are rejected.',
    },
  }
  return { ...tool, inputSchema: { ...tool.inputSchema, properties, additionalProperties: false } }
}

/**
 * Document the shared ActionRegistry adapter response and transaction boundary.
 * Domain descriptions stay with the action that owns their implementation.
 * Returns a new definition; it does not alter AI/UI action registration or schemas.
 */
export function withNativeToolContract(tool: ToolDefinition, readOnly: boolean): ToolDefinition {
  const result = readOnly
    ? 'Returns JSON text containing revision and a content string. Requires a connected editor; does not change the scene.'
    : 'Applies one undoable transaction in a connected editor. Returns JSON text containing revision, composition, layer/timeline summaries and addedLayerIds. Validation failures do not commit the transaction.'
  return {
    ...tool,
    description: `${tool.description} ${result}`,
    annotations: { readOnlyHint: readOnly, openWorldHint: false },
  }
}
