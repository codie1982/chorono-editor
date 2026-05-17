'use client'
// ── EventStrip (BL-36) ──────────────────────────────────────────────────────
// Thin strip rendered below the SegmentStrip. One ▲ marker per timeline
// event, anchored at the event's `timeMs`. The strip is purely visual +
// interaction routing — parent owns the underlying TimelineEvent[] and
// dispatches the actual add/edit/delete commands.
//
//   – click a marker        → onEdit (rename/payload — for now: prompt)
//   – right-click a marker  → onDelete
//   – double-click strip    → onCreateAt(ms) — quick add
//   – right-click strip     → onCreateAt(ms) (alias)

import { useState } from 'react'
import type { TimelineEvent } from '@/lib/types'

interface Props {
  events:          TimelineEvent[]
  durationMs:      number
  totalContentPx:  number
  msToScreenPx:    (timeMs: number) => number
  clientXToMs:     (clientX: number) => number
  onCreateAt?:     (timeMs: number) => void
  onEdit?:         (event: TimelineEvent) => void
  onDelete?:       (event: TimelineEvent) => void
}

export default function EventStrip({
  events, durationMs, totalContentPx,
  msToScreenPx, clientXToMs,
  onCreateAt, onEdit, onDelete,
}: Props) {
  const [hover, setHover] = useState<{ x: number; ms: number } | null>(null)

  return (
    <div
      className="h-4 bg-gray-950/60 border-b border-gray-800 relative overflow-hidden select-none"
      onDoubleClick={(e) => {
        if (!onCreateAt) return
        const ms = clientXToMs(e.clientX)
        onCreateAt(Math.max(0, Math.min(durationMs, ms)))
      }}
      onContextMenu={(e) => {
        if (!onCreateAt) return
        // Avoid hijacking right-click that lands on a marker (it has its own handler)
        const tgt = e.target as HTMLElement
        if (tgt.closest('[data-event-id]')) return
        e.preventDefault()
        const ms = clientXToMs(e.clientX)
        onCreateAt(Math.max(0, Math.min(durationMs, ms)))
      }}
      onPointerMove={(e) => {
        if (!totalContentPx) return
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
        setHover({ x: e.clientX - rect.left, ms: clientXToMs(e.clientX) })
      }}
      onPointerLeave={() => setHover(null)}
      title="Double-click to add an event"
    >
      {events.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-[8px] text-gray-700 italic pointer-events-none">
          Double-click to add an event
        </div>
      )}

      {events.map((ev) => {
        const x = msToScreenPx(ev.timeMs)
        if (x < -10 || x > totalContentPx + 10) return null
        return (
          <div
            key={ev.id}
            data-event-id={ev.id}
            className="absolute top-0 bottom-0 flex items-center justify-center cursor-pointer
                       text-green-300 hover:text-white hover:scale-110 transition-transform"
            style={{ left: `${x - 6}px`, width: 12 }}
            onClick={(e) => { e.stopPropagation(); onEdit?.(ev) }}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onDelete?.(ev) }}
            title={`${ev.name} @ ${Math.round(ev.timeMs)}ms\nClick: rename · Right-click: delete`}
          >
            <span className="text-[10px] leading-none font-bold drop-shadow-[0_0_2px_rgba(0,0,0,0.8)]">
              ▲
            </span>
          </div>
        )
      })}

      {hover && (
        <div
          className="absolute top-0 h-full w-px bg-white/20 pointer-events-none"
          style={{ left: `${hover.x}px` }}
        />
      )}
    </div>
  )
}
