import React from 'react'

// ── Rotate-mode visible ring ──────────────────────────────────────────────
// Big orange ring around the anchor — pointer down anywhere on the ring's
// 16px-wide click band starts a rotation. Replaces the corner dots in
// Rotate mode (those become invisible in this mode). Radius adapts to
// the layer's size so the ring stays outside the frame even on big shapes.
interface RotateRingProps {
  x: number; y: number
  radius: number
  isDragging: boolean
  onPointerDown: (e: React.PointerEvent) => void
}
export function RotateRing({ x, y, radius, isDragging, onPointerDown }: RotateRingProps) {
  const BAND = 8                // click-band width on each side
  const outer = radius + BAND
  const dim = outer * 2
  return (
    <div
      className="absolute pointer-events-none"
      style={{ left: `${x}px`, top: `${y}px`, zIndex: 48 }}
    >
      {/* Visible ring (dashed when idle, solid when dragging) */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          left: -radius, top: -radius, width: radius * 2, height: radius * 2,
          border: `2px ${isDragging ? 'solid' : 'dashed'} ${isDragging ? '#fb923c' : '#fb923c99'}`,
          boxShadow: isDragging ? '0 0 8px #fb923c66' : undefined,
        }}
      />
      {/* Wider transparent click band — use SVG circle stroke since
          CSS-only ring hit-testing would also cover the disc interior. */}
      <svg
        width={dim} height={dim}
        viewBox={`0 0 ${dim} ${dim}`}
        className="absolute"
        style={{ left: -outer, top: -outer, overflow: 'visible' }}
      >
        <circle
          cx={outer} cy={outer} r={radius}
          fill="none"
          stroke="transparent"
          strokeWidth={BAND * 2}
          style={{ pointerEvents: 'stroke', cursor: 'grab' }}
          onPointerDown={onPointerDown}
        />
      </svg>
    </div>
  )
}
