import React from 'react'
import type { Matrix2D } from '@/lib/geometry/Matrix2D'

// ── Shared sub-components for the axis gizmos ──────────────────────────────
const ARROW_LEN = 56  // axis line length in CSS px
const ARROW_CAP = 8   // triangle / square cap size

interface AxisArrowProps {
  angle?: number
  direction: 'x' | 'y'
  color: string
  cap: 'triangle' | 'square'
  cursor: 'ew-resize' | 'ns-resize'
  title: string
  onPointerDown: (e: React.PointerEvent) => void
}
/** Axis with a constant CSS-pixel hit band, rotated with its captured frame.
 * White and dark outline strokes
 * keep both directions visible over matching fills, images and light/dark artboards.
 * The label is decorative; the parent tooltip describes the native drag action. */
function AxisArrow({ direction, color, cap, cursor, title, onPointerDown, angle = 0 }: AxisArrowProps) {
  const isX = direction === 'x'
  const hitW = isX ? ARROW_LEN + ARROW_CAP : 14
  const hitH = isX ? 14 : ARROW_LEN + ARROW_CAP
  const line = isX ? 'M0 7 H56' : 'M7 0 V56'
  const tip = isX ? 'M54 -1 L64 7 L54 15 Z' : 'M-1 54 L7 64 L15 54 Z'
  return <div onPointerDown={onPointerDown} title={title} data-transform-axis={direction}
    className="absolute pointer-events-auto"
    style={{ left: isX ? 0 : -7, top: isX ? -7 : 0, width: hitW, height: hitH, cursor,
      transform: `rotate(${angle}deg)`, transformOrigin: isX ? '0px 7px' : '7px 0px' }}>
    <svg width={hitW} height={hitH} aria-hidden="true" className="absolute overflow-visible pointer-events-none">
      <path d={line} stroke="white" strokeWidth={6} />
      <path d={line} stroke="#0f172a" strokeWidth={4} />
      <path d={line} stroke={color} strokeWidth={2} />
      <g fill={color} stroke="white" strokeWidth={2} paintOrder="stroke"
        style={{ filter: 'drop-shadow(0 0 1px #0f172a)' }}>
        {cap === 'triangle' ? <path d={tip} />
          : <rect x={isX ? 56 : 3} y={isX ? 3 : 56} width={8} height={8} />}
      </g>
      <text x={isX ? 34 : 18} y={isX ? -3 : 38} fill="#0f172a" stroke="white" strokeWidth={3}
        paintOrder="stroke" fontSize={10} fontWeight={700}>{direction.toUpperCase()}</text>
    </svg>
  </div>
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
// X arrow (red), Y arrow (blue), centre square. Anchored at the layer's
// pivot in world space; unit axes follow the shared Scene/Local toolbox setting.
interface MoveAxisGizmoProps {
  axisFrame?: Matrix2D
  x: number; y: number
  onAxisPointerDown: (axis: 'x' | 'y' | null) => (e: React.PointerEvent) => void
}
export function MoveAxisGizmo({ x, y, onAxisPointerDown, axisFrame }: MoveAxisGizmoProps) {
  return (
    <div
      className="absolute pointer-events-none"
      style={{ left: `${x}px`, top: `${y}px`, zIndex: 49 }}
    >
      <AxisArrow direction="x" color="#ef4444" cap="triangle" onPointerDown={onAxisPointerDown('x')} angle={axisAngles(axisFrame).x}
        title="Drag — locks to X axis" cursor="ew-resize" />
      <AxisArrow direction="y" color="#3b82f6" cap="triangle" onPointerDown={onAxisPointerDown('y')} angle={axisAngles(axisFrame).y}
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
  axisFrame?: Matrix2D
  x: number; y: number
  onAxisPointerDown: (axis: 'x' | 'y' | 'both') => (e: React.PointerEvent) => void
}
export function ScaleAxisGizmo({ x, y, onAxisPointerDown, axisFrame }: ScaleAxisGizmoProps) {
  return (
    <div
      className="absolute pointer-events-none"
      style={{ left: `${x}px`, top: `${y}px`, zIndex: 49 }}
    >
      <AxisArrow direction="x" color="#ef4444" cap="square" onPointerDown={onAxisPointerDown('x')} angle={axisAngles(axisFrame).x}
        title="Drag — scale X axis" cursor="ew-resize" />
      <AxisArrow direction="y" color="#3b82f6" cap="square" onPointerDown={onAxisPointerDown('y')} angle={axisAngles(axisFrame).y}
        title="Drag — scale Y axis" cursor="ns-resize" />
      <CenterHandle color="#facc15" border="#ca8a04"
        title="Drag — uniform scale (X + Y together)" cursor="nwse-resize"
        onPointerDown={onAxisPointerDown('both')} />
    </div>
  )
}

/** CSS angles relative to the existing right/down arrow shapes. Translation
 * and scale are excluded; reflected or sheared local axes remain distinct. */
function axisAngles(frame?: Matrix2D) {
  return frame ? { x: Math.atan2(frame.b, frame.a) * 180 / Math.PI,
    y: Math.atan2(frame.d, frame.c) * 180 / Math.PI - 90 } : { x: 0, y: 0 }
}
