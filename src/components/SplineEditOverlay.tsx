// ── Spline Edit Overlay (BL-73 Sprint 3) ─────────────────────────────────────
//
// SVG overlay drawn over the selected spline layer. Visualises the granular
// model so users can see (and, in Sprint 4, grab) the structure:
//   • each on-curve point as a small square (white = corner, blue = curve)
//   • each bezier handle as a blue dot + dashed line back to its point
//   • the hovered point / handle / segment highlighted in amber
//
// Pointer events stay off — hit-testing is done in SceneCanvas. This is purely
// the visual layer.

'use client'

import type { Layer } from '@/lib/types'
import type { SplineHandle } from '@/lib/types/spline'

export type SplineHoverTarget =
  | { kind: 'point';   id: string }
  | { kind: 'handle';  pointId: string; handleKind: 'in' | 'out' }
  | { kind: 'segment'; id: string }
  | null

interface SplineEditOverlayProps {
  layer: Layer
  zoom: number
  hover?: SplineHoverTarget
  selectedPointId?: string | null
}

const ANCHOR_SIZE  = 7
const HANDLE_DOT_R = 3.5
const HOVER_COLOR  = '#F59E0B'
const SELECT_COLOR = '#2563EB'

export default function SplineEditOverlay({ layer, zoom, hover = null, selectedPointId = null }: SplineEditOverlayProps) {
  if (layer.type !== 'spline' || !layer.spline) return null
  const sp = layer.spline
  const points = Object.values(sp.points)
  if (points.length === 0) return null

  const tx = layer.transform.x
  const ty = layer.transform.y
  const toScreen = (x: number, y: number) => ({ x: (tx + x) * zoom, y: (ty + y) * zoom })

  // Index handles by point id for quick lookup.
  const inH:  Record<string, SplineHandle> = {}
  const outH: Record<string, SplineHandle> = {}
  for (const h of Object.values(sp.handles)) {
    (h.kind === 'in' ? inH : outH)[h.pointId] = h
  }

  // Build the hovered segment's sub-path so it can be highlighted.
  let hoverSegPath: string | null = null
  if (hover?.kind === 'segment') {
    const seg = sp.segments[hover.id]
    if (seg) {
      const from = sp.points[seg.fromPointId]
      const to   = sp.points[seg.toPointId]
      if (from && to) {
        const a = toScreen(from.x, from.y)
        const b = toScreen(to.x, to.y)
        if (seg.type === 'line') {
          hoverSegPath = `M ${a.x} ${a.y} L ${b.x} ${b.y}`
        } else if (seg.type === 'quadratic' && seg.control1) {
          const c = toScreen(seg.control1.x, seg.control1.y)
          hoverSegPath = `M ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`
        } else {
          const o = outH[from.id] ? toScreen(outH[from.id].x, outH[from.id].y) : a
          const i = inH[to.id]    ? toScreen(inH[to.id].x,    inH[to.id].y)    : b
          hoverSegPath = `M ${a.x} ${a.y} C ${o.x} ${o.y} ${i.x} ${i.y} ${b.x} ${b.y}`
        }
      }
    }
  }

  return (
    <svg
      className="absolute inset-0 z-30 overflow-visible pointer-events-none"
      style={{ width: '100%', height: '100%' }}
    >
      {hoverSegPath && (
        <path d={hoverSegPath} fill="none" stroke={HOVER_COLOR} strokeWidth={2.5} opacity={0.85} />
      )}
      {points.map((pt) => {
        const p    = toScreen(pt.x, pt.y)
        const inP  = inH[pt.id]  ? toScreen(inH[pt.id].x,  inH[pt.id].y)  : null
        const outP = outH[pt.id] ? toScreen(outH[pt.id].x, outH[pt.id].y) : null
        const pointHovered  = hover?.kind === 'point'  && hover.id === pt.id
        const inHovered     = hover?.kind === 'handle' && hover.pointId === pt.id && hover.handleKind === 'in'
        const outHovered    = hover?.kind === 'handle' && hover.pointId === pt.id && hover.handleKind === 'out'
        const pointSelected = selectedPointId === pt.id
        return (
          <g key={pt.id}>
            {inP && (
              <line x1={p.x} y1={p.y} x2={inP.x} y2={inP.y}
                stroke="#60A5FA" strokeWidth={1} strokeDasharray="2 2" opacity={0.7} />
            )}
            {outP && (
              <line x1={p.x} y1={p.y} x2={outP.x} y2={outP.y}
                stroke="#60A5FA" strokeWidth={1} strokeDasharray="2 2" opacity={0.7} />
            )}
            {inP && (
              <circle cx={inP.x} cy={inP.y} r={inHovered ? HANDLE_DOT_R + 1.5 : HANDLE_DOT_R}
                fill={inHovered ? HOVER_COLOR : '#60A5FA'} stroke="#1E3A8A" strokeWidth={1} />
            )}
            {outP && (
              <circle cx={outP.x} cy={outP.y} r={outHovered ? HANDLE_DOT_R + 1.5 : HANDLE_DOT_R}
                fill={outHovered ? HOVER_COLOR : '#60A5FA'} stroke="#1E3A8A" strokeWidth={1} />
            )}
            <rect
              x={p.x - (pointHovered || pointSelected ? ANCHOR_SIZE + 2 : ANCHOR_SIZE) / 2}
              y={p.y - (pointHovered || pointSelected ? ANCHOR_SIZE + 2 : ANCHOR_SIZE) / 2}
              width={pointHovered || pointSelected ? ANCHOR_SIZE + 2 : ANCHOR_SIZE}
              height={pointHovered || pointSelected ? ANCHOR_SIZE + 2 : ANCHOR_SIZE}
              fill={pointHovered ? HOVER_COLOR : pointSelected ? SELECT_COLOR : pt.type === 'corner' ? '#FFFFFF' : '#DBEAFE'}
              stroke={pointSelected ? '#FFFFFF' : '#1F2937'}
              strokeWidth={pointSelected ? 1.5 : 1}
            />
          </g>
        )
      })}
    </svg>
  )
}
