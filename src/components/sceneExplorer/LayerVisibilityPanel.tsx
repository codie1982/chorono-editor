'use client'
/**
 * BL-55 — Layer Visibility & Actions popover
 *
 * Compact dropdown opened from the SceneExplorer toolbar. Two columns of
 * controls: TYPE FILTERS on the left (show / hide layers by kind), STATE
 * ACTIONS on the right (Isolate / Show All / Freeze the selection).
 *
 * Designed to feel like 3ds Max's Scene Explorer filter dropdown: a tight
 * grid of checkable filter pills + a row of action buttons. State lives in
 * the panel (filters are editor-only preferences) — this component only
 * renders and emits intent.
 */

import { useEffect, useRef, useState } from 'react'
import type { LayerVisibilityFilters, LayerTypeFilterKey } from '@/lib/sceneExplorer/visibilityFilters'

interface Props {
  filters:    LayerVisibilityFilters
  onChange:   (next: LayerVisibilityFilters) => void
  selectionCount: number
  onIsolate?: () => void
  onShowAll?: () => void
  onFreezeSelection?:   () => void
  onUnfreezeSelection?: () => void
}

const TYPE_PILLS: Array<{ key: LayerTypeFilterKey; label: string; icon: string }> = [
  { key: 'shape',    label: 'Shapes',    icon: '◼' },
  { key: 'text',     label: 'Text',      icon: 'T' },
  { key: 'image',    label: 'Images',    icon: '🖼' },
  { key: 'video',    label: 'Videos',    icon: '▶' },
  { key: 'audio',    label: 'Audio',     icon: '♪' },
  { key: 'path',     label: 'Paths',     icon: '✎' },
  { key: 'group',    label: 'Groups',    icon: '▣' },
  { key: 'repeater', label: 'Repeaters', icon: '⟳' },
]

export default function LayerVisibilityPanel({
  filters, onChange, selectionCount,
  onIsolate, onShowAll, onFreezeSelection, onUnfreezeSelection,
}: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const toggleType = (key: LayerTypeFilterKey) => {
    onChange({ ...filters, types: { ...filters.types, [key]: !filters.types[key] } })
  }

  // Active = at least one filter narrows the view.
  const allTypesOn = TYPE_PILLS.every((p) => filters.types[p.key])
  const filtersActive = !allTypesOn || filters.onlyAnimated || filters.onlyWithEffects

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Visibility filters & layer actions"
        className={`px-2 py-0.5 text-[10px] font-mono rounded transition-colors ${
          filtersActive
            ? 'bg-purple-700 text-white hover:bg-purple-600'
            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
        }`}
      >
        ⚙ Filters{filtersActive && ' ●'}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-80 bg-gray-900 border border-gray-700 rounded shadow-xl p-3 space-y-3">
          {/* Type filters */}
          <div>
            <div className="text-[9px] font-mono uppercase text-gray-500 mb-1.5">
              Show by Type
            </div>
            <div className="grid grid-cols-2 gap-1">
              {TYPE_PILLS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => toggleType(p.key)}
                  className={`flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono rounded transition-colors ${
                    filters.types[p.key]
                      ? 'bg-blue-700/40 text-blue-200 hover:bg-blue-700/60'
                      : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
                  }`}
                >
                  <span className="w-3 inline-block text-center">{p.icon}</span>
                  <span className="flex-1 text-left">{p.label}</span>
                  <span className="text-[8px]">{filters.types[p.key] ? '☑' : '☐'}</span>
                </button>
              ))}
            </div>

            <div className="flex gap-1 mt-1.5">
              <button
                onClick={() => onChange({
                  ...filters,
                  types: TYPE_PILLS.reduce((acc, p) => ({ ...acc, [p.key]: true }), {} as Record<LayerTypeFilterKey, boolean>),
                })}
                className="flex-1 px-2 py-0.5 text-[9px] font-mono rounded bg-gray-800 hover:bg-gray-700 text-gray-300"
              >Enable all</button>
              <button
                onClick={() => onChange({
                  ...filters,
                  types: TYPE_PILLS.reduce((acc, p) => ({ ...acc, [p.key]: false }), {} as Record<LayerTypeFilterKey, boolean>),
                })}
                className="flex-1 px-2 py-0.5 text-[9px] font-mono rounded bg-gray-800 hover:bg-gray-700 text-gray-300"
              >Disable all</button>
            </div>
          </div>

          {/* Behaviour filters */}
          <div className="pt-2 border-t border-gray-800 space-y-1">
            <label className="flex items-center gap-2 text-[10px] font-mono text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.onlyAnimated}
                onChange={(e) => onChange({ ...filters, onlyAnimated: e.target.checked })}
                className="accent-blue-500"
              />
              Only animated layers
            </label>
            <label className="flex items-center gap-2 text-[10px] font-mono text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.onlyWithEffects}
                onChange={(e) => onChange({ ...filters, onlyWithEffects: e.target.checked })}
                className="accent-blue-500"
              />
              Only with effects / masks
            </label>
          </div>

          {/* State actions */}
          <div className="pt-2 border-t border-gray-800 space-y-1.5">
            <div className="text-[9px] font-mono uppercase text-gray-500">
              Selection actions
            </div>
            <div className="grid grid-cols-2 gap-1">
              <button
                disabled={!onIsolate || selectionCount === 0}
                onClick={() => { onIsolate?.(); setOpen(false) }}
                className="px-2 py-1 text-[10px] font-mono rounded bg-amber-700 hover:bg-amber-600 text-white disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed"
                title="Hide all layers except the selected ones"
              >Isolate ({selectionCount})</button>
              <button
                disabled={!onShowAll}
                onClick={() => { onShowAll?.(); setOpen(false) }}
                className="px-2 py-1 text-[10px] font-mono rounded bg-gray-700 hover:bg-gray-600 text-gray-200 disabled:bg-gray-800 disabled:text-gray-600"
                title="Clear hidden + solo on all layers"
              >Show All</button>
              <button
                disabled={!onFreezeSelection || selectionCount === 0}
                onClick={() => { onFreezeSelection?.(); setOpen(false) }}
                className="px-2 py-1 text-[10px] font-mono rounded bg-cyan-700 hover:bg-cyan-600 text-white disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed"
                title="Freeze: visible but not selectable / editable"
              >❄ Freeze</button>
              <button
                disabled={!onUnfreezeSelection || selectionCount === 0}
                onClick={() => { onUnfreezeSelection?.(); setOpen(false) }}
                className="px-2 py-1 text-[10px] font-mono rounded bg-gray-700 hover:bg-gray-600 text-gray-200 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed"
              >Unfreeze</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
