'use client'
/**
 * BL-53 — Bulk Operations Toolbar
 *
 * Inline strip that appears between the panel header and the column header
 * whenever 2 or more rows are selected. Surfaces the most common bulk
 * actions one click away — full menu still available via right-click.
 *
 * Flag toggles use the "ANY off → all on; else all off" convention so the
 * button is a stateful toggle (lit when EVERY selected layer has the flag
 * on).
 */

import type { Layer } from '@/lib/types'

interface Props {
  selectedLayers: Layer[]
  onBulkToggleFlag: (ids: string[], field: 'locked' | 'hidden' | 'solo' | 'pinned', nextValue: boolean) => void
  onBulkColor:     (ids: string[], color: string | null) => void
  onGroup:         (ids: string[]) => void
  onDelete:        (ids: string[]) => void
  onClear:         () => void
}

const COLOR_LABELS = [
  { hex: '#3B82F6', name: 'Blue'   },
  { hex: '#06B6D4', name: 'Cyan'   },
  { hex: '#22C55E', name: 'Green'  },
  { hex: '#EAB308', name: 'Yellow' },
  { hex: '#F97316', name: 'Orange' },
  { hex: '#EF4444', name: 'Red'    },
  { hex: '#A855F7', name: 'Purple' },
  { hex: '#EC4899', name: 'Pink'   },
]

export default function BulkOperationsToolbar({
  selectedLayers, onBulkToggleFlag, onBulkColor, onGroup, onDelete, onClear,
}: Props) {
  const ids = selectedLayers.map((l) => l.id)
  const n   = ids.length

  // Mixed-state aware: if any layer is OFF for the flag, clicking should
  // turn them ALL on (and vice versa).
  const flagState = (field: 'locked' | 'hidden' | 'solo' | 'pinned') => {
    const allOn   = selectedLayers.every((l) => !!l[field])
    const allOff  = selectedLayers.every((l) => !l[field])
    return { allOn, allOff, mixed: !allOn && !allOff, nextValue: !allOn }
  }

  const lockedSt = flagState('locked')
  const hiddenSt = flagState('hidden')
  const soloSt   = flagState('solo')
  const pinnedSt = flagState('pinned')

  const btn = (active: boolean, mixed: boolean) =>
    `px-2 py-0.5 text-[10px] font-mono rounded transition-colors ${
      active ? 'bg-blue-600 text-white'
      : mixed ? 'bg-amber-700/60 text-amber-200'
      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
    }`

  return (
    <div className="flex items-center gap-1 px-2 py-1 border-b border-gray-700 bg-gray-850 shrink-0">
      <span className="text-[10px] font-mono text-blue-300 mr-1">{n} selected</span>

      <button
        className={btn(hiddenSt.allOn, hiddenSt.mixed)}
        title="Toggle Hidden (👁)"
        onClick={() => onBulkToggleFlag(ids, 'hidden', hiddenSt.nextValue)}
      >👁</button>
      <button
        className={btn(lockedSt.allOn, lockedSt.mixed)}
        title="Toggle Locked (🔒)"
        onClick={() => onBulkToggleFlag(ids, 'locked', lockedSt.nextValue)}
      >🔒</button>
      <button
        className={btn(soloSt.allOn, soloSt.mixed)}
        title="Toggle Solo (★)"
        onClick={() => onBulkToggleFlag(ids, 'solo', soloSt.nextValue)}
      >★</button>
      <button
        className={btn(pinnedSt.allOn, pinnedSt.mixed)}
        title="Toggle Pinned (📌)"
        onClick={() => onBulkToggleFlag(ids, 'pinned', pinnedSt.nextValue)}
      >📌</button>

      <span className="w-px h-4 bg-gray-700 mx-1" />

      <button
        className="px-2 py-0.5 text-[10px] font-mono rounded bg-gray-700 hover:bg-gray-600 text-gray-300"
        title="Wrap selection in a group (⌘G)"
        onClick={() => onGroup(ids)}
      >Group</button>
      <button
        className="px-2 py-0.5 text-[10px] font-mono rounded bg-red-800 hover:bg-red-700 text-red-100"
        title="Delete selected layers"
        onClick={() => onDelete(ids)}
      >Delete</button>

      <span className="w-px h-4 bg-gray-700 mx-1" />

      {/* Color label swatches */}
      <div className="flex items-center gap-0.5" title="Set color label">
        <button
          onClick={() => onBulkColor(ids, null)}
          className="w-3.5 h-3.5 rounded-sm border border-dashed border-gray-600 hover:border-gray-400"
          title="Clear color label"
        />
        {COLOR_LABELS.map((c) => (
          <button
            key={c.hex}
            onClick={() => onBulkColor(ids, c.hex)}
            className="w-3.5 h-3.5 rounded-sm border border-gray-700 hover:border-gray-300"
            style={{ background: c.hex }}
            title={`Set color: ${c.name}`}
          />
        ))}
      </div>

      <button
        className="ml-auto px-1.5 py-0.5 text-[9px] font-mono text-gray-500 hover:text-gray-300"
        title="Clear selection"
        onClick={onClear}
      >✕ clear</button>
    </div>
  )
}
