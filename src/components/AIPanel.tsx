'use client'
// ── AIPanel ───────────────────────────────────────────────────────────────────
// Fixed right-side drawer with chat UI for the AI Planner.

import { useState, useRef, useEffect } from 'react'
import type React from 'react'
import type { ChronoScene } from '@/lib/types'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import type {
  AIProviderName, AIProviderConfig, AIUIMessage,
} from '@/lib/ai/types'
import { useAIPlanner }  from '@/app/hooks/useAIPlanner'
import { DEFAULT_MODELS } from '@/lib/ai/providers'

interface AIPanelProps {
  scene: ChronoScene
  dispatchCommand: (cmd: EditorCommand) => void
  onClose: () => void
}

const QUICK_ACTIONS = [
  { label: '🎬 Red box slide',  prompt: '1080×1080 canvas oluştur, kırmızı bir kutu (200×200) ekle ve 1 saniyede sağdan sola animasyon yap' },
  { label: '✨ Fade in all',    prompt: 'Mevcut tüm layerlara 500ms fade-in animasyonu ekle' },
  { label: '⏳ Loading spinner', prompt: '360×360 canvas, ortada bir ring shape (outerRadius 80, innerRadius 60), 1 saniyede sonsuz dönen loading spinner yap' },
  { label: '⚽ Bouncing ball',   prompt: '360×640 canvas, mavi bir top (ellipse 60×60), yukarıdan düşüp zemine zıplayan bounce animasyonu, 2 saniye' },
]

export default function AIPanel({
  scene, dispatchCommand, onClose,
}: AIPanelProps) {
  const planner = useAIPlanner({ scene, dispatchCommand })
  const [text, setText]               = useState('')
  const [provider, setProvider]       = useState<AIProviderName>('anthropic')
  const [model, setModel]             = useState(DEFAULT_MODELS.anthropic[0] ?? '')
  const [showSettings, setShowSettings] = useState(false)
  const [apiKey, setApiKey]           = useState('')
  const [customUrl, setCustomUrl]     = useState('')
  const [customModel, setCustomModel] = useState('')
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Reset model when provider changes
  useEffect(() => {
    const list = DEFAULT_MODELS[provider]
    setModel(list && list.length > 0 ? list[0] : '')
  }, [provider])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [planner.messages])

  function buildOverride(): AIProviderConfig | undefined {
    // Custom provider always needs override (env may not be set)
    if (provider === 'custom') {
      if (!customUrl) return undefined
      return {
        provider: 'custom',
        apiKey:   apiKey,
        model:    customModel || 'local',
        baseUrl:  customUrl,
      }
    }
    if (apiKey || model) {
      return { provider, apiKey, model }
    }
    return undefined
  }

  function handleSend(msg: string) {
    if (!msg.trim() || planner.isLoading) return
    planner.send(msg, buildOverride())
    setText('')
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend(text)
    }
  }

  return (
    <div className="fixed right-0 top-0 bottom-0 w-96 bg-gray-900 border-l border-gray-700
                    flex flex-col z-50 shadow-2xl text-gray-200">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="px-3 py-2 border-b border-gray-700 flex items-center gap-2 bg-gray-800 shrink-0">
        <span className="text-sm font-semibold">🤖 AI Planner</span>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as AIProviderName)}
          className="ml-auto text-[11px] bg-gray-700 border-none px-1.5 py-0.5 rounded text-gray-200"
          disabled={planner.isLoading}
        >
          <option value="anthropic">Anthropic</option>
          <option value="openai">OpenAI</option>
          <option value="custom">Custom</option>
        </select>
        {provider !== 'custom' && DEFAULT_MODELS[provider].length > 0 && (
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="text-[11px] bg-gray-700 border-none px-1.5 py-0.5 rounded text-gray-200 max-w-[140px] truncate"
            disabled={planner.isLoading}
          >
            {DEFAULT_MODELS[provider].map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )}
        <button
          onClick={() => setShowSettings((v) => !v)}
          title="Settings"
          className="text-[11px] px-1.5 py-0.5 hover:bg-gray-700 rounded"
        >⚙</button>
        <button
          onClick={planner.clear}
          title="Clear conversation"
          className="text-[11px] px-1.5 py-0.5 hover:bg-gray-700 rounded"
        >🗑</button>
        <button
          onClick={onClose}
          title="Close panel"
          className="text-[11px] px-1.5 py-0.5 hover:bg-gray-700 rounded"
        >✕</button>
      </header>

      {/* ── Settings drawer ────────────────────────────────────────── */}
      {showSettings && (
        <div className="px-3 py-2 border-b border-gray-700 bg-gray-800 text-[11px] space-y-2 shrink-0">
          {provider === 'custom' && (
            <>
              <label className="block text-gray-400">Base URL</label>
              <input
                type="text"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="http://localhost:11434 (Ollama)"
                className="w-full bg-gray-900 px-2 py-1 rounded font-mono text-[10px]"
              />
              <label className="block text-gray-400">Model</label>
              <input
                type="text"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="llama3.1, qwen2.5-coder, etc."
                className="w-full bg-gray-900 px-2 py-1 rounded font-mono text-[10px]"
              />
            </>
          )}
          <label className="block text-gray-400">
            API Key override <span className="text-gray-500">(empty = use .env.local)</span>
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={`${provider} API key`}
            className="w-full bg-gray-900 px-2 py-1 rounded font-mono text-[10px]"
          />
        </div>
      )}

      {/* ── Quick actions ──────────────────────────────────────────── */}
      <div className="px-3 py-2 border-b border-gray-700 flex flex-wrap gap-1 bg-gray-850 shrink-0">
        {QUICK_ACTIONS.map((q) => (
          <button
            key={q.label}
            onClick={() => handleSend(q.prompt)}
            disabled={planner.isLoading}
            className="text-[10px] px-2 py-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-40
                       rounded transition-colors border border-gray-700"
            title={q.prompt}
          >{q.label}</button>
        ))}
      </div>

      {/* ── Messages ───────────────────────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-3 min-h-0">
        {planner.messages.length === 0 && (
          <div className="text-center text-gray-500 text-xs mt-12">
            <p>Animasyon oluşturmak için aşağıya yaz.</p>
            <p className="mt-2 text-[10px] text-gray-600">
              Örn: &quot;kırmızı bir daire ekle ve fade-in yap&quot;
            </p>
            <p className="mt-3 text-[10px] text-gray-600">
              ↑ Hızlı eylem chiplerini deneyebilirsin
            </p>
          </div>
        )}
        {planner.messages.map((m) => <MessageBubble key={m.id} msg={m} />)}
      </div>

      {/* ── Input ──────────────────────────────────────────────────── */}
      <form
        onSubmit={(e) => { e.preventDefault(); handleSend(text) }}
        className="border-t border-gray-700 p-2 flex gap-2 bg-gray-850 shrink-0"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ne yapmak istersin? (Enter = gönder, Shift+Enter = yeni satır)"
          rows={2}
          disabled={planner.isLoading}
          className="flex-1 bg-gray-800 text-xs p-2 rounded resize-none
                     disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-blue-500
                     border border-gray-700"
        />
        <button
          type="submit"
          disabled={planner.isLoading || !text.trim()}
          className="px-3 bg-blue-600 hover:bg-blue-500 rounded text-xs font-medium
                     disabled:opacity-40 disabled:cursor-not-allowed self-stretch"
        >{planner.isLoading ? '⏳' : '↑'}</button>
      </form>
    </div>
  )
}

