'use client'
import type { EasingType } from '@/lib/types'

interface Props {
  /** True if the current timeline has any keyframes at all. */
  hasKeyframes: boolean
  /** Number of currently selected keyframes. */
  selectedCount: number
  /** Composition frame rate (for slide-by-frame steps). */
  frameRate: number
  onSelectAll:      () => void
  onDeleteSelected: () => void
  onEaseSelected:   (type: EasingType) => void
  /** BL-07: Bulk-shift every selected keyframe by `deltaMs`. */
  onSlideSelected?: (deltaMs: number) => void
  /** BL-07: Open the Stagger Keys modal. */
  onOpenStaggerModal?: () => void
  /** BL-07: Toggle the Keyframe Spreadsheet panel for the selection. */
  onOpenKeySpreadsheet?: () => void
}

const EASING_BUTTONS: { type: EasingType; label: string; title: string }[] = [
  { type: 'linear',    label: '╱',    title: 'Linear'       },
  { type: 'easeIn',   label: '◜ in', title: 'Ease In'      },
  { type: 'easeOut',  label: '◝ out',title: 'Ease Out'     },
  { type: 'easeInOut',label: '◠ io', title: 'Ease In Out'  },
  { type: 'hold',     label: '┐ hold',title: 'Hold (step)' },
]

export default function TrackToolBar({
  hasKeyframes, selectedCount, frameRate,
  onSelectAll, onDeleteSelected, onEaseSelected,
  onSlideSelected, onOpenStaggerModal, onOpenKeySpreadsheet,
}: Props) {
  const hasSelection = selectedCount > 0
  // Frame duration (ms) for one-frame slide. Falls back to 33ms (~30fps) if unset.
  const frameMs = frameRate > 0 ? 1000 / frameRate : 33.333

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

      {/* BL-07: Slide / Stagger / Spreadsheet — bulk timing tools */}
      {onSlideSelected && (
        <>
          <div className="w-px h-3 bg-gray-700 mx-0.5 shrink-0" />
          <button
            onClick={() => onSlideSelected(-frameMs)}
            disabled={!hasSelection}
            title={`Slide selected keyframes back 1 frame  (-${frameMs.toFixed(1)}ms)`}
            className="px-1.5 py-0.5 text-[10px] rounded bg-gray-800 hover:bg-amber-900
                       text-gray-500 hover:text-amber-300 border border-gray-700
                       disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-mono"
          >◀F</button>
          <button
            onClick={() => onSlideSelected(frameMs)}
            disabled={!hasSelection}
            title={`Slide selected keyframes forward 1 frame  (+${frameMs.toFixed(1)}ms)`}
            className="px-1.5 py-0.5 text-[10px] rounded bg-gray-800 hover:bg-amber-900
                       text-gray-500 hover:text-amber-300 border border-gray-700
                       disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-mono"
          >F▶</button>
        </>
      )}
      {onOpenStaggerModal && (
        <button
          onClick={onOpenStaggerModal}
          disabled={selectedCount < 2}
          title="Stagger selected keyframes — cascade their times by a fixed offset"
          className="px-2 py-0.5 text-[10px] rounded bg-gray-800 hover:bg-purple-900
                     text-gray-500 hover:text-purple-300 border border-gray-700
                     disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-mono"
        >⇉ Stagger</button>
      )}
      {onOpenKeySpreadsheet && (
        <button
          onClick={onOpenKeySpreadsheet}
          disabled={!hasSelection}
          title="Open the keyframe spreadsheet for the selection (edit time + value inline)"
          className="px-2 py-0.5 text-[10px] rounded bg-gray-800 hover:bg-cyan-900
                     text-gray-500 hover:text-cyan-300 border border-gray-700
                     disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-mono"
        >⊞ Sheet</button>
      )}

      {hasSelection && (
        <span className="ml-auto text-[10px] font-mono text-gray-600">
          {selectedCount} selected
        </span>
      )}
    </div>
  )
}
