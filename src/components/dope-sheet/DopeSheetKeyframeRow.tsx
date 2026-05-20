'use client'
import { useCallback } from 'react'
import type { Track } from '@/lib/types'

interface Props {
  track: Track
  selectedKfIds: Set<string>
  previewMs?: Record<string, number>
  onSelectKey: (kfId: string, shiftKey: boolean, ctrlKey: boolean) => void
  onDragStart?: (e: React.PointerEvent, kfId: string) => void
  msToScreenPx: (timeMs: number) => number
  screenPxToMs?: (px: number) => number
  visibleStartMs: number
  visibleEndMs: number
}

const KEY_SYMBOL_SIZE = 10

export default function DopeSheetKeyframeRow({
  track,
  selectedKfIds,
  previewMs = {},
  onSelectKey,
  onDragStart,
  msToScreenPx,
  screenPxToMs,
  visibleStartMs,
  visibleEndMs,
}: Props) {
  const handleKeyClick = useCallback(
    (e: React.PointerEvent, kfId: string) => {
      e.stopPropagation()
      if (onDragStart && selectedKfIds.has(kfId)) {
        onDragStart(e, kfId)
      } else {
        onSelectKey(kfId, e.shiftKey, (e.ctrlKey || (e as any).metaKey) as boolean)
      }
    },
    [onSelectKey, onDragStart, selectedKfIds],
  )

  // Effective time of a keyframe (preview position while dragging, else its time)
  const timeOf = (kf: { id: string; timeMs: number }) =>
    previewMs?.[kf.id] !== undefined ? previewMs[kf.id] : kf.timeMs

  // All keyframes sorted by effective time. Segments connect consecutive
  // keys so the active span of the track is filled (AE / 3ds Max dope sheet).
  const sortedKeys = [...(track.keyframes || [])].sort((a, b) => timeOf(a) - timeOf(b))

  // Build segment spans between consecutive keys, clipped to the visible range.
  const segments: { id: string; left: number; width: number }[] = []
  for (let i = 0; i < sortedKeys.length - 1; i++) {
    const a = sortedKeys[i]
    const b = sortedKeys[i + 1]
    const aMs = timeOf(a)
    const bMs = timeOf(b)
    // Skip segments fully outside the visible window
    if (bMs < visibleStartMs || aMs > visibleEndMs) continue
    const x1 = msToScreenPx(aMs)
    const x2 = msToScreenPx(bMs)
    segments.push({ id: `${a.id}-${b.id}`, left: x1, width: Math.max(0, x2 - x1) })
  }

  // Keyframe diamonds (only those inside the visible window)
  const visibleKeys = sortedKeys.filter(kf => {
    const t = timeOf(kf)
    return t >= visibleStartMs && t <= visibleEndMs
  })

  return (
    <div className="dope-keyframe-row">
      <div className="track-label">{track.target}</div>

      <div className="key-grid">
        {/* Segment bars connecting consecutive keys */}
        {segments.map(seg => (
          <div
            key={seg.id}
            className="keyframe-segment"
            style={{ left: `${seg.left}px`, width: `${seg.width}px` }}
          />
        ))}

        {/* Keyframe diamonds */}
        {visibleKeys.map(kf => {
          const isSelected = selectedKfIds.has(kf.id)
          const previewTime = previewMs?.[kf.id]
          const displayTime = previewTime !== undefined ? previewTime : kf.timeMs
          const xPos = msToScreenPx(displayTime)
          const isPreview = previewTime !== undefined

          return (
            <div
              key={kf.id}
              className={`keyframe-symbol ${isSelected ? 'selected' : ''} ${isPreview ? 'preview' : ''}`}
              style={{
                left: `${xPos - KEY_SYMBOL_SIZE / 2}px`,
              }}
              onPointerDown={e => handleKeyClick(e as any, kf.id)}
              title={`${kf.timeMs.toFixed(0)}ms${isPreview ? ` → ${displayTime.toFixed(0)}ms` : ''}`}
            >
              {getKeySymbol()}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Keyframe glyph
function getKeySymbol() {
  return '◆'
}
