import type { JsonObject, ToolDefinition } from '../protocol'
/** Bridge-owned metadata factory. Runtime validation and source authorization
 * remain in the catalog/broker; descriptions never grant execution authority. */
export function extra(name: string, description: string, properties: JsonObject = {}, required: string[] = [], readOnly = false): ToolDefinition {
  return { name, description, inputSchema: { type: 'object', properties, required }, annotations: { readOnlyHint: readOnly, openWorldHint: false } }
}
