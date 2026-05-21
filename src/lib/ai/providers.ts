// ── AI Providers ──────────────────────────────────────────────────────────────
// Provider-agnostic fetch wrappers. No SDK dependencies — pure fetch.
// Each provider translates the common AITool format into its own wire format.

import type { AIMessage, AgentMessage, AITool, AIResponse, AIProviderConfig } from './types'

// ── Anthropic ─────────────────────────────────────────────────────────────────

/** Translate AgentMessage[] → Anthropic content-block messages (tool round-trip). */
function toAnthropicMessages(messages: AgentMessage[]) {
  return messages.map((m) => {
    if (m.toolResults && m.toolResults.length > 0) {
      return {
        role: 'user' as const,
        content: m.toolResults.map((r) => ({
          type: 'tool_result' as const,
          tool_use_id: r.toolCallId,
          content: r.content,
        })),
      }
    }
    if (m.toolCalls && m.toolCalls.length > 0) {
      const blocks: Array<Record<string, unknown>> = []
      if (m.content) blocks.push({ type: 'text', text: m.content })
      for (const tc of m.toolCalls) {
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input })
      }
      return { role: 'assistant' as const, content: blocks }
    }
    return { role: m.role, content: m.content }
  })
}

export async function callAnthropic(
  config: AIProviderConfig,
  messages: AgentMessage[],
  tools: AITool[],
  systemPrompt: string,
): Promise<AIResponse> {
  const anthropicTools = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: {
      type: 'object' as const,
      properties: t.parameters.properties,
      required: t.parameters.required ?? [],
    },
  }))

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: toAnthropicMessages(messages),
      // Empty tools → omit so the model is forced to answer with text (used for
      // the agent loop's forced wrap-up turn).
      ...(anthropicTools.length > 0 ? { tools: anthropicTools } : {}),
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic API error ${res.status}: ${err}`)
  }

  const data = await res.json()
  const content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }> = data.content ?? []

  return {
    message: content
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join(''),
    toolCalls: content
      .filter((b) => b.type === 'tool_use')
      .map((b) => ({ id: b.id, name: b.name!, input: b.input ?? {} })),
  }
}

// ── OpenAI ────────────────────────────────────────────────────────────────────

/** Translate AgentMessage[] → OpenAI chat messages (tool round-trip). */
function toOpenAIMessages(systemPrompt: string, messages: AgentMessage[]) {
  const out: Array<Record<string, unknown>> = [
    { role: 'system', content: systemPrompt },
  ]
  for (const m of messages) {
    if (m.toolResults && m.toolResults.length > 0) {
      // One 'tool' message per result.
      for (const r of m.toolResults) {
        out.push({ role: 'tool', tool_call_id: r.toolCallId, content: r.content })
      }
      continue
    }
    if (m.toolCalls && m.toolCalls.length > 0) {
      out.push({
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.input) },
        })),
      })
      continue
    }
    out.push({ role: m.role, content: m.content })
  }
  return out
}

export async function callOpenAI(
  config: AIProviderConfig,
  messages: AgentMessage[],
  tools: AITool[],
  systemPrompt: string,
): Promise<AIResponse> {
  const openaiTools = tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: 'object',
        properties: t.parameters.properties,
        required: t.parameters.required ?? [],
      },
    },
  }))

  const allMessages = toOpenAIMessages(systemPrompt, messages)

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages: allMessages,
      // Empty tools → omit tools + tool_choice so the model must answer in text.
      ...(openaiTools.length > 0 ? { tools: openaiTools, tool_choice: 'auto' } : {}),
      max_tokens: 8192,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI API error ${res.status}: ${err}`)
  }

  const data = await res.json()
  const choice = data.choices?.[0]
  const msg = choice?.message ?? {}

  const toolCalls = (msg.tool_calls ?? []).map((tc: {
    id?: string
    function: { name: string; arguments: string }
  }) => ({
    id: tc.id,
    name: tc.function.name,
    input: (() => {
      try { return JSON.parse(tc.function.arguments) }
      catch { return {} }
    })(),
  }))

  return {
    message: msg.content ?? '',
    toolCalls,
  }
}

// ── Custom / OpenAI-compatible ────────────────────────────────────────────────
// Works with Ollama, Groq, Together AI, Azure OpenAI, LM Studio, etc.

export async function callCustom(
  config: AIProviderConfig,
  messages: AgentMessage[],
  tools: AITool[],
  systemPrompt: string,
): Promise<AIResponse> {
  const baseUrl = (config.baseUrl ?? '').replace(/\/$/, '')
  const url = `${baseUrl}/v1/chat/completions`

  const openaiTools = tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: 'object',
        properties: t.parameters.properties,
        required: t.parameters.required ?? [],
      },
    },
  }))

  const allMessages = toOpenAIMessages(systemPrompt, messages)

  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: allMessages,
      ...(openaiTools.length > 0 ? { tools: openaiTools, tool_choice: 'auto' } : {}),
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Custom API error ${res.status}: ${err}`)
  }

  const data = await res.json()
  const choice = data.choices?.[0]
  const msg = choice?.message ?? {}

  const toolCalls = (msg.tool_calls ?? []).map((tc: {
    id?: string
    function: { name: string; arguments: string }
  }) => ({
    id: tc.id,
    name: tc.function.name,
    input: (() => {
      try { return JSON.parse(tc.function.arguments) }
      catch { return {} }
    })(),
  }))

  return {
    message: msg.content ?? '',
    toolCalls,
  }
}

// ── Unified dispatcher ─────────────────────────────────────────────────────────

export async function callAIProvider(
  config: AIProviderConfig,
  messages: AgentMessage[],
  tools: AITool[],
  systemPrompt: string,
): Promise<AIResponse> {
  switch (config.provider) {
    case 'anthropic': return callAnthropic(config, messages, tools, systemPrompt)
    case 'openai':    return callOpenAI(config, messages, tools, systemPrompt)
    case 'custom':    return callCustom(config, messages, tools, systemPrompt)
  }
}

// ── Default models per provider ───────────────────────────────────────────────

export const DEFAULT_MODELS: Record<string, string[]> = {
  anthropic: [
    'claude-sonnet-4-6',
    'claude-opus-4-7',
    'claude-haiku-4-5-20251001',
  ],
  openai: [
    'gpt-4o',
    'gpt-4o-mini',
    'o1-mini',
    'o3-mini',
  ],
  custom: [],
}
