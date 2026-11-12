'use client'
import { CalculationNumberInput } from '../inputs/CalculationNumberInput'
import { useEffect, useRef, useState } from 'react'

/** Numeric edits commit once on blur/Enter, and Escape restores the field. */
export default function AudioNumberField({ label, value, onCommit, min, max, step = 1, disabled = false, compact = false, suffix }: {
  label: string; value: number; onCommit: (value: number) => void; min?: number; max?: number; step?: number;
  disabled?: boolean; compact?: boolean; suffix?: string;
}) {
  const [draft, setDraft] = useState(String(Number(value.toFixed(4))))
  const focused = useRef(false)
  const cancelled = useRef(false)
  const dirty = useRef(false)
  useEffect(() => { if (!focused.current) setDraft(String(Number(value.toFixed(4)))) }, [value])
  return <label className={`flex ${compact ? 'items-center gap-1' : 'flex-col gap-1'} min-w-0 text-[10px] text-gray-400`}>
    <span className={compact ? 'sr-only' : ''}>{label}</span>
    <span className="flex items-center gap-1 min-w-0">
      <CalculationNumberInput aria-label={label} value={draft} min={min} max={max} step={step} disabled={disabled}
        className={`${compact ? 'w-14 px-1 py-0.5' : 'w-full px-2 py-1'} min-w-0 rounded bg-gray-950 border border-gray-700 text-xs font-mono text-gray-200 disabled:opacity-40 focus:outline-none focus:border-blue-400`}
        onCalculate={number => { dirty.current = false; cancelled.current = false; if (number !== value) onCommit(number); setDraft(String(number)) }}
        onFocus={() => { focused.current = true; cancelled.current = false; dirty.current = false }}
        onChange={event => { dirty.current = true; setDraft(event.target.value) }}
        onBlur={() => {
          focused.current = false
          const number = Number(draft)
          if (dirty.current && !cancelled.current && draft.trim() && Number.isFinite(number)) {
            const next = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, number))
            if (Math.abs(next - value) > 1e-8) onCommit(next)
            setDraft(String(Number(next.toFixed(4))))
          } else setDraft(String(Number(value.toFixed(4))))
          cancelled.current = false
        }}
        onKeyDown={event => {
          if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() }
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelled.current = true; event.currentTarget.blur() }
        }} />
      {suffix && <span className="text-[9px] text-gray-500">{suffix}</span>}
    </span>
  </label>
}
