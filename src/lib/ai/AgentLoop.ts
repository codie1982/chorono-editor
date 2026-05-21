// ── AgentLoop — BL-01 Faz 2 Multi-turn Agent Loop ─────────────────────────────
// Server-side loop: call LLM → execute tool calls on a scene copy → feed results
// back → repeat until the model stops calling tools (or budget runs out).
//
// Read tools run server-side and their output is returned to the model.
// Mutate tools advance the server scene copy (so later read tools see post-state)
// AND are accumulated to send back to the client, which dispatches them through
// the normal command pipeline (preserving undo/redo).

import type { ChronoScene } from '@/lib/types'
import type {
  AgentMessage, AIToolCall, AIToolResult, AITool, AIProviderConfig,
} from './types'
import { actionRegistry } from './ActionRegistry'

export const MAX_TURNS = 5
export const MAX_TOTAL_TOOLS = 30

export interface AgentTurn {
  /** Tool names called in this turn (for UI per-turn breakdown). */
  toolNames: string[]
}

export interface AgentLoopResult {
  /** Final assistant text (last turn with no tool calls, or last seen). */
  message: string
  /** ONLY mutate tool calls, in order — client dispatches these. */
  mutateToolCalls: AIToolCall[]
  /** Per-turn tool-name breakdown. */
  turns: AgentTurn[]
  totalTools: number
}

/** Provider call signature — injectable for testing. */
export type ProviderCaller = (
  config: AIProviderConfig,
  messages: AgentMessage[],
  tools: AITool[],
  systemPrompt: string,
) => Promise<{ message: string; toolCalls: AIToolCall[] }>

export interface AgentLoopOptions {
  config: AIProviderConfig
  tools: AITool[]
  systemPrompt: string
  initialMessages: AgentMessage[]
  /** Client scene copy — server mutates it per turn for read-tool accuracy. */
  scene: ChronoScene
  callProvider: ProviderCaller
  maxTurns?: number
  maxTotalTools?: number
}

export async function runAgentLoop(opts: AgentLoopOptions): Promise<AgentLoopResult> {
  const {
    config, tools, systemPrompt, initialMessages, callProvider,
    maxTurns = MAX_TURNS, maxTotalTools = MAX_TOTAL_TOOLS,
  } = opts

  const messages: AgentMessage[] = [...initialMessages]
  let serverScene: ChronoScene = opts.scene
  const mutateToolCalls: AIToolCall[] = []
  const turns: AgentTurn[] = []
  let totalTools = 0
  let finalMessage = ''

  for (let turn = 0; turn < maxTurns; turn++) {
    const result = await callProvider(config, messages, tools, systemPrompt)
    if (result.message) finalMessage = result.message

    // Natural end: the model answered without calling any tools.
    if (!result.toolCalls || result.toolCalls.length === 0) break

    // Normalize ids so the assistant message and tool_result ids match exactly
    // (OpenAI/Anthropic require this round-trip pairing).
    const calls: AIToolCall[] = result.toolCalls.map((c, i) => ({
      ...c,
      id: c.id ?? `call_${turn}_${i}`,
    }))

    messages.push({ role: 'assistant', content: result.message, toolCalls: calls })

    const toolResults: AIToolResult[] = []
    const turnNames: string[] = []
    let budgetHit = false

    for (const call of calls) {
      totalTools++
      turnNames.push(call.name)

      if (totalTools > maxTotalTools) {
        toolResults.push({
          toolCallId: call.id!,
          content: 'Tool budget exceeded — stop calling tools and finish.',
        })
        budgetHit = true
        break
      }

      const def = actionRegistry.get(call.name)
      if (!def) {
        toolResults.push({ toolCallId: call.id!, content: `Unknown tool "${call.name}".` })
        continue
      }

      try {
        if (def.read) {
          const out = def.read(call.input, serverScene)
          toolResults.push({ toolCallId: call.id!, content: out })
        } else if (def.toCommand) {
          const cmd = def.toCommand(call.input, serverScene)
          if (cmd) {
            serverScene = cmd.execute(serverScene)
            mutateToolCalls.push(call)
            toolResults.push({ toolCallId: call.id!, content: `Applied: ${cmd.label}` })
          } else {
            toolResults.push({ toolCallId: call.id!, content: 'No-op (action skipped).' })
          }
        } else {
          toolResults.push({ toolCallId: call.id!, content: 'Tool has no handler.' })
        }
      } catch (err) {
        toolResults.push({
          toolCallId: call.id!,
          content: `Error: ${(err as Error).message}`,
        })
      }
    }

    turns.push({ toolNames: turnNames })
    messages.push({ role: 'user', content: '', toolResults })

    if (budgetHit) break
  }

  return { message: finalMessage, mutateToolCalls, turns, totalTools }
}
