// ── /api/ai — Next.js Server Route ────────────────────────────────────────────
// Reads provider config from env, calls the chosen LLM, returns AIResponse.
// API keys never leave the server.

import { NextRequest, NextResponse } from 'next/server'
import {
  actionRegistry, bootstrapAIActions,
} from '@/lib/ai/ActionRegistry'
import { buildSystemPrompt } from '@/lib/ai/tools'
import { callAIProvider }    from '@/lib/ai/providers'
import type { AIProviderConfig, AIProviderName, AIMessage } from '@/lib/ai/types'

export const runtime = 'nodejs'

interface RequestBody {
  userMessage:       string
  sceneContext:      string
  history?:          AIMessage[]
  providerOverride?: AIProviderConfig
}

function readEnvConfig(): AIProviderConfig {
  const provider = (process.env.AI_PROVIDER ?? 'anthropic') as AIProviderName

  if (provider === 'openai') {
    return {
      provider: 'openai',
      apiKey:   process.env.OPENAI_API_KEY ?? '',
      model:    process.env.OPENAI_MODEL ?? 'gpt-4o',
    }
  }
  if (provider === 'custom') {
    return {
      provider: 'custom',
      apiKey:   process.env.CUSTOM_AI_KEY ?? '',
      model:    process.env.CUSTOM_AI_MODEL ?? 'local',
      baseUrl:  process.env.CUSTOM_AI_URL ?? '',
    }
  }
  // default → anthropic
  return {
    provider: 'anthropic',
    apiKey:   process.env.ANTHROPIC_API_KEY ?? '',
    model:    process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RequestBody
    const { userMessage, sceneContext, history = [], providerOverride } = body

    if (!userMessage || typeof userMessage !== 'string') {
      return NextResponse.json(
        { error: 'Missing userMessage in request body' },
        { status: 400 },
      )
    }

    await bootstrapAIActions()
    const config = providerOverride ?? readEnvConfig()

    // Custom provider may legitimately have no API key (e.g. local Ollama)
    if (!config.apiKey && config.provider !== 'custom') {
      return NextResponse.json(
        { error: `${config.provider} API key not configured (set ${config.provider.toUpperCase()}_API_KEY in .env.local or provide providerOverride)` },
        { status: 400 },
      )
    }
    if (config.provider === 'custom' && !config.baseUrl) {
      return NextResponse.json(
        { error: 'custom provider requires baseUrl (CUSTOM_AI_URL)' },
        { status: 400 },
      )
    }

    const tools  = actionRegistry.toAITools()
    const system = buildSystemPrompt(sceneContext)
    const messages: AIMessage[] = [
      ...history,
      { role: 'user', content: userMessage },
    ]

    const result = await callAIProvider(config, messages, tools, system)
    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = (err as Error).message ?? 'AI request failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
