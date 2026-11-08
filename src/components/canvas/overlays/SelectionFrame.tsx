import React from 'react'
import { type Handle, HANDLE_CURSORS } from '../types/canvasDragTypes'

// ── Selection frame with 8 resize handles ────────────────────────────────────

interface FrameProps {
  x: number; y: number; w: number; h: number
  /** Anchor position in screen px RELATIVE to the frame's top-left.
   *  Used as the CSS transform-origin so the frame rotates around the
   *  same pivot as the rendered layer. */
  anchorOffsetX: number
  anchorOffsetY: number
  rotationDeg: number
  /** Resize handles render only when provided (Scale + Select modes). */
  onHandlePointerDown?: (h: Handle) => (e: React.PointerEvent) => void
  /** Rotate handles render only when provided (Rotate + Select modes). */
  onRotatePointerDown?: (e: React.PointerEvent) => void
}

export function SelectionFrame({
  x, y, w, h, anchorOffsetX, anchorOffsetY, rotationDeg,
  onHandlePointerDown, onRotatePointerDown,
}: FrameProps) {
  // 8 resize handles on the frame perimeter (corners + edge midpoints)
  const handles: Array<{ key: Handle; cx: number; cy: number }> = [
    { key: 'nw', cx: 0,     cy: 0     },
    { key: 'n',  cx: w / 2, cy: 0     },
    { key: 'ne', cx: w,     cy: 0     },
    { key: 'w',  cx: 0,     cy: h / 2 },
    { key: 'e',  cx: w,     cy: h / 2 },
    { key: 'sw', cx: 0,     cy: h     },
    { key: 's',  cx: w / 2, cy: h     },
    { key: 'se', cx: w,     cy: h     },
  ]
  // Rotation handles: 4 smaller dots 10px diagonally OUTSIDE each corner.
  const ROT_OFFSET = 10
  const rotHandles: Array<{ key: string; cx: number; cy: number }> = [
    { key: 'rot-nw', cx: -ROT_OFFSET,     cy: -ROT_OFFSET     },
    { key: 'rot-ne', cx: w + ROT_OFFSET,  cy: -ROT_OFFSET     },
    { key: 'rot-sw', cx: -ROT_OFFSET,     cy: h + ROT_OFFSET  },
    { key: 'rot-se', cx: w + ROT_OFFSET,  cy: h + ROT_OFFSET  },
  ]

  return (
    <div
      data-testid="selection-frame"
      className="absolute pointer-events-none"
      style={{
        left: x, top: y, width: w, height: h,
        transform: `rotate(${rotationDeg}deg)`,
        transformOrigin: `${anchorOffsetX}px ${anchorOffsetY}px`,
      }}
    >
      {/* Frame border */}
      <div className="absolute inset-0 border border-blue-400/90 box-border" />

      {/* Rotation handles — small white circles, drawn diagonally outside corners */}
      {onRotatePointerDown && rotHandles.map((r) => (
        <div
          key={r.key}
          onPointerDown={onRotatePointerDown}
          title="Drag to rotate (Shift = snap 15°)"
          className="absolute w-2 h-2 -translate-x-1/2 -translate-y-1/2
                     bg-white border border-blue-400 rounded-full shadow-sm pointer-events-auto
                     hover:scale-125 hover:border-blue-300 transition-transform"
          style={{ left: `${r.cx}px`, top: `${r.cy}px`, cursor: 'alias' }}
        />
      ))}

      {/* Resize handles — circles (Figma / SVGator style), drawn on top so
          a click on the corner resizes, not rotates. */}
      {onHandlePointerDown && handles.map((h) => (
        <div
          key={h.key}
          onPointerDown={onHandlePointerDown(h.key)}
          className="absolute w-3 h-3 -translate-x-1/2 -translate-y-1/2
                     bg-white border border-blue-500 rounded-full shadow pointer-events-auto"
          style={{ left: `${h.cx}px`, top: `${h.cy}px`, cursor: HANDLE_CURSORS[h.key] }}
        />
      ))}
    </div>
  )
}
