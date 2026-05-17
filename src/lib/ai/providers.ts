// ── AI Providers ──────────────────────────────────────────────────────────────
// Provider-agnostic fetch wrappers. No SDK dependencies — pure fetch.
// Each provider translates the common AITool format into its own wire format.

import type { AIMessage, AITool, AIResponse, AIProviderConfig } from './types'

// ── Anthropic ─────────────────────────────────────────────────────────────────

export async function callAnthropic(
  config: AIProviderConfig,
  messages: AIMessage[],
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
      messages,
      tools: anthropicTools,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic API error ${res.status}: ${err}`)
  }

  const data = await res.json()
  const content: Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }> = data.content ?? []

  return {
    message: content
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join(''),
    toolCalls: content
      .filter((b) => b.type === 'tool_use')
      .map((b) => ({ name: b.name!, input: b.input ?? {} })),
  }
}

// ── OpenAI ────────────────────────────────────────────────────────────────────

export async function callOpenAI(
  config: AIProviderConfig,
  messages: AIMessage[],
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

  const allMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...messages,
  ]

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages: allMessages,
      tools: openaiTools,
      tool_choice: 'auto',
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
    function: { name: string; arguments: string }
  }) => ({
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
  messages: AIMessage[],
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

  const allMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...messages,
  ]

  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: allMessages,
      tools: openaiTools,
      tool_choice: 'auto',
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
    function: { name: string; arguments: string }
  }) => ({
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
  messages: AIMessage[],
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
