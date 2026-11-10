import type { ToolDefinition } from '../../protocol'
import { editorDescriptions } from './editorDescriptions'
import { inspectionDescriptions } from './inspectionDescriptions'
import { audioFileDescriptions } from './audioFileDescriptions'
import { describeInputSchema } from './describeInputSchema'
import { toolBehavior } from './behavior'

const descriptions = { ...editorDescriptions, ...inspectionDescriptions, ...audioFileDescriptions }

/** Present one callable tool with selection guidance and truthful IO hints.
 * implementationName selects the existing handler contract even when tool.name
 * is a canonical alias. Decoration never changes accepted input, dispatch name,
 * output representation or mutation semantics, and returns caller-owned schema
 * data so presentation cannot mutate ActionRegistry/shared schema definitions.
 * There is no IO, cached mutable state or dependency on a browser/session.
 */
export function decorateToolDefinition(tool: ToolDefinition, implementationName: string): ToolDefinition {
  return {
    ...tool,
    description: descriptions[implementationName] ?? tool.description,
    inputSchema: describeInputSchema(tool.inputSchema, implementationName),
    annotations: toolBehavior(implementationName, tool.annotations),
  }
}
