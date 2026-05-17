'use client'
// ── SegmentStrip ──────────────────────────────────────────────────────────────
// Visual strip rendered immediately below the timeline ruler. Shows every
// segment defined on the active timeline as a coloured band:
//
//   – click a band         → request playback (runtime.playSegment) when
//                             onPlaySegment is wired up
//   – click an empty area  → open the SegmentModal in "create" mode
//   – double-click a band  → open the SegmentModal in "edit" mode
//
// Segment creation / editing is handed off to the parent — this component
// is purely visual + interaction routing.

import { useState } from 'react'
import type { TimelineSegment } from '@/lib/types'

interface Props {
  segments:        TimelineSegment[]
  durationMs:      number
  totalContentPx:  number
  msToScreenPx:    (timeMs: number) => number
  clientXToMs:     (clientX: number) => number
  onCreateAt?:     (timeMs: number) => void
  onEdit?:         (segment: TimelineSegment) => void
  onPlay?:         (segmentId: string) => void
  onDelete?:       (segment: TimelineSegment) => void
  activeSegmentId?: string | null
}

export default function SegmentStrip({
  segments, durationMs, totalContentPx,
  msToScreenPx, clientXToMs,
  onCreateAt, onEdit, onPlay, onDelete, activeSegmentId,
}: Props) {
  const [hover, setHover] = useState<{ x: number; ms: number } | null>(null)

  function handleStripDoubleClick(e: React.PointerEvent<HTMLDivElement>) {
    if (!onCreateAt) return
    const ms = clientXToMs(e.clientX)
    onCreateAt(Math.max(0, Math.min(durationMs, ms)))
  }

  return (
    <div
      className="h-5 bg-gray-900/70 border-b border-gray-800 relative overflow-hidden cursor-pointer select-none"
      onDoubleClick={handleStripDoubleClick}
      onPointerMove={(e) => {
        if (!totalContentPx) return
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
        setHover({ x: e.clientX - rect.left, ms: clientXToMs(e.clientX) })
      }}
      onPointerLeave={() => setHover(null)}
      title="Double-click to create a segment"
    >
      {segments.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-[9px] text-gray-600 italic pointer-events-none">
          Double-click to add a segment
        </div>
      )}

      {segments.map((s) => {
        const left = msToScreenPx(s.startMs)
        const right = msToScreenPx(s.endMs)
        const width = Math.max(2, right - left)
        if (right < -10 || left > totalContentPx + 10) return null
        const active = s.id === activeSegmentId
        return (
          <div
            key={s.id}
            className={`group absolute top-0.5 bottom-0.5 rounded-sm flex items-center px-1.5 overflow-hidden ${
              active ? 'ring-1 ring-white/70' : ''
            }`}
            style={{
              left:  `${left}px`,
              width: `${width}px`,
              background: (s.color ?? '#22D3EE') + 'cc',
            }}
            onClick={(e) => { e.stopPropagation(); onPlay?.(s.id) }}
            onDoubleClick={(e) => { e.stopPropagation(); onEdit?.(s) }}
            onContextMenu={(e) => {
              e.preventDefault(); e.stopPropagation()
              if (!onDelete) return
              if (window.confirm(`Delete segment "${s.name}"?`)) onDelete(s)
            }}
            title={`${s.name} (${s.startMs}–${s.endMs}ms)\nClick: play · Double-click: edit · Right-click: delete`}
          >
            <span className="text-[9px] text-gray-900 font-semibold truncate flex-1">{s.name}</span>
            {onDelete && width > 30 && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (window.confirm(`Delete segment "${s.name}"?`)) onDelete(s)
                }}
                onDoubleClick={(e) => e.stopPropagation()}
                className="hidden group-hover:flex shrink-0 w-3 h-3 items-center justify-center
                           rounded-full bg-black/30 hover:bg-rose-600 text-white text-[10px] leading-none"
                title="Delete segment"
              >×</button>
            )}
          </div>
        )
      })}

      {hover && (
        <div
          className="absolute top-0 h-full w-px bg-white/30 pointer-events-none"
          style={{ left: `${hover.x}px` }}
        />
      )}
    </div>
  )
}
