// ── /api/ai — Next.js Server Route ────────────────────────────────────────────
// Reads provider config from env, calls the chosen LLM, returns AIResponse.
// API keys never leave the server.

import { NextRequest, NextResponse } from 'next/server'
import {
  actionRegistry, bootstrapAIActions,
} from '@/lib/ai/ActionRegistry'
import { buildSystemPrompt } from '@/lib/ai/tools'
import { callAIProvider }    from '@/lib/ai/providers'
import { runAgentLoop }      from '@/lib/ai/AgentLoop'
import type { AIProviderConfig, AIProviderName, AIMessage, AgentMessage } from '@/lib/ai/types'
import type { ChronoScene } from '@/lib/types'

export const runtime = 'nodejs'

interface RequestBody {
  userMessage:       string
  sceneContext:      string
  history?:          AIMessage[]
  providerOverride?: AIProviderConfig
  /** Full scene JSON — server mutates a copy so read tools see post-state
   *  during the multi-turn agent loop (BL-01 Faz 2). */
  scene?:            ChronoScene
}

function readEnvConfig(forProvider?: AIProviderName): AIProviderConfig {
  const provider = forProvider ?? ((process.env.AI_PROVIDER ?? 'anthropic') as AIProviderName)

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
    const { userMessage, sceneContext, history = [], providerOverride, scene } = body

    if (!userMessage || typeof userMessage !== 'string') {
      return NextResponse.json(
        { error: 'Missing userMessage in request body' },
        { status: 400 },
      )
    }

    await bootstrapAIActions()
    // The UI sends a providerOverride to pick provider/model, but it never
    // carries the API key (keys stay server-side). When the override omits the
    // key, borrow it from env for that provider so UI selection + env keys work
    // together. Explicit keys (e.g. custom/local) are respected as-is.
    let config = providerOverride ?? readEnvConfig()
    if (providerOverride && !providerOverride.apiKey) {
      const envKey = readEnvConfig(providerOverride.provider).apiKey
      if (envKey) config = { ...providerOverride, apiKey: envKey }
    }

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
    const initialMessages: AgentMessage[] = [
      ...history,
      { role: 'user', content: userMessage },
    ]

    // Multi-turn agent loop (BL-01 Faz 2): the model can query (read tools) →
    // mutate → verify → continue across turns. Only mutate tool calls come back
    // for the client to dispatch. If no scene was sent, fall back to an empty
    // scene shell — read tools just report "empty" but mutations still work.
    const replayScene: ChronoScene = scene ?? {
      formatVersion: '1.0.0',
      mode: '2danimation',
      composition: { id: 'scene', width: 360, height: 240, durationMs: 1000, frameRate: 60, backgroundColor: '#FFFFFF' },
      assets: [], layers: [], timelines: [], parameters: [], triggers: [], bindings: [], initialState: {},
    }

    const loop = await runAgentLoop({
      config,
      tools,
      systemPrompt: system,
      initialMessages,
      scene: replayScene,
      callProvider: callAIProvider,
    })

    return NextResponse.json({
      message: loop.message,
      toolCalls: loop.mutateToolCalls,
      turns: loop.turns,
    })
  } catch (err: unknown) {
    const message = (err as Error).message ?? 'AI request failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
