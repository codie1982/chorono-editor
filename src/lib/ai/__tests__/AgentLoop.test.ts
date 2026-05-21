// ── AgentLoop tests (BL-01 Faz 2) ─────────────────────────────────────────────
import { describe, it, expect, beforeAll } from 'vitest'
import '@/lib/registry' // layer registry bootstrap (createDefault needs it)
import { runAgentLoop, type ProviderCaller } from '../AgentLoop'
import { bootstrapAIActions } from '../ActionRegistry'
import type { AIToolCall, AgentMessage, AITool, AIProviderConfig } from '../types'
import type { ChronoScene } from '@/lib/types'
import { emptyScene } from '@/lib/defaults'

const config: AIProviderConfig = { provider: 'openai', apiKey: 'test', model: 'gpt-4o' }
const tools: AITool[] = []

function sceneWith(layers: ChronoScene['layers']): ChronoScene {
  return { ...emptyScene(), layers }
}

/** Build a scripted provider that returns a queued response per call. */
function scriptedProvider(
  script: Array<{ message: string; toolCalls: AIToolCall[] }>,
): { caller: ProviderCaller; seen: AgentMessage[][] } {
  const seen: AgentMessage[][] = []
  let i = 0
  const caller: ProviderCaller = async (_c, messages) => {
    seen.push(JSON.parse(JSON.stringify(messages)))
    return script[i++] ?? { message: 'done', toolCalls: [] }
  }
  return { caller, seen }
}

beforeAll(async () => { await bootstrapAIActions() })

describe('runAgentLoop', () => {
  it('stops immediately when the model emits no tool calls', async () => {
    const { caller } = scriptedProvider([{ message: 'hello', toolCalls: [] }])
    const r = await runAgentLoop({
      config, tools, systemPrompt: 'sys', initialMessages: [{ role: 'user', content: 'hi' }],
      scene: emptyScene(), callProvider: caller,
    })
    expect(r.message).toBe('hello')
    expect(r.mutateToolCalls).toHaveLength(0)
    expect(r.turns).toHaveLength(0)
  })

  it('runs a read tool, feeds the result back, then completes', async () => {
    const scene = sceneWith([
      { id: 'a', name: 'Alpha', type: 'shape', shape: 'rect', transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 }, opacity: 1 },
    ])
    const { caller, seen } = scriptedProvider([
      { message: 'let me look', toolCalls: [{ id: 't1', name: 'list_layers', input: {} }] },
      { message: 'found it', toolCalls: [] },
    ])
    const r = await runAgentLoop({
      config, tools, systemPrompt: 'sys', initialMessages: [{ role: 'user', content: 'what layers?' }],
      scene, callProvider: caller,
    })
    expect(r.message).toBe('found it')
    expect(r.mutateToolCalls).toHaveLength(0) // read tool is not a mutation
    expect(r.turns).toEqual([{ toolNames: ['list_layers'] }])
    // Second provider call must include the tool_result with our content.
    const secondCallMessages = seen[1]
    const toolResultMsg = secondCallMessages.find((m) => m.toolResults && m.toolResults.length)
    expect(toolResultMsg).toBeDefined()
    expect(toolResultMsg!.toolResults![0].toolCallId).toBe('t1')
    expect(toolResultMsg!.toolResults![0].content).toContain('Alpha')
  })

  it('accumulates mutate tool calls and advances the server scene', async () => {
    const { caller } = scriptedProvider([
      { message: 'building', toolCalls: [
        { id: 'c1', name: 'add_layer', input: { id: 'r1', name: 'R1', type: 'shape', shapeKind: 'rect' } },
        { id: 'c2', name: 'add_layer', input: { id: 'r2', name: 'R2', type: 'shape', shapeKind: 'circle' } },
      ] },
      { message: 'done', toolCalls: [] },
    ])
    const r = await runAgentLoop({
      config, tools, systemPrompt: 'sys', initialMessages: [{ role: 'user', content: 'add two' }],
      scene: emptyScene(), callProvider: caller,
    })
    expect(r.mutateToolCalls.map((c) => c.name)).toEqual(['add_layer', 'add_layer'])
    expect(r.turns).toEqual([{ toolNames: ['add_layer', 'add_layer'] }])
  })

  it('read tool sees post-mutation state in a later turn', async () => {
    // Turn 1: add a layer. Turn 2: list_layers should see it. Turn 3: stop.
    const { caller, seen } = scriptedProvider([
      { message: 't1', toolCalls: [{ id: 'm1', name: 'add_layer', input: { id: 'x', name: 'X', type: 'shape', shapeKind: 'rect' } }] },
      { message: 't2', toolCalls: [{ id: 'r1', name: 'list_layers', input: {} }] },
      { message: 'verified', toolCalls: [] },
    ])
    const r = await runAgentLoop({
      config, tools, systemPrompt: 'sys', initialMessages: [{ role: 'user', content: 'add then verify' }],
      scene: emptyScene(), callProvider: caller,
    })
    expect(r.message).toBe('verified')
    expect(r.mutateToolCalls).toHaveLength(1)
    // Third provider call's tool_result (for list_layers) must mention the added layer.
    const thirdMessages = seen[2]
    const listResult = thirdMessages.reverse().find((m) => m.toolResults?.some((tr) => tr.toolCallId === 'r1'))
    expect(listResult!.toolResults!.find((tr) => tr.toolCallId === 'r1')!.content).toContain('X')
  })

  it('enforces MAX_TURNS', async () => {
    // Provider always returns a tool call → loop must stop at maxTurns.
    let calls = 0
    const caller: ProviderCaller = async () => {
      calls++
      return { message: `turn ${calls}`, toolCalls: [{ id: `t${calls}`, name: 'list_layers', input: {} }] }
    }
    const r = await runAgentLoop({
      config, tools, systemPrompt: 'sys', initialMessages: [{ role: 'user', content: 'loop' }],
      scene: emptyScene(), callProvider: caller, maxTurns: 3,
    })
    expect(calls).toBe(3)
    expect(r.turns).toHaveLength(3)
  })

  it('enforces MAX_TOTAL_TOOLS', async () => {
    const caller: ProviderCaller = async () => ({
      message: 'many',
      toolCalls: [
        { id: 'a', name: 'list_layers', input: {} },
        { id: 'b', name: 'list_layers', input: {} },
        { id: 'c', name: 'list_layers', input: {} },
      ],
    })
    const r = await runAgentLoop({
      config, tools, systemPrompt: 'sys', initialMessages: [{ role: 'user', content: 'spam' }],
      scene: emptyScene(), callProvider: caller, maxTurns: 10, maxTotalTools: 2,
    })
    expect(r.totalTools).toBeGreaterThanOrEqual(2)
    // Should have stopped — not run all 10 turns × 3 tools.
    expect(r.totalTools).toBeLessThanOrEqual(3)
  })

  it('reports unknown tools without crashing', async () => {
    const { caller } = scriptedProvider([
      { message: 'oops', toolCalls: [{ id: 'u1', name: 'nonexistent_tool', input: {} }] },
      { message: 'recovered', toolCalls: [] },
    ])
    const r = await runAgentLoop({
      config, tools, systemPrompt: 'sys', initialMessages: [{ role: 'user', content: 'x' }],
      scene: emptyScene(), callProvider: caller,
    })
    expect(r.message).toBe('recovered')
    expect(r.mutateToolCalls).toHaveLength(0)
  })
})
