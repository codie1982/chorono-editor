'use client'
// ── ScriptConsolePanel (BL-76) ────────────────────────────────────────────────
// Editor-time authoring script REPL. Type JS that drives the scene via the
// `scene` API facade; Run commits all edits as ONE undo step.
//
//   card = scene.add('rect')
//   card.pos = [40, 60]
//   card.fill = '#3B82F6'
//   card.key('opacity', 0, 0)
//   card.key('opacity', 600, 1)

import { useState, useCallback, useRef } from 'react'
import type { ChronoScene } from '@/lib/types'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import { runScript } from '@/lib/script'
import type { ScriptHost, ScriptEvent } from '@/lib/script'

interface Props {
  getScene: () => ChronoScene
  dispatchCommand: (cmd: EditorCommand) => void
}

interface OutputLine {
  kind: 'log' | 'ok' | 'error' | 'event'
  text: string
}

const STARTER = `// Authoring script — runs against the scene.
// Cmd/Ctrl+Enter to run. All edits = one undo step.

const card = scene.add('rect')
card.pos = [40, 60]
card.size = [200, 100]
card.fill = '#3B82F6'
card.key('opacity', 0, 0)
card.key('opacity', 600, 1)
scene.log('created', card.id)`

export default function ScriptConsolePanel({ getScene, dispatchCommand }: Props) {
  const [code, setCode] = useState(STARTER)
  const [output, setOutput] = useState<OutputLine[]>([])
  const outRef = useRef<HTMLDivElement>(null)

  const run = useCallback(() => {
    const host: ScriptHost = {
      getScene,
      applyCommand: dispatchCommand,
    }

    const lines: OutputLine[] = []
    const onEvent = (e: ScriptEvent) => {
      if (e.type === 'scriptError') lines.push({ kind: 'error', text: `✗ ${e.error}` })
    }

    const result = runScript(code, host, { onEvent })

    for (const log of result.logs) lines.push({ kind: 'log', text: log })

    if (result.ok) {
      lines.push({
        kind: 'ok',
        text: `✓ ${result.commandCount} command${result.commandCount === 1 ? '' : 's'} applied (1 undo step)`,
      })
    } else if (!lines.some((l) => l.kind === 'error')) {
      lines.push({ kind: 'error', text: `✗ ${result.error ?? 'Unknown error'}` })
    }

    setOutput((prev) => [...prev, { kind: 'event', text: `> run` }, ...lines])
    // Scroll to bottom after paint.
    requestAnimationFrame(() => {
      if (outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight
    })
  }, [code, getScene, dispatchCommand])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        run()
      }
    },
    [run],
  )

  return (
    <div className="h-full flex flex-col bg-gray-900 text-gray-200">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700 shrink-0">
        <span className="text-xs font-semibold text-gray-300">Script Console</span>
        <span className="text-[10px] text-gray-500">JS · scene API</span>
        <div className="flex-1" />
        <button
          onClick={() => setOutput([])}
          className="px-2 py-1 text-[11px] rounded text-gray-400 hover:text-gray-200 hover:bg-gray-800"
          title="Clear output"
        >
          Clear
        </button>
        <button
          onClick={run}
          className="px-3 py-1 text-[11px] rounded bg-blue-600 text-white hover:bg-blue-500"
          title="Run (Cmd/Ctrl+Enter)"
        >
          ▶ Run
        </button>
      </div>

      {/* ── Editor ──────────────────────────────────────────────────────── */}
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={onKeyDown}
        spellCheck={false}
        className="flex-1 min-h-0 resize-none bg-gray-950 text-gray-100 font-mono text-xs p-3 outline-none border-b border-gray-700 leading-relaxed"
        placeholder="// scene.add('rect')…"
      />

      {/* ── Output ──────────────────────────────────────────────────────── */}
      <div
        ref={outRef}
        className="h-1/3 min-h-[80px] overflow-auto bg-gray-900 font-mono text-[11px] p-2 space-y-0.5"
      >
        {output.length === 0 ? (
          <div className="text-gray-600">Output will appear here…</div>
        ) : (
          output.map((line, i) => (
            <div
              key={i}
              className={
                line.kind === 'error'
                  ? 'text-red-400'
                  : line.kind === 'ok'
                    ? 'text-green-400'
                    : line.kind === 'event'
                      ? 'text-gray-500'
                      : 'text-gray-300'
              }
            >
              {line.text}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
