'use client'
// ── ExpressionEditor (BL-05) ──────────────────────────────────────────────────
// Input control for a single expression string ("map(s, 0, 1, 0, 360)" etc.)
// with live parse-error display and a sample evaluation against a probe value.

import { useState, useEffect, useMemo } from 'react'
import { safeEvaluate, parseExpression } from '@/lib/core/expression/expressionEvaluator'

interface Props {
  expression: string
  /** Live source value (for the live preview row). Optional. */
  sourceValue?: number | null
  /** Called when the user commits a new expression (blur or Enter). */
  onCommit: (expression: string) => void
  /** Compact form omits the help / preview rows. Default false. */
  compact?: boolean
}

const HELP_FUNCTIONS = [
  'map(s, inMin, inMax, outMin, outMax)',
  'clamp(v, min, max)',
  'lerp(a, b, t)',
  'sin/cos/abs/sqrt/pow',
  'round/floor/ceil',
  'smoothstep(t)',
  '+ - * / % ^',
]

export default function ExpressionEditor({
  expression, sourceValue, onCommit, compact = false,
}: Props) {
  const [draft, setDraft] = useState(expression)

  // Sync external changes (e.g. another panel edited the wire) into the input
  // without trampling on whatever the user is currently typing — we only
  // accept the prop when it differs AND we're not focused. The simplest
  // approximation: reset whenever the prop changes between renders.
  useEffect(() => { setDraft(expression) }, [expression])

  // Parse + (optionally) evaluate against sourceValue for the preview row.
  const { error, previewValue } = useMemo(() => {
    try {
      parseExpression(draft)
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e), previewValue: null as number | null }
    }
    if (typeof sourceValue === 'number') {
      const v = safeEvaluate(draft, { s: sourceValue })
      return { error: null, previewValue: v }
    }
    return { error: null, previewValue: null as number | null }
  }, [draft, sourceValue])

  function commitIfChanged() {
    if (draft !== expression) onCommit(draft)
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitIfChanged}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { (e.target as HTMLInputElement).blur() }
          if (e.key === 'Escape') { setDraft(expression); (e.target as HTMLInputElement).blur() }
        }}
        placeholder="e.g. map(s, 0, 1, 0, 360)"
        spellCheck={false}
        className={`bg-gray-900 border rounded px-2 py-1 text-[11px] font-mono outline-none focus:border-gray-500 ${
          error ? 'border-red-500 text-red-300' : 'border-gray-700 text-gray-100'
        }`}
      />

      {!compact && (
        <>
          {error ? (
            <div className="text-[10px] text-red-400 px-1" title={error}>
              {/* Strip "Parse error: " prefix for a cleaner display */}
              {error.replace(/^Parse error:\s*/, '')}
            </div>
          ) : sourceValue != null ? (
            <div className="text-[10px] text-gray-400 px-1 flex items-center gap-1">
              <span className="text-gray-500">s =</span>
              <span className="text-amber-300 font-mono">{formatNum(sourceValue)}</span>
              <span className="text-gray-600">→</span>
              <span className="text-emerald-300 font-mono">
                {previewValue == null ? '—' : formatNum(previewValue)}
              </span>
            </div>
          ) : (
            <div className="text-[10px] text-gray-500 px-1 italic">
              Pick a source to preview the result
            </div>
          )}

          <details className="text-[10px] text-gray-500 px-1 mt-0.5">
            <summary className="cursor-pointer hover:text-gray-400 select-none">
              Available functions
            </summary>
            <ul className="mt-1 ml-3 space-y-0.5 font-mono">
              {HELP_FUNCTIONS.map((fn) => (
                <li key={fn} className="text-gray-400">{fn}</li>
              ))}
            </ul>
          </details>
        </>
      )}
    </div>
  )
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return String(n)
  if (Math.abs(n) >= 1000) return n.toFixed(0)
  if (Math.abs(n) >= 1) return n.toFixed(2)
  return n.toFixed(4)
}
