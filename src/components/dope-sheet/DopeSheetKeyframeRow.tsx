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
  // Filter visible keyframes
  const visibleKeyframes = (track.keyframes || []).filter(
    kf => kf.timeMs >= visibleStartMs && kf.timeMs <= visibleEndMs,
  )

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

  // Get visual symbol for keyframe
  const getKeySymbol = () => '◆'

  return (
    <div className="dope-keyframe-row">
      <div className="track-label">{track.target}</div>

      <div className="key-grid">
        {visibleKeyframes.map(kf => {
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
