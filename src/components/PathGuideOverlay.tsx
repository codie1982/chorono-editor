// ── Path Guide Overlay (BL-66 / BL-67) ───────────────────────────────────────
//
// Editor-only SVG overlay that draws a dashed preview of:
//   • All `pathRole === 'motion'` layers (so the user can see / edit motion
//     guides even though CanvasRenderer skips them in playback)
//   • All path layers when `pathPickMode` is active (so the user can click one
//     to assign it as a followPath target)

'use client'

import type { ChronoScene, Layer } from '@/lib/types'
import { bezierPathToNormalized } from '@/lib/registry/definitions/path/BezierPathDefinition'

interface PathGuideOverlayProps {
  scene: ChronoScene
  zoom: number
  /** When set, ALL path layers are shown as clickable pick candidates. */
  pathPickMode: { targetLayerId: string } | null
  /** Id of the path currently under the cursor in pick mode. */
  hoveredPickPathId: string | null
  onHoverPickPath?: (id: string | null) => void
  onAssignPath?: (pathLayerId: string) => void
  /** When false, motion-role guides are not drawn (e.g. during runtime preview). */
  showMotionGuides?: boolean
}

/** Build an SVG path "d" string from a Layer's BezierPath at the given zoom. */
function layerPathToSvgD(layer: Layer, zoom: number): string {
  if (!layer.path || layer.path.anchors.length === 0) return ''
  const def = bezierPathToNormalized(layer)
  const tx = layer.transform.x
  const ty = layer.transform.y
  let d = ''
  for (const c of def.commands) {
    if (c.type === 'M') d += `M ${(tx + c.x) * zoom} ${(ty + c.y) * zoom} `
    else if (c.type === 'L') d += `L ${(tx + c.x) * zoom} ${(ty + c.y) * zoom} `
    else if (c.type === 'C') d += `C ${(tx + c.x1) * zoom} ${(ty + c.y1) * zoom} ${(tx + c.x2) * zoom} ${(ty + c.y2) * zoom} ${(tx + c.x) * zoom} ${(ty + c.y) * zoom} `
    else if (c.type === 'Z') d += 'Z '
  }
  return d.trim()
}

export default function PathGuideOverlay({
  scene, zoom, pathPickMode, hoveredPickPathId, onHoverPickPath, onAssignPath,
  showMotionGuides = true,
}: PathGuideOverlayProps) {
  const pathLayers = scene.layers.filter(
    (l) => l.type === 'path' && l.path && l.path.anchors.length >= 2 && !l.hidden,
  )
  if (pathLayers.length === 0) return null

  return (
    <svg
      className="absolute inset-0 z-20 overflow-visible"
      style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      {pathLayers.map((layer) => {
        const isMotionGuide = layer.pathRole === 'motion'
        const pickable = !!pathPickMode && layer.id !== pathPickMode.targetLayerId
        if (!pickable && !(isMotionGuide && showMotionGuides)) return null
        const d = layerPathToSvgD(layer, zoom)
        if (!d) return null
        const hovered = hoveredPickPathId === layer.id
        const stroke = hovered ? '#F59E0B' : pickable ? '#60A5FA' : '#F59E0B'
        return (
          <path
            key={layer.id}
            d={d}
            fill="none"
            stroke={stroke}
            strokeWidth={hovered ? 3 : 2}
            strokeDasharray="6 4"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={pickable ? 0.95 : 0.7}
            style={{
              pointerEvents: pickable ? 'stroke' : 'none',
              cursor: pickable ? 'crosshair' : undefined,
            }}
            onPointerEnter={pickable ? () => onHoverPickPath?.(layer.id) : undefined}
            onPointerLeave={pickable ? () => onHoverPickPath?.(null) : undefined}
            onPointerDown={pickable ? (e) => {
              e.stopPropagation()
              onAssignPath?.(layer.id)
            } : undefined}
          />
        )
      })}
    </svg>
  )
}
