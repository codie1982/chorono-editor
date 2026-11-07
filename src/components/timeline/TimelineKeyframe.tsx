'use client'
import type { Keyframe, EasingType } from '@/lib/types'

const EASING_OPTS: EasingType[] = ['linear', 'easeOut', 'easeIn', 'easeInOut', 'hold']

interface Props {
  kf: Keyframe
  /** Screen-px X position — caller already applied previewMs override if dragging */
  x: number
  /** Optional Y offset within the track row (graph editor mode). Default centres vertically. */
  y?: number
  isSelected?: boolean
  isDragging?: boolean
  onSelect: (shiftHeld: boolean) => void
  onDelete: () => void
  onSetEasing: (e: EasingType) => void
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
  /** Right-click handler — opens the keyframe context menu in TimelinePanel. */
  onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void
  /** Double-click — opens inline value editor in TimelinePanel. */
  onDoubleClick?: (e: React.MouseEvent<HTMLDivElement>) => void
}

/**
 * Single diamond on a track.
 *
 * Behaviour:
 *   • click            → replace selection with this kf
 *   • shift+click      → toggle this kf in the selection (multi-select)
 *   • pointerdown drag → begin drag (handled by useKeyframeDrag in panel)
 *   • hover            → tooltip with easing dropdown + delete
 */
export default function TimelineKeyframe({
  kf, x, y, isSelected, isDragging,
  onSelect, onDelete, onSetEasing, onPointerDown, onContextMenu, onDoubleClick,
}: Props) {

  const colorClass = isSelected
    ? 'bg-orange-300 border-orange-500'
    : 'bg-yellow-400 hover:bg-yellow-300 border-yellow-600'

  // When y is provided (graph mode), position by absolute Y instead of vertical-centre.
  const positionStyle: React.CSSProperties = y == null
    ? { left: `${x}px`, top: '50%', transform: 'translate(-50%, -50%)' }
    : { left: `${x}px`, top: `${y}px`, transform: 'translate(-50%, -50%)' }

  return (
    <div
      className="absolute group z-10"
      data-kf-id={kf.id}
      tabIndex={0}
      role="button"
      aria-label={`Keyframe at ${Math.round(kf.timeMs)} milliseconds`}
      aria-pressed={!!isSelected}
      style={positionStyle}
      onClick={(e) => {
        e.stopPropagation()
        // Pointer clicks are selected once by useKeyframeDrag.onLoneClick.
        // detail=0 preserves assistive/programmatic click activation.
        if (e.detail === 0) onSelect(e.shiftKey)
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
        e.preventDefault()
        e.stopPropagation()
        onSelect(e.shiftKey)
      }}
      onPointerDown={onPointerDown}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
    >
      <div className={`w-3 h-3 rotate-45 cursor-grab active:cursor-grabbing border transition-transform
        ${colorClass}
        ${isDragging || isSelected ? 'scale-125' : 'hover:scale-125'}`} />

      {/* Tooltip — hidden during drag */}
      {!isDragging && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1
                        hidden group-hover:flex flex-col items-center z-20">
          <div className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-[10px] text-gray-200
                          whitespace-nowrap shadow-xl min-w-[120px]">
            <div className="font-mono mb-1">
              {Math.round(kf.timeMs)}ms = {
                typeof kf.value === 'number' ? kf.value.toFixed(3) : String(kf.value)
              }
            </div>
            <select
              value={kf.easing?.type ?? 'linear'}
              onChange={(e) => onSetEasing(e.target.value as EasingType)}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="w-full bg-gray-700 border border-gray-600 rounded text-[10px] text-gray-300
                         focus:outline-none px-1 py-0.5"
            >
              {EASING_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              onPointerDown={(e) => e.stopPropagation()}
              className="w-full mt-1 text-red-400 hover:text-red-300 text-center"
            >
              Delete
            </button>
          </div>
          <div className="w-2 h-2 bg-gray-800 border-r border-b border-gray-600 rotate-45 -mt-1" />
        </div>
      )}
    </div>
  )
}
