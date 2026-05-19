// ── Path Edit Overlay (BL-66) ────────────────────────────────────────────────
//
// SVG overlay drawn over the selected path layer in Pen mode. Visualises:
//   • Each anchor as a small white square
//   • Smooth/mirror anchors' bezier handles as blue dots + dashed lines back
//     to the anchor
//
// Pointer events stay off — SceneCanvas.handleCanvasPointerDown already
// does the proper hit-testing via pathOps.hitTestPath; we just need the
// visual targets so users can SEE what they're grabbing.

'use client'

import type { Layer } from '@/lib/types'

interface PathEditOverlayProps {
  layer: Layer
  zoom: number
}

const ANCHOR_SIZE  = 7
const HANDLE_DOT_R = 3.5

export default function PathEditOverlay({ layer, zoom }: PathEditOverlayProps) {
  if (layer.type !== 'path' || !layer.path) return null
  const anchors = layer.path.anchors
  if (anchors.length === 0) return null

  const tx = layer.transform.x
  const ty = layer.transform.y
  const toScreen = (x: number, y: number) => ({
    x: (tx + x) * zoom,
    y: (ty + y) * zoom,
  })

  return (
    <svg
      className="absolute inset-0 z-30 overflow-visible pointer-events-none"
      style={{ width: '100%', height: '100%' }}
    >
      {anchors.map((a, i) => {
        const p     = toScreen(a.x, a.y)
        const inP   = a.inX  !== undefined && a.inY  !== undefined ? toScreen(a.inX,  a.inY)  : null
        const outP  = a.outX !== undefined && a.outY !== undefined ? toScreen(a.outX, a.outY) : null
        return (
          <g key={i}>
            {/* Handle lines (drawn under the dots) */}
            {inP && (
              <line x1={p.x} y1={p.y} x2={inP.x} y2={inP.y}
                stroke="#60A5FA" strokeWidth={1} strokeDasharray="2 2" opacity={0.7} />
            )}
            {outP && (
              <line x1={p.x} y1={p.y} x2={outP.x} y2={outP.y}
                stroke="#60A5FA" strokeWidth={1} strokeDasharray="2 2" opacity={0.7} />
            )}
            {/* Handle dots */}
            {inP && (
              <circle cx={inP.x} cy={inP.y} r={HANDLE_DOT_R}
                fill="#60A5FA" stroke="#1E3A8A" strokeWidth={1} />
            )}
            {outP && (
              <circle cx={outP.x} cy={outP.y} r={HANDLE_DOT_R}
                fill="#60A5FA" stroke="#1E3A8A" strokeWidth={1} />
            )}
            {/* Anchor square — first anchor of an open path is highlighted
                in amber so the user can spot the close-target. */}
            <rect
              x={p.x - ANCHOR_SIZE / 2}
              y={p.y - ANCHOR_SIZE / 2}
              width={ANCHOR_SIZE}
              height={ANCHOR_SIZE}
              fill={i === 0 && !layer.path!.closed && anchors.length >= 2 ? '#F59E0B' : '#FFFFFF'}
              stroke="#1F2937"
              strokeWidth={1}
            />
          </g>
        )
      })}
    </svg>
  )
}
