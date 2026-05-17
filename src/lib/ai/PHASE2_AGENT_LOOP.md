# Phase 2 — Multi-Turn Agent Loop

Phase 1 (registry-driven context + few-shot examples + selection awareness)
landed. The next leverage point is making the planner an actual **agent**
that can query → reason → mutate → verify → continue, rather than a
single-shot tool emitter.

## Why this matters

Current limitations:
- AI sees scene state once at request time. If a tool call fails or
  produces unexpected results, the AI never finds out.
- AI can't ask "what's currently selected?" or "what are the keyframes
  on layers.X.opacity right now?" — it has to guess from the context dump.
- Multi-step workflows (e.g. "duplicate this layer and animate it
  differently") require the AI to perform all reasoning up-front.

A multi-turn loop fixes all of these.

## Architecture

```
useAIPlanner.send(text)
   ↓
POST /api/ai
   ↓
SERVER LOOP (max N turns):
   1. callAIProvider(messages, tools, system)
   2. If response has no toolCalls → exit loop with final message
   3. Execute each toolCall on a SERVER-SIDE scene copy:
        - read tool → run def.read() → string result
        - mutate tool → run def.toCommand().execute() → "Applied: <label>"
   4. Append assistant message + tool_result messages
   5. Loop again
   ↓
Return: { message, toolCalls: <all turns>, finalScene? }
   ↓
Client: PlannerExecutor builds commands from accumulated toolCalls,
        dispatchCommand for each (preserves per-action undo entries).
```

## What needs to change

### 1. Read-tool support in ActionRegistry

```typescript
export interface ActionDef<P = Record<string, unknown>> {
  id: string
  toolName: string
  description: string
  parameters: { ... }

  /** Mutating action: returns command for client to dispatch. */
  toCommand?(params: P, scene: ChronoScene): EditorCommand | null

  /** Read-only action: returns string result fed back to LLM. */
  read?(params: P, scene: ChronoScene): string
}
```

Each ActionDef defines exactly one of `toCommand` or `read`.

### 2. New read actions (`actions/introspect.ts`)

```typescript
- get_scene_json       → full ChronoScene JSON
- describe_layer       → detailed dump of one layer (params: layerId)
- describe_timeline    → tracks + keyframes for one timeline (params: timelineId)
- list_layers          → terse list with ids + types + visibility
- evaluate_at_time     → computed property values at a given time
                         (params: timeMs, target?) — invaluable for
                         "verify my animation"
```

### 3. providers.ts: tool_use_id round-trip

Currently `AIToolCall = { name, input }`. Need to add `id` so the next
turn can attach `tool_result` messages with matching `tool_use_id`.

Anthropic wire format for round-trip:
```
{ role: 'assistant', content: [
    { type: 'text', text: '...' },
    { type: 'tool_use', id: 'toolu_X', name: '...', input: {...} }
]}
{ role: 'user', content: [
    { type: 'tool_result', tool_use_id: 'toolu_X', content: '...' }
]}
```

OpenAI wire format:
```
{ role: 'assistant', tool_calls: [
    { id: 'call_X', type: 'function', function: { name, arguments } }
]}
{ role: 'tool', tool_call_id: 'call_X', content: '...' }
```

Both providers need refactoring to support the round-trip — currently
providers.ts is single-shot only.

### 4. Server-side scene replay

`/api/ai/route.ts` needs a `ChronoScene` copy to mutate per turn so
read tools see the post-mutation state. Options:

- **A) Client sends scene JSON** — server mutates a copy locally. Final
  state can be ignored (client already applies commands itself).
- **B) Stateless** — server only evaluates read tools at the original
  scene state. Mutate tools confirm without simulating. Less accurate
  for chained workflows but simpler.

Recommendation: A. It's only ~10 extra lines and gives the AI accurate
post-state to read between turns.

### 5. Loop budget + termination

```typescript
const MAX_TURNS = 5
const MAX_TOTAL_TOOLS = 30
```

Exit when:
- LLM returns no toolCalls (natural end)
- Turn count exceeds MAX_TURNS
- Total tool calls exceeds MAX_TOTAL_TOOLS (runaway protection)
- Any provider error

### 6. UI surface

Show per-turn breakdown in MessageBubble — currently we flatten all
commands into one chip list. Group by turn:
```
Turn 1: ✓ describe_layer(bg_rect) → "rect 200×200..."
Turn 2: ✓ add_keyframes ✓ create_timeline
Turn 3: (final message)
```

## Effort estimate

| Change | Lines | Complexity |
|---|---|---|
| ActionDef union for read/mutation | ~20 | Low |
| 5 introspect actions | ~120 | Low |
| providers.ts round-trip (Anthropic + OpenAI + Custom) | ~150 | Medium |
| route.ts loop logic | ~60 | Medium |
| Scene mutation tracking | ~10 | Low |
| MessageBubble per-turn grouping | ~30 | Low |
| **Total** | **~390 lines** | **2-3 days** |

## When to do this

After:
- Phase 1 (this commit) is exercised on real prompts and edge cases
  identified
- Editor reaches ~80% feature completeness so the action set stabilizes
- Token spend is justified (multi-turn = 2-5× more tokens per request)

## Out of scope for Phase 2

- Streaming (Phase 3) — once loop works, stream each turn
- Voice input (Phase 3)
- MCP server (Phase 4) — uses same registry, agent loop irrelevant
- Cost optimization (cache reuse, prompt compression)