// ── MessageBubble ─────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: AIUIMessage }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-lg px-3 py-2 text-xs
                       ${isUser ? 'bg-blue-700 text-white' : 'bg-gray-800 text-gray-200'}`}>
        {msg.loading ? (
          <div className="flex gap-1 items-center py-0.5">
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" />
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse"
                  style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse"
                  style={{ animationDelay: '300ms' }} />
          </div>
        ) : (
          <>
            {msg.content && (
              <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
            )}

            {msg.appliedLabels && msg.appliedLabels.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {msg.appliedLabels.map((label, i) => {
                  const isError = label.startsWith('AI ERROR')
                  return (
                    <span
                      key={i}
                      className={`text-[10px] px-1.5 py-0.5 rounded border
                        ${isError
                          ? 'bg-red-900/40 text-red-300 border-red-800'
                          : 'bg-emerald-900/40 text-emerald-300 border-emerald-800'}`}
                    >
                      {isError ? '⚠' : '✓'} {label.replace(/^AI(?:\s+ERROR)?:\s*/, '')}
                    </span>
                  )
                })}
              </div>
            )}

            {msg.toolCalls && msg.toolCalls.length > 0 && !msg.appliedLabels?.length && (
              <div className="mt-2 flex flex-wrap gap-1">
                {msg.toolCalls.map((tc, i) => (
                  <span key={i}
                        className="text-[10px] px-1.5 py-0.5 bg-gray-700 rounded font-mono">
                    {tc.name}
                  </span>
                ))}
              </div>
            )}

            {msg.error && (
              <div className="mt-2 px-2 py-1 bg-red-900/40 border border-red-800
                              text-red-300 rounded text-[10px] whitespace-pre-wrap">
                ⚠ {msg.error}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
