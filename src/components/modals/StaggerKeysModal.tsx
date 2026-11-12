'use client'
import { CalculationNumberInput } from '@/components/inputs/CalculationNumberInput'
// ── StaggerKeysModal (BL-07) ──────────────────────────────────────────────────
// Apply a cumulative time offset to a multi-keyframe selection so each kf is
// shifted by N × offsetMs where N is its index in time order. Classic motion-
// design move: stagger 5 layers' entry animations 100ms apart with one click.

import { useMemo, useState } from 'react'

export interface StaggerPreviewItem {
  kfId:       string
  trackTarget: string
  /** Human-readable hint shown in the preview list (e.g. "rect1 / opacity"). */
  label:       string
  fromMs:      number
}

interface Props {
  /** All keyframes currently selected, in original (time-sorted) order. */
  items: StaggerPreviewItem[]
  /** Apply the stagger — receives offsetMs + direction; modal closes after. */
  onApply: (offsetMs: number, direction: 'forward' | 'backward') => void
  onClose: () => void
}

export default function StaggerKeysModal({ items, onApply, onClose }: Props) {
  const [offsetMs,   setOffsetMs]   = useState(100)
  const [direction,  setDirection]  = useState<'forward' | 'backward'>('forward')

  // Items are accepted in selection order; for predictable stagger we want
  // them in time order — earliest kf becomes index 0 (no shift), each later
  // kf gets index × offset added (or subtracted, for backward).
  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.fromMs - b.fromMs),
    [items],
  )

  // Preview the after-times the user will get. Mirrors the math inside
  // makeStaggerKeysCmd so what you see is what you'll commit.
  const previewRows = useMemo(() => sortedItems.map((item, idx) => {
    const multiplier = direction === 'forward' ? idx : -idx
    return { ...item, toMs: item.fromMs + offsetMs * multiplier }
  }), [sortedItems, offsetMs, direction])

  function apply() {
    if (sortedItems.length < 2) return
    onApply(offsetMs, direction)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-[440px] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-100">
            Stagger Keys  <span className="text-gray-500 font-normal text-[11px]">({sortedItems.length} selected)</span>
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none">×</button>
        </div>

        {sortedItems.length < 2 ? (
          <div className="text-[11px] text-amber-400 py-4 text-center">
            Select at least 2 keyframes to stagger.
          </div>
        ) : (
          <>
            {/* Offset input */}
            <div className="mb-3">
              <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                Offset per item (ms)
              </label>
              <CalculationNumberInput aria-label="offset Ms"
                autoFocus
                min={0}
                step={10}
                value={offsetMs}
                onChange={(e) => setOffsetMs(Math.max(0, Number(e.target.value) || 0))}
                onKeyDown={(e) => { if (e.key === 'Enter') apply(); if (e.key === 'Escape') onClose() }}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-[12px] text-gray-100 outline-none focus:border-gray-500 font-mono" onCalculate={calculated => setOffsetMs(Math.max(0, calculated || 0))} />
            </div>

            {/* Direction */}
            <div className="mb-3">
              <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">Direction</label>
              <div className="flex gap-1.5">
                {(['forward', 'backward'] as const).map((dir) => (
                  <button
                    key={dir}
                    onClick={() => setDirection(dir)}
                    className={`flex-1 px-2 py-1 text-[11px] rounded border transition-colors ${
                      direction === dir
                        ? 'bg-purple-700 border-purple-500 text-white'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {dir === 'forward' ? 'Forward (→)' : 'Backward (←)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Preview */}
            <div className="mb-4">
              <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">Preview</label>
              <div className="bg-gray-950 border border-gray-800 rounded p-2 max-h-40 overflow-y-auto font-mono text-[10px]">
                {previewRows.map((row, i) => {
                  const delta = row.toMs - row.fromMs
                  const deltaStr = delta === 0 ? '·' : `${delta > 0 ? '+' : ''}${delta.toFixed(0)}ms`
                  return (
                    <div key={row.kfId} className="flex items-center justify-between py-0.5 text-gray-400">
                      <span className="text-gray-600 w-6 shrink-0">[{i}]</span>
                      <span className="flex-1 truncate text-gray-300 px-1" title={row.label}>{row.label}</span>
                      <span className="text-gray-500 w-16 text-right">{row.fromMs.toFixed(0)}</span>
                      <span className="text-gray-600 mx-1">→</span>
                      <span className="text-amber-300 w-16 text-right">{row.toMs.toFixed(0)}</span>
                      <span className="text-gray-600 w-14 text-right ml-1">{deltaStr}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1 text-[11px] rounded bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={apply}
            disabled={sortedItems.length < 2 || offsetMs <= 0}
            className="px-3 py-1 text-[11px] rounded bg-purple-700 hover:bg-purple-600 text-white border border-purple-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}
