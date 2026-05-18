'use client'
// ── MappingPresets (BL-05) ────────────────────────────────────────────────────
// Categorized dropdown that writes a chosen formula into the WireParameterModal's
// expression input. Selecting "Custom" leaves the expression as the user typed
// it; selecting any preset overwrites it. When the typed expression matches a
// preset exactly, the picker shows that preset as active.

import { useEffect, useRef, useState } from 'react'
import { findMatchingPreset, groupedPresets, type MappingPreset } from './presets'

interface Props {
  expression: string
  onChange: (next: string) => void
}

export default function MappingPresets({ expression, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const onDocDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [open])

  const active = findMatchingPreset(expression)
  const groups = groupedPresets()

  function pick(p: MappingPreset) {
    onChange(p.expression)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="px-2 py-1 text-[11px] rounded bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 font-mono flex items-center gap-1"
      >
        <span className="text-gray-500">preset:</span>
        <span className="text-gray-100">{active?.label ?? 'Custom'}</span>
        <span className="text-gray-500 text-[9px] ml-1">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 mt-1 w-[280px] max-h-[360px] overflow-y-auto bg-gray-900 border border-gray-700 rounded-md shadow-2xl z-50 text-[11px]">
          {groups.map(({ category, items }) => (
            <div key={category}>
              <div className="px-2 pt-2 pb-1 text-[9px] uppercase tracking-wider text-gray-500 font-semibold border-t border-gray-800 first:border-t-0">
                {category}
              </div>
              {items.map((p) => {
                const isActive = active?.label === p.label
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => pick(p)}
                    className={`w-full text-left px-2 py-1 hover:bg-gray-800 ${
                      isActive ? 'bg-sky-900/40' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={isActive ? 'text-sky-200' : 'text-gray-200'}>
                        {isActive && '✓ '}
                        {p.label}
                      </span>
                    </div>
                    <div className="text-[9px] text-amber-400/80 font-mono mt-0.5 truncate">
                      {p.expression}
                    </div>
                    {p.description && (
                      <div className="text-[9px] text-gray-500 mt-0.5">{p.description}</div>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
