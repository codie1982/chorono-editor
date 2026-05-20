// ── Spline Edit Overlay (BL-73 Sprint 3) ─────────────────────────────────────
//
// SVG overlay drawn over the selected spline layer. Visualises the granular
// model so users can see (and, in Sprint 4, grab) the structure:
//   • each on-curve point as a small square (white = corner, blue = curve)
//   • each bezier handle as a blue dot + dashed line back to its point
//
// Pointer events stay off — hit-testing is done in SceneCanvas. This is purely
// the visual layer.

'use client'

import type { Layer } from '@/lib/types'
import type { SplineHandle } from '@/lib/types/spline'

interface SplineEditOverlayProps {
  layer: Layer
  zoom: number
}

const ANCHOR_SIZE  = 7
const HANDLE_DOT_R = 3.5

export default function SplineEditOverlay({ layer, zoom }: SplineEditOverlayProps) {
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

  return (
    <svg
      className="absolute inset-0 z-30 overflow-visible pointer-events-none"
      style={{ width: '100%', height: '100%' }}
    >
      {points.map((pt) => {
        const p    = toScreen(pt.x, pt.y)
        const inP  = inH[pt.id]  ? toScreen(inH[pt.id].x,  inH[pt.id].y)  : null
        const outP = outH[pt.id] ? toScreen(outH[pt.id].x, outH[pt.id].y) : null
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
              <circle cx={inP.x} cy={inP.y} r={HANDLE_DOT_R}
                fill="#60A5FA" stroke="#1E3A8A" strokeWidth={1} />
            )}
            {outP && (
              <circle cx={outP.x} cy={outP.y} r={HANDLE_DOT_R}
                fill="#60A5FA" stroke="#1E3A8A" strokeWidth={1} />
            )}
            <rect
              x={p.x - ANCHOR_SIZE / 2}
              y={p.y - ANCHOR_SIZE / 2}
              width={ANCHOR_SIZE}
              height={ANCHOR_SIZE}
              fill={pt.type === 'corner' ? '#FFFFFF' : '#DBEAFE'}
              stroke="#1F2937"
              strokeWidth={1}
            />
          </g>
        )
      })}
    </svg>
  )
}
