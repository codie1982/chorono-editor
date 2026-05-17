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

export interface AIToolCall {
  name: string
  input: Record<string, unknown>
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
}

// ── Tool definitions (provider-agnostic schema, translated per-provider) ──────

export interface AIToolProperty {
  type: string
  description?: string
  enum?: string[]
  minimum?: number
  maximum?: number
  items?: AIToolProperty
  properties?: Record<string, AIToolProperty>
  required?: string[]
  default?: unknown
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
