import React from 'react'

// ── Anchor point handle (pivot for rotation / scale) ─────────────────────────

interface AnchorProps {
  x: number; y: number
  isDragging?: boolean
  onPointerDown?: (e: React.PointerEvent) => void
  kind?: 'origin' | 'pivot'
  label?: string
}

/**
 * Crosshair-in-a-ring handle marking the layer's anchor point. Draggable —
 * moves transform.anchorX/Y. Sits above the selection frame so it's always
 * reachable, but uses pointer-events:auto only on the inner hit area so it
 * doesn't block other interactions.
 */
export function AnchorHandle({ x, y, isDragging, onPointerDown, kind = 'origin', label }: AnchorProps) {
  const description = label ?? (kind === 'pivot' ? 'Selection rotation center' : 'Object origin / rotation center')
  return (
    <div
      role="img"
      aria-label={description}
      data-transform-marker={kind}
      onPointerDown={onPointerDown}
      title={onPointerDown ? `${description} — drag to reposition` : description}
      className={`absolute z-50 select-none ${onPointerDown ? 'pointer-events-auto cursor-move' : 'pointer-events-none'}`}
      style={{ left: `${x}px`, top: `${y}px`, transform: 'translate(-50%, -50%)' }}
    >
      <div className={`relative w-4 h-4 rounded-full border-2 transition-transform
        ${isDragging
          ? 'border-orange-400 bg-orange-400/40 scale-125'
          : kind === 'pivot' ? 'border-cyan-300 bg-slate-950/80' : 'border-orange-400 bg-slate-950/80 hover:scale-110'}`}>
        {/* crosshair */}
        <span className={`absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 ${kind === 'pivot' ? 'bg-cyan-300' : 'bg-orange-400'}`} />
        <span className={`absolute top-1/2 left-0 right-0 h-px -translate-y-1/2 ${kind === 'pivot' ? 'bg-cyan-300' : 'bg-orange-400'}`} />
      </div>
    </div>
  )
}
