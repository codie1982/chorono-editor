'use client'
import type { KeyboardEvent, PointerEvent } from 'react'
import type { ModelGizmo, ModelViewCamera } from '@/lib/model3d/inspection/types'
import { cameraScreenAxes } from '@/lib/model3d/inspection/cameraNavigation'
import type { ModelAxis, ModelTransformTool } from '@/lib/model3d/inspection/transformSelection'

const axes = ['x', 'y', 'z'] as const
const colors = { x: '#f87171', y: '#4ade80', z: '#60a5fa' } as const
const fallback = { x: { x: 1, y: 0 }, y: { x: 0, y: -1 }, z: { x: -1, y: .4 } }

/** Orthographic screen-space approximation of an axis rotation circle. This
 * guide follows yaw, pitch and roll but never enters the model renderer or
 * exported pixels. At a pole, an edge-on ring may collapse to a line; its
 * keyboard handle remains available. */
function ringPath(axis: ModelAxis, camera: ModelViewCamera, gizmo: ModelGizmo): string {
  const { right, up } = cameraScreenAxes(camera), points: string[] = []
  for (let i = 0; i <= 64; i++) {
    const angle = i * Math.PI / 32, c = Math.cos(angle), s = Math.sin(angle)
    const vector = axis === 'x' ? { x: 0, y: c, z: s } : axis === 'y' ? { x: s, y: 0, z: c } : { x: c, y: s, z: 0 }
    const x = gizmo.origin.x + (vector.x * right.x + vector.y * right.y + vector.z * right.z) * gizmo.screenRadius
    const y = gizmo.origin.y - (vector.x * up.x + vector.y * up.y + vector.z * up.z) * gizmo.screenRadius
    points.push(`${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`)
  }
  return `${points.join(' ')} Z`
}

/** Visual and interactive transform guides. Move keeps the existing arrows;
 * Rotate draws three camera-oriented rings; Scale draws an outer frame and
 * three square axis handles. All pointer edits still use the caller's owned
 * transaction, and focusable buttons preserve keyboard nudges. */
