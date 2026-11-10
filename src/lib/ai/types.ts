// ── AI Planner Types ──────────────────────────────────────────────────────────

export type AIProviderName = 'anthropic' | 'openai' | 'custom'

export interface AIProviderConfig {
  provider: AIProviderName
  apiKey: string
  model: string
  /** Only for custom provider */
  baseUrl?: string
}

// ── Wire format shared by all providers ───────────────────────────────────────

export interface AIMessage {
  role: 'user' | 'assistant'
  content: string
}

/** Tool result fed back to the model in the next turn (BL-01 Faz 2). */
export interface AIToolResult {
  /** Matches the AIToolCall.id this result answers. */
  toolCallId: string
  /** String result of the read/mutate tool. */
  content: string
}

/**
 * Richer message for the multi-turn agent loop. Superset of AIMessage:
 * `content` is always present, so plain AIMessage[] remains compatible.
 *   • assistant turn that called tools → set `toolCalls`
 *   • user turn carrying tool outputs  → set `toolResults`
 */
export interface AgentMessage {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: AIToolCall[]
  toolResults?: AIToolResult[]
}

export interface AIToolCall {
  name: string
  input: Record<string, unknown>
  /** Provider tool-call id (Anthropic toolu_*, OpenAI call_*). Needed for the
   *  multi-turn agent loop to attach tool_result messages (BL-01 Faz 2). */
  id?: string
}

export interface AIResponse {
  message: string
  toolCalls: AIToolCall[]
  error?: string
}

// ── UI message (includes applied command labels) ──────────────────────────────

export interface AIUIMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls?: AIToolCall[]
  appliedLabels?: string[]
  error?: string
  loading?: boolean
  /** 'plan' = planner build (default), 'check' = read-only reviewer (BL-77). */
  kind?: 'plan' | 'check'
  /** Per-turn tool-name breakdown — drives the "thinking" inspection display. */
  turns?: { toolNames: string[] }[]
}

// ── Tool definitions (provider-agnostic schema, translated per-provider) ──────

/** JSON Schema field shared by AI providers and the MCP ActionRegistry adapter.
 * A union may omit type and declare anyOf; existing single-type descriptions
 * remain unchanged. Runtime domain validation remains authoritative. */
export interface AIToolProperty {
  type?: string
  description?: string
  enum?: string[]
  minimum?: number
  maximum?: number
  items?: AIToolProperty
  properties?: Record<string, AIToolProperty>
  required?: string[]
  default?: unknown
  anyOf?: readonly AIToolProperty[]
  minItems?: number
  maxItems?: number
  additionalProperties?: boolean | AIToolProperty
}

export interface AITool {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, AIToolProperty>
    required?: string[]
  }
}

// ── MCP tool format (Model Context Protocol) ──────────────────────────────────
// Used by chorono-mcp/ to expose actions over the MCP protocol. The shape
// matches @modelcontextprotocol/sdk's Tool interface so adapter code stays
// minimal.

export interface MCPTool {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, AIToolProperty>
    required?: string[]
  }
}
