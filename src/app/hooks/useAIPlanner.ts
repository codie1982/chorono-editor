'use client'
// ── useAIPlanner ──────────────────────────────────────────────────────────────
// Client hook that orchestrates: serialize scene → POST /api/ai → execute
// returned tool calls via dispatchCommand.
//
// Scene mutations go through the existing EditorCommand + undo system, so
// Cmd+Z reverses any AI change exactly like a manual edit.

import { withAuthoringStamp } from '@/lib/editor/authoring'
import { useState, useCallback } from 'react'
import type { ChronoScene } from '@/lib/types'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import type {
  AIUIMessage, AIProviderConfig, AIResponse, AIMessage,
} from '@/lib/ai/types'
import { serializeScene, type SerializeOptions } from '@/lib/ai/SceneSerializer'
import { buildCommandsFromToolCalls } from '@/lib/ai/PlannerExecutor'
// Ensure registry is populated on the client too — PlannerExecutor.get() needs it.
import { bootstrapAIActions } from '@/lib/ai/ActionRegistry'

export interface UseAIPlannerArgs {
  scene: ChronoScene
  dispatchCommand: (cmd: EditorCommand) => void
  /** Current playhead time — surfaces to AI as PLAYHEAD reference. */
  currentTimeMs?: number
  /** Selected layer id — AI gets a detailed view of just this layer. */
  selectedLayerId?: string | null
  /** Selected timeline id — surfaces first in the context. */
  selectedTimelineId?: string | null
}

export interface UseAIPlannerReturn {
  messages:  AIUIMessage[]
  isLoading: boolean
  error:     string | null
  send:      (text: string, providerOverride?: AIProviderConfig) => Promise<void>
  /** Run the read-only Checker agent — reviews the scene, never mutates (BL-77). */
  check:     (providerOverride?: AIProviderConfig) => Promise<void>
  clear:     () => void
}

// TODO(remove-built-in-chat): Dahili sohbet kaldırıldığında bu hook ve
// planner/checker istek akışı kaldırılacak. Paylaşılan MCP eylemleri korunacak.
export function useAIPlanner({
  scene, dispatchCommand,
  currentTimeMs = 0,
  selectedLayerId = null,
  selectedTimelineId = null,
}: UseAIPlannerArgs): UseAIPlannerReturn {
  const [messages, setMessages]   = useState<AIUIMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const run = useCallback(async (
    text: string,
    providerOverride: AIProviderConfig | undefined,
    agentRole: 'planner' | 'checker',
  ) => {
    if (!text.trim()) return
    setError(null); setIsLoading(true)

    const userId = `m_${Date.now()}_u`
    const aiId   = `m_${Date.now()}_a`
    const isCheck = agentRole === 'checker'

    // Checker has no user-typed prompt — show a system-style label instead.
    const userMsg: AIUIMessage = {
      id: userId, role: 'user',
      content: isCheck ? '🔍 Sahneyi kontrol et' : text,
    }
    const placeholder: AIUIMessage = {
      id: aiId, role: 'assistant', content: '', loading: true,
      kind: isCheck ? 'check' : 'plan',
    }
    setMessages((m) => [...m, userMsg, placeholder])

    try {
      await bootstrapAIActions()

      const sceneContext = serializeScene(scene, {
        currentTimeMs, selectedLayerId, selectedTimelineId,
      } satisfies SerializeOptions)
      const history: AIMessage[] = messages.map((m) => ({
        role: m.role, content: m.content,
      }))

      const res = await fetch('/api/ai', {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({
          userMessage: text, sceneContext, history, providerOverride,
          scene, agentRole,
        }),
      })
      const data = (await res.json()) as AIResponse & {
        error?: string
        turns?: { toolNames: string[] }[]
      }
      if (!res.ok || data.error) {
        throw new Error(data.error ?? `Request failed: ${res.status}`)
      }

      // Checker is read-only — never dispatch. Planner dispatches mutate calls.
      const exec = isCheck
        ? { commands: [], appliedLabels: [] as string[], errors: [] as string[] }
        : buildCommandsFromToolCalls(data.toolCalls ?? [], scene)
      if (!isCheck) for (const cmd of exec.commands) dispatchCommand(withAuthoringStamp(cmd, {
        actor: { kind: 'agent', name: 'Chorono planner' }, transactionId: globalThis.crypto?.randomUUID?.(),
      }))

      setMessages((m) => {
        const next = [...m]
        const idx = next.findIndex((x) => x.id === aiId)
        if (idx >= 0) {
          next[idx] = {
            id: aiId,
            role: 'assistant',
            kind: isCheck ? 'check' : 'plan',
            content: data.message || (exec.appliedLabels.length > 0
              ? `${exec.appliedLabels.length} işlem uygulandı.`
              : '(no message)'),
            toolCalls: data.toolCalls,
            appliedLabels: isCheck ? undefined : exec.appliedLabels,
            turns: data.turns,
            error: exec.errors.length > 0 ? exec.errors.join('\n') : undefined,
          }
        }
        return next
      })
    } catch (err: unknown) {
      const message = (err as Error).message ?? 'AI request failed'
      setError(message)
      setMessages((m) => {
        const next = [...m]
        const idx = next.findIndex((x) => x.id === aiId)
        if (idx >= 0) {
          next[idx] = { ...next[idx], loading: false, content: '', error: message }
        }
        return next
      })
    } finally {
      setIsLoading(false)
    }
  }, [scene, messages, dispatchCommand, currentTimeMs, selectedLayerId, selectedTimelineId])

  const send = useCallback(
    (text: string, providerOverride?: AIProviderConfig) =>
      run(text, providerOverride, 'planner'),
    [run],
  )

  const check = useCallback(
    (providerOverride?: AIProviderConfig) =>
      run('Review the current scene and report any issues.', providerOverride, 'checker'),
    [run],
  )

  const clear = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  return { messages, isLoading, error, send, check, clear }
}
