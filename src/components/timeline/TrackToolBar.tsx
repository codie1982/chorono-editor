'use client'
import type { EasingType } from '@/lib/types'

interface Props {
  /** True if the current timeline has any keyframes at all. */
  hasKeyframes: boolean
  /** Number of currently selected keyframes. */
  selectedCount: number
  onSelectAll:      () => void
  onDeleteSelected: () => void
  onEaseSelected:   (type: EasingType) => void
}

const EASING_BUTTONS: { type: EasingType; label: string; title: string }[] = [
  { type: 'linear',    label: '╱',    title: 'Linear'       },
  { type: 'easeIn',   label: '◜ in', title: 'Ease In'      },
  { type: 'easeOut',  label: '◝ out',title: 'Ease Out'     },
  { type: 'easeInOut',label: '◠ io', title: 'Ease In Out'  },
  { type: 'hold',     label: '┐ hold',title: 'Hold (step)' },
]

export default function TrackToolBar({
  hasKeyframes, selectedCount, onSelectAll, onDeleteSelected, onEaseSelected,
}: Props) {
  const hasSelection = selectedCount > 0

  return (
    <div className="flex items-center gap-1.5 px-3 py-1 border-b border-gray-700/60 bg-gray-900 shrink-0">

      {/* Selection actions */}
      <button
        onClick={onSelectAll}
        disabled={!hasKeyframes}
        title="Select all keyframes in timeline"
        className="px-2 py-0.5 text-[10px] rounded bg-gray-800 hover:bg-gray-700
                   text-gray-400 hover:text-gray-200 border border-gray-700
                   disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        All
      </button>

      <button
        onClick={onDeleteSelected}
        disabled={!hasSelection}
        title="Delete selected keyframes"
        className="px-2 py-0.5 text-[10px] rounded bg-gray-800 hover:bg-red-900
                   text-gray-400 hover:text-red-300 border border-gray-700
                   disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {hasSelection ? `Delete (${selectedCount})` : 'Delete'}
      </button>

      <div className="w-px h-3 bg-gray-700 mx-0.5 shrink-0" />

      {/* Bulk easing buttons */}
      {EASING_BUTTONS.map(({ type, label, title }) => (
        <button
          key={type}
          onClick={() => onEaseSelected(type)}
          disabled={!hasSelection}
          title={`Set easing to ${title} for selected keyframes`}
          className="px-2 py-0.5 text-[10px] rounded bg-gray-800 hover:bg-blue-900
                     text-gray-500 hover:text-blue-300 border border-gray-700
                     disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-mono"
        >
          {label}
        </button>
      ))}

      {hasSelection && (
        <span className="ml-auto text-[10px] font-mono text-gray-600">
          {selectedCount} selected
        </span>
      )}
    </div>
  )
}
