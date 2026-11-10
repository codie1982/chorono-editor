import type { ToolDefinition } from '../protocol'
import { canonicalToolName, implementationToolName, STANDARD_TOOL_NAMES, TOOL_ALIASES, type ToolCatalogProfile } from './ToolCatalogPolicy'
import { decorateToolDefinition } from './quality'

/** Immutable discovery and call-resolution index over the existing action
 * definitions. It owns metadata only, never source scenes, commands or handles.
 * Legacy definitions retain payload/return semantics; aliases borrow the same
 * implementation with a distinct transport name. Discovery cannot authorize or
 * bypass validation: hidden legacy calls are resolved from this full index too.
 */
export class ToolCatalogIndex {
  private readonly calls = new Map<string, ToolDefinition>()
  private readonly legacyNames: readonly string[]

  /** Build once after action bootstrap; reject duplicate or dangling mappings
   * instead of silently selecting whichever definition happened to load last. */
  constructor(definitions: readonly ToolDefinition[]) {
    this.legacyNames = Object.freeze(definitions.map(tool => tool.name))
    for (const tool of definitions) {
      if (this.calls.has(tool.name)) throw new Error(`Duplicate MCP tool '${tool.name}'`)
      this.calls.set(tool.name, freezeDefinition(decorateToolDefinition(tool, tool.name)))
    }
    for (const [name, implementationName] of Object.entries(TOOL_ALIASES)) {
      const implementation = definitions.find(tool => tool.name === implementationName)
      if (!implementation || this.calls.has(name)) throw new Error(`Invalid MCP alias '${name}'`)
      this.calls.set(name, freezeDefinition(decorateToolDefinition({ ...implementation, name }, implementationName)))
    }
    for (const name of STANDARD_TOOL_NAMES) if (!this.calls.has(name)) throw new Error(`Missing standard MCP tool '${name}'`)
  }

  /** Return a caller-owned array of immutable definitions for one discovery
   * profile. Changing discovery never removes historical callable names. */
  list(profile: ToolCatalogProfile): ToolDefinition[] {
    return (profile === 'legacy' ? this.legacyNames : STANDARD_TOOL_NAMES).map(name => this.calls.get(name)!)
  }

  /** Resolve exactly one callable definition, whether advertised or legacy.
   * Unknown names fail before any command, runtime or file operation starts. */
  get(name: string): ToolDefinition {
    const tool = this.calls.get(name)
    if (!tool) throw new Error(`Unknown tool '${name}'`)
    return tool
  }

  /** Discovery metadata carries only names; large schema payloads are requested
   * through get_capabilities.toolName rather than repeated in this structure. */
  metadata(profile: ToolCatalogProfile) {
    return { version: 1, profile, advertisedToolNames: this.list(profile).map(tool => tool.name),
      aliases: Object.entries(TOOL_ALIASES).map(([name, implementationName]) => ({ name, implementationName })) }
  }

  /** Single-schema discovery lets an advanced native mutation be added to a
   * batch without advertising every alternative at initial connection time. */
  describe(name: string, profile: ToolCatalogProfile, callableInBatch: boolean) {
    return { tool: this.get(name), implementationName: implementationToolName(name),
      canonicalName: canonicalToolName(implementationToolName(name)),
      advertised: this.list(profile).some(tool => tool.name === name), callableInBatch,
      catalog: this.metadata(profile) }
  }
}

/** Metadata contains JSON records only. Freeze nested records so a caller
 * cannot alter validation for later requests by editing a discovered schema. */
function freezeDefinition(tool: ToolDefinition): ToolDefinition {
  const freeze = (value: unknown): void => {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  freeze(tool)
  return tool
}
