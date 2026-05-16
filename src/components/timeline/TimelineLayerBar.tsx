'use client'
import type { Layer } from '@/lib/types'

interface Props {
  layer: Layer
  durationMs: number
  msToScreenPx: (timeMs: number) => number
  isSelected: boolean
  onSelect: () => void
}

/**
 * One layer bar in the timeline track area — shows the layer's active range
 * (startMs → endMs). When startMs/endMs are unset the bar spans the full
 * timeline. Visual only for now; trim handles arrive in Sprint B.
 */
export default function TimelineLayerBar({
  layer, durationMs, msToScreenPx, isSelected, onSelect,
}: Props) {
  const startMs = layer.startMs ?? 0
  const endMs   = layer.endMs   ?? durationMs
  const xStart  = msToScreenPx(startMs)
  const xEnd    = msToScreenPx(endMs)
  const width   = Math.max(2, xEnd - xStart)

  const color = layer.colorLabel ?? '#3B82F6'

  return (
    <div
      onClick={onSelect}
      className={`absolute top-1 bottom-1 rounded cursor-pointer transition-all
        ${isSelected ? 'ring-1 ring-blue-300' : ''}`}
      style={{
        left:  `${xStart}px`,
        width: `${width}px`,
        backgroundColor: color,
        opacity: layer.hidden ? 0.15 : 0.35,
      }}
      title={`${layer.name}  (${Math.round(startMs)} – ${Math.round(endMs)} ms)`}
    >
      <span className="absolute left-1.5 top-0.5 text-[9px] text-white/90 font-medium truncate max-w-full pr-1">
        {layer.name}
      </span>
    </div>
  )
}
