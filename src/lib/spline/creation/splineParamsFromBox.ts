// ── Bounding-box → spline generator params ────────────────────────────────────
//
// Converts a drag rectangle (x1,y1)→(x2,y2) into the centered generator params
// for a box-drag spline primitive. Geometry is always centered at (0,0); the
// returned center becomes the layer's transform position.

import type { SplinePrimitiveKind, SplineGeneratorParams } from '@/lib/types/spline'

export interface DrawBox { x1: number; y1: number; x2: number; y2: number }

export interface BoxSplineSpec {
  centerX: number
  centerY: number
  params:  SplineGeneratorParams
}

/** Kinds created by a bounding-box drag (line uses multi-click instead). */
export function isBoxDragKind(kind: SplinePrimitiveKind): boolean {
  return kind === 'rectangle' || kind === 'circle' || kind === 'ellipse'
      || kind === 'star' || kind === 'ngon' || kind === 'donut' || kind === 'arc'
}

export function splineParamsFromBox(kind: SplinePrimitiveKind, box: DrawBox): BoxSplineSpec | null {
  const minX = Math.min(box.x1, box.x2), maxX = Math.max(box.x1, box.x2)
  const minY = Math.min(box.y1, box.y2), maxY = Math.max(box.y1, box.y2)
  const w = maxX - minX
  const h = maxY - minY
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  const r = Math.min(w, h) / 2

  let params: SplineGeneratorParams
  switch (kind) {
    case 'rectangle': params = { width: w, height: h, cornerMode: 'sharp' }; break
    case 'circle':    params = { radius: r }; break
    case 'ellipse':   params = { radiusX: w / 2, radiusY: h / 2 }; break
    case 'star':      params = { points: 5, outerRadius: r, innerRadius: r * 0.45 }; break
    case 'ngon':      params = { sides: 6, radius: r }; break
    case 'donut':     params = { outerRadius: r, innerRadius: r * 0.5 }; break
    case 'arc':       params = { radius: r, startAngle: -90, endAngle: 90 }; break
    default:          return null
  }
  return { centerX, centerY, params }
}
