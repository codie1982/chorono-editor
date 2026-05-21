// ── ActionRegistry ────────────────────────────────────────────────────────────
// Central registry for AI/UI actions. Each ActionDef wraps an EditorCommand
// factory with JSON schema metadata so that the same registration drives:
//   • AI tool definitions (toAITools)
//   • MCP tool definitions (toMCPTools — future)
//   • Optional UI macro recording (future)
//
// Existing EditorCommand system is untouched — ActionDef.toCommand() builds
// commands from typed params, and dispatchCommand() consumes them as usual.

import type { ChronoScene } from '@/lib/types'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import type { AITool, AIToolProperty, MCPTool } from './types'

export interface ActionDef<P = Record<string, unknown>> {
  /** Dot-notation id, e.g. "layer.add", "keyframe.addBatch". */
  id: string
  /** AI tool name surfaced to the LLM. Often matches id with underscores. */
  toolName: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, AIToolProperty>
    required?: string[]
  }
  /**
   * MUTATING action. Build an EditorCommand from validated params. The `scene`
   * argument is the working scene at this step (PlannerExecutor advances it
   * between tool calls so e.g. create_timeline → add_keyframes ordering works).
   *
   * Return value semantics:
   *   • EditorCommand → dispatched normally
   *   • null         → silently skipped (action chose not to act)
   *   • For validation errors, return a no-op command with label
   *     "AI ERROR: …" — the chat panel surfaces it as an error chip.
   *
   * An ActionDef defines exactly ONE of `toCommand` (mutate) or `read`.
   */
  toCommand?(params: P, scene: ChronoScene): EditorCommand | null

  /**
   * READ-ONLY action (BL-01 Faz 2 — agent loop). Returns a string result that
   * is fed back to the LLM as a tool_result so it can query → reason → continue.
   * Read actions never mutate and are NOT sent to the client for dispatch.
   */
  read?(params: P, scene: ChronoScene): string
}

export class ActionRegistry {
  private actions = new Map<string, ActionDef>()

  register<P>(def: ActionDef<P>): void {
    if (this.actions.has(def.id)) {
      throw new Error(`Action "${def.id}" already registered`)
    }
    this.actions.set(def.id, def as ActionDef)
  }

  /** Look up by id OR by toolName (LLM uses toolName). */
  get(idOrToolName: string): ActionDef | undefined {
    const byId = this.actions.get(idOrToolName)
    if (byId) return byId
    // Fallback: scan toolName (Array.from avoids downlevelIteration on Map iterator)
    const all = Array.from(this.actions.values())
    for (const def of all) {
      if (def.toolName === idOrToolName) return def
    }
    return undefined
  }

  getAll(): ActionDef[] {
    return Array.from(this.actions.values())
  }

  /** All read-only (introspection) actions — those that define `read`. */
  getReadOnly(): ActionDef[] {
    return this.getAll().filter((a) => typeof a.read === 'function')
  }

  /**
   * Emit AITool[] for providers.ts (Anthropic / OpenAI / Custom).
   * `opts.readOnly` restricts to introspection tools — used by the Checker
   * agent so it can inspect but never mutate the scene.
   */
  toAITools(opts?: { readOnly?: boolean }): AITool[] {
    const defs = opts?.readOnly ? this.getReadOnly() : this.getAll()
    return defs.map((a) => ({
      name: a.toolName,
      description: a.description,
      parameters: a.parameters,
    }))
  }

  /**
   * Emit MCPTool[] for the MCP server (chorono-mcp/).
   * Same registration, different output format — MCP uses `inputSchema`
   * instead of `parameters`. Lets ChatGPT / Claude Desktop / Cursor / any
   * MCP-compatible client invoke the same actions over MCP protocol.
   */
  toMCPTools(): MCPTool[] {
    return this.getAll().map((a) => ({
      name: a.toolName,
      description: a.description,
      inputSchema: a.parameters,
    }))
  }

  clear(): void {
    this.actions.clear()
  }
}

// ── Singleton + lazy bootstrap ────────────────────────────────────────────────

export const actionRegistry = new ActionRegistry()

let bootstrapped = false

/**
 * Register all built-in actions. Idempotent — safe to call from multiple
 * entry points (API route, hook, tests). Imports are inside the function
 * to keep ActionRegistry module-level imports zero (avoids circular hazards
 * even though all action files only `import type` from this module).
 */
export async function bootstrapAIActions(): Promise<void> {
  if (bootstrapped) return
  bootstrapped = true
  const [
    { registerSceneActions },
    { registerCompositionActions },
    { registerLayerActions },
    { registerTimelineActions },
    { registerKeyframeActions },
    { registerScriptActions },
    { registerIntrospectActions },
  ] = await Promise.all([
    import('./actions/scene'),
    import('./actions/composition'),
    import('./actions/layer'),
    import('./actions/timeline'),
    import('./actions/keyframe'),
    import('./actions/script'),
    import('./actions/introspect'),
  ])
  registerSceneActions(actionRegistry)
  registerCompositionActions(actionRegistry)
  registerLayerActions(actionRegistry)
  registerTimelineActions(actionRegistry)
  registerKeyframeActions(actionRegistry)
  registerScriptActions(actionRegistry)
  registerIntrospectActions(actionRegistry)
}