export function ModelTransformOverlay({ gizmo, camera, tool, primitive, canTransform, width, height, hoveredAxis, activeAxis,
  onHover, onBegin, onNudge }: {
  gizmo: ModelGizmo; camera: ModelViewCamera; tool: ModelTransformTool | null; primitive: boolean; canTransform: boolean
  width: number; height: number; hoveredAxis: ModelAxis | null; activeAxis: ModelAxis | null
  onHover(axis: ModelAxis | null): void
  onBegin(axis: ModelAxis, projected: ModelGizmo, event: PointerEvent<Element>): void
  onNudge(axis: ModelAxis, event: KeyboardEvent<HTMLButtonElement>): void
}) {
  const mode = tool ?? 'move', radius = gizmo.screenRadius
  const handles = axes.map((axis, index) => {
    const endpoint = gizmo.axes[axis], dx = endpoint.x - gizmo.origin.x, dy = endpoint.y - gizmo.origin.y
    const length = Math.hypot(dx, dy), unit = length > 8 ? { x: dx / length, y: dy / length } : fallback[axis]
    const distance = mode === 'move' ? 65 : mode === 'rotate' ? radius * .73 : radius * .82
    const point = { x: gizmo.origin.x + unit.x * distance, y: gizmo.origin.y + unit.y * distance }
    return { axis, point, projected: { ...gizmo, axes: { ...gizmo.axes, [axis]: point } }, index }
  })
  const beginRing = (axis: ModelAxis, event: PointerEvent<SVGPathElement>) => {
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect()
    if (!rect) return
    const dx = event.clientX - rect.left - gizmo.origin.x, dy = event.clientY - rect.top - gizmo.origin.y
    const length = Math.hypot(dx, dy), tangent = length > 2 ? { x: -dy / length, y: dx / length } : fallback[axis]
    const projected = { ...gizmo, axes: { ...gizmo.axes, [axis]: { x: gizmo.origin.x + tangent.x * 65, y: gizmo.origin.y + tangent.y * 65 } } }
    onBegin(axis, projected, event)
  }
  return <div className="pointer-events-none absolute inset-0" aria-label={`Selected object ${mode} axes`}>
    <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {mode === 'move' && <defs>{axes.map(axis => <marker key={axis} id={`model-axis-${axis}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
        <path d="M0 0 L8 4 L0 8 Z" fill={colors[axis]} />
      </marker>)}</defs>}
      {mode !== 'move' && <circle cx={gizmo.origin.x} cy={gizmo.origin.y} r={radius + 8} fill="none" stroke="#e2e8f0" strokeWidth="1.5" opacity=".85" />}
      {mode === 'rotate' && axes.map(axis => {
        const highlighted = hoveredAxis === axis || activeAxis === axis, path = ringPath(axis, camera, gizmo)
        return <g key={axis}>
          <path d={path} fill="none" stroke={colors[axis]} strokeWidth={highlighted ? 4 : 2.5} opacity={highlighted ? 1 : .85} />
          {canTransform && <path d={path} fill="none" stroke="transparent" strokeWidth="16" className="pointer-events-auto cursor-grab active:cursor-grabbing"
            onPointerEnter={() => onHover(axis)} onPointerLeave={() => onHover(null)} onPointerDown={event => beginRing(axis, event)} />}
        </g>
      })}
      {mode !== 'rotate' && handles.map(({ axis, point, projected }) => {
        const highlighted = hoveredAxis === axis || activeAxis === axis
        return <g key={axis}>
          <line x1={gizmo.origin.x} y1={gizmo.origin.y} x2={point.x} y2={point.y}
            stroke={colors[axis]} strokeWidth={highlighted ? 4.5 : 2.5} markerEnd={mode === 'move' ? `url(#model-axis-${axis})` : undefined} />
          {canTransform && <line x1={gizmo.origin.x} y1={gizmo.origin.y} x2={point.x} y2={point.y}
            stroke="transparent" strokeWidth="16" className="pointer-events-auto cursor-grab active:cursor-grabbing"
            onPointerEnter={() => onHover(axis)} onPointerLeave={() => onHover(null)} onPointerDown={event => onBegin(axis, projected, event)} />}
        </g>
      })}
      <circle cx={gizmo.origin.x} cy={gizmo.origin.y} r={mode === 'scale' ? 7 : 4} fill="#f8fafc" stroke="#0b1220" strokeWidth="1.5" />
    </svg>
    {canTransform && tool && handles.map(({ axis, point, projected }) => <button key={axis} type="button"
      aria-label={`${tool === 'scale' && primitive ? 'Uniform scale primitive' : `${tool} ${axis.toUpperCase()} axis`}`}
      title={`${tool === 'scale' && primitive ? 'Uniform scale' : `${tool} ${axis.toUpperCase()}`} · drag or arrow keys`}
      className={`pointer-events-auto absolute flex items-center justify-center border-2 bg-gray-950 text-[10px] font-bold text-white shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${tool === 'scale' ? 'h-6 w-6 rounded-sm' : tool === 'rotate' ? 'h-5 w-5 rounded-full' : 'h-8 w-8 rounded-full'} ${axis === 'x' ? 'border-red-400' : axis === 'y' ? 'border-green-400' : 'border-blue-400'} ${hoveredAxis === axis || activeAxis === axis ? 'ring-2 ring-white' : ''}`}
      style={{ left: point.x, top: point.y, transform: 'translate(-50%, -50%)' }} onKeyDown={event => onNudge(axis, event)}
      onPointerEnter={() => onHover(axis)} onPointerLeave={() => onHover(null)} onFocus={() => onHover(axis)} onBlur={() => onHover(null)}
      onPointerDown={event => onBegin(axis, projected, event)}>{axis.toUpperCase()}</button>)}
  </div>
}
