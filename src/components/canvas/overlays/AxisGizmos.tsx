import React from 'react'

// ── Shared sub-components for the axis gizmos ──────────────────────────────
const ARROW_LEN = 56  // axis line length in CSS px
const ARROW_THICK = 2 // line thickness
const ARROW_CAP = 8   // triangle / square cap size

interface AxisArrowProps {
  direction: 'x' | 'y'
  color: string
  cap: 'triangle' | 'square'
  cursor: 'ew-resize' | 'ns-resize'
  title: string
  onPointerDown: (e: React.PointerEvent) => void
}
function AxisArrow({ direction, color, cap, cursor, title, onPointerDown }: AxisArrowProps) {
  const isX = direction === 'x'
  const hitW = isX ? ARROW_LEN + ARROW_CAP : 14
  const hitH = isX ? 14 : ARROW_LEN + ARROW_CAP
  const hitLeft = isX ? 0 : -7
  const hitTop  = isX ? -7 : 0
  return (
    <div
      onPointerDown={onPointerDown}
      title={title}
      className="absolute pointer-events-auto"
      style={{ left: hitLeft, top: hitTop, width: hitW, height: hitH, cursor }}
    >
      {/* Line */}
      <div
        className="absolute"
        style={
          isX
            ? { left: 0, top: '50%', width: ARROW_LEN, height: ARROW_THICK, marginTop: -ARROW_THICK / 2, background: color }
            : { left: '50%', top: 0, width: ARROW_THICK, height: ARROW_LEN, marginLeft: -ARROW_THICK / 2, background: color }
        }
      />
      {/* Cap */}
      {cap === 'triangle' ? (
        <div
          className="absolute"
          style={
            isX
              ? {
                  right: 0, top: '50%', width: 0, height: 0, marginTop: -ARROW_CAP,
                  borderTop:    `${ARROW_CAP}px solid transparent`,
                  borderBottom: `${ARROW_CAP}px solid transparent`,
                  borderLeft:   `${ARROW_CAP + 2}px solid ${color}`,
                }
              : {
                  left: '50%', bottom: 0, width: 0, height: 0, marginLeft: -ARROW_CAP,
                  borderLeft:  `${ARROW_CAP}px solid transparent`,
                  borderRight: `${ARROW_CAP}px solid transparent`,
                  borderTop:   `${ARROW_CAP + 2}px solid ${color}`,
                }
          }
        />
      ) : (
        <div
          className="absolute"
          style={
            isX
              ? {
                  right: 0, top: '50%', width: ARROW_CAP, height: ARROW_CAP,
                  marginTop: -ARROW_CAP / 2, background: color,
                }
              : {
                  left: '50%', bottom: 0, width: ARROW_CAP, height: ARROW_CAP,
                  marginLeft: -ARROW_CAP / 2, background: color,
                }
          }
        />
      )}
    </div>
  )
}

interface CenterHandleProps {
  color: string
  border: string
  title: string
  cursor: string
  onPointerDown: (e: React.PointerEvent) => void
}
function CenterHandle({ color, border, title, cursor, onPointerDown }: CenterHandleProps) {
  return (
    <div
      onPointerDown={onPointerDown}
      title={title}
      className="absolute pointer-events-auto"
      style={{
        left: -6, top: -6, width: 12, height: 12,
        background: color, border: `1px solid ${border}`, cursor,
      }}
    />
  )
}

// ── Move-mode axis gizmo ──────────────────────────────────────────────────
// X arrow (red), Y arrow (blue), centre square. Pure DIV — no SVG so we
// avoid viewBox / translate positioning ambiguity. Anchored at the layer's
// pivot in world space; screen-aligned (does NOT rotate with the layer)
// so the user always knows which direction "X" actually goes.
interface MoveAxisGizmoProps {
  x: number; y: number
  onAxisPointerDown: (axis: 'x' | 'y' | null) => (e: React.PointerEvent) => void
}
export function MoveAxisGizmo({ x, y, onAxisPointerDown }: MoveAxisGizmoProps) {
  return (
    <div
      className="absolute pointer-events-none"
      style={{ left: `${x}px`, top: `${y}px`, zIndex: 49 }}
    >
      <AxisArrow direction="x" color="#ef4444" cap="triangle" onPointerDown={onAxisPointerDown('x')}
        title="Drag — locks to X axis" cursor="ew-resize" />
      <AxisArrow direction="y" color="#3b82f6" cap="triangle" onPointerDown={onAxisPointerDown('y')}
        title="Drag — locks to Y axis" cursor="ns-resize" />
      <CenterHandle color="#facc15" border="#ca8a04"
        title="Drag — free move (X + Y together)" cursor="move"
        onPointerDown={onAxisPointerDown(null)} />
    </div>
  )
}

// ── Scale-mode axis gizmo ──────────────────────────────────────────────────
// Same shape as Move gizmo but with SQUARE caps (3DS Max convention) and
// drives transform.scaleX / scaleY instead of position. Centre square does
// uniform scale (both axes by the same factor).
interface ScaleAxisGizmoProps {
  x: number; y: number
  onAxisPointerDown: (axis: 'x' | 'y' | 'both') => (e: React.PointerEvent) => void
}
export function ScaleAxisGizmo({ x, y, onAxisPointerDown }: ScaleAxisGizmoProps) {
  return (
    <div
      className="absolute pointer-events-none"
      style={{ left: `${x}px`, top: `${y}px`, zIndex: 49 }}
    >
      <AxisArrow direction="x" color="#ef4444" cap="square" onPointerDown={onAxisPointerDown('x')}
        title="Drag — scale X axis" cursor="ew-resize" />
      <AxisArrow direction="y" color="#3b82f6" cap="square" onPointerDown={onAxisPointerDown('y')}
        title="Drag — scale Y axis" cursor="ns-resize" />
      <CenterHandle color="#facc15" border="#ca8a04"
        title="Drag — uniform scale (X + Y together)" cursor="nwse-resize"
        onPointerDown={onAxisPointerDown('both')} />
    </div>
  )
}
