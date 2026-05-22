// ── Shape path builder ────────────────────────────────────────────────────────
//
// Pure shape geometry for the canvas renderer: builds a shape's path on a 2D
// context (buildShapePath) and computes its perimeter for trim-path math
// (computeShapeLength). Extracted from renderer.ts (BL-97) so the renderer
// stays a thin orchestrator. No side effects beyond the passed-in ctx.

import type { ShapeKind, ShapeParams } from '@/lib/types'

/** Degrees → radians, with 0° pointing at 12 o'clock (top). */
const polarToRad = (deg: number) => (deg - 90) * (Math.PI / 180)
/** Plain degrees → radians, 0° = 3 o'clock (standard maths convention). */
const degToRad   = (deg: number) => deg * (Math.PI / 180)

/**
 * Computes the path's geometric length.
 * Used by Trim Path math — currently optimised for ring / arc / line / polygon / star.
 */
export function computeShapeLength(
  shapeKind: string,
  w: number, h: number,
  params?: ShapeParams,
): number {
  const cx = w / 2, cy = h / 2
  const r  = Math.min(w, h) / 2
  switch (shapeKind) {
    case 'circle':  return Math.PI * 2 * r
    case 'ellipse': {
      // Ramanujan ellipse perimeter approximation
      const a = w / 2, b = h / 2
      return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)))
    }
    case 'rect': {
      const cr = Math.min(Math.max(0, (params as any)?.cornerRadius ?? 0), w / 2, h / 2)
      const straight = 2 * ((w - 2 * cr) + (h - 2 * cr))
      const corners  = 2 * Math.PI * cr
      return straight + corners
    }
    case 'ring': {
      const startDeg = params?.startAngle ?? 0
      const endDeg   = params?.endAngle   ?? 360
      const outerR   = r
      const innerR   = params?.innerRadius ?? r * 0.6
      const sweep    = Math.abs(endDeg - startDeg) * (Math.PI / 180)
      return sweep * (outerR + innerR) + 2 * (outerR - innerR)
    }
    case 'arc': {
      const startDeg = params?.startAngle ?? -90
      const endDeg   = params?.endAngle   ??  90
      const sweep    = Math.abs(endDeg - startDeg) * (Math.PI / 180)
      return sweep * r
    }
    case 'line':
    case 'arrow': {
      const x2 = params?.x2 ?? w
      const y2 = params?.y2 ?? 0
      return Math.hypot(x2, y2)
    }
    case 'polygon': {
      const sides = Math.round(params?.sides ?? 6)
      const side  = 2 * r * Math.sin(Math.PI / sides)
      return side * sides
    }
    case 'star': {
      const points = Math.round(params?.sides ?? 5)
      const outerR = params?.outerRadius ?? r
      const innerR = params?.innerRadius ?? outerR * 0.45
      const stepA  = Math.PI / points
      // For a star, alternate outer / inner — each segment length = sqrt(o² + i² - 2oi·cos(stepA))
      const seg    = Math.sqrt(outerR * outerR + innerR * innerR - 2 * outerR * innerR * Math.cos(stepA))
      return seg * points * 2
    }
    case 'capsule': {
      const cr = Math.min(w, h) / 2
      const straight = 2 * (w - 2 * cr)
      const corners  = 2 * Math.PI * cr
      return straight + corners
    }
    default: return 0
  }
}

/**
 * Draws a polygon with optional corner rounding.
 * roundness ∈ [0, 1] — fraction of the half-edge length used as corner radius.
 * 0 = sharp corners (plain lineTo), 1 = max blend (corner radius = half min edge).
 */
function drawRoundedPolygon(
  ctx: CanvasRenderingContext2D,
  pts: [number, number][],
  roundness: number,
) {
  const n = pts.length
  if (n < 3) return
  if (roundness <= 0) {
    ctx.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < n; i++) ctx.lineTo(pts[i][0], pts[i][1])
    ctx.closePath()
    return
  }

  // Cap radius so neighbouring fillets don't overlap on short edges
  let minEdge = Infinity
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % n]
    const edge = Math.hypot(x2 - x1, y2 - y1)
    if (edge < minEdge) minEdge = edge
  }
  const r = (minEdge / 2) * roundness

  // Start at the midpoint of the last → first edge so arcTo has a clean entry
  const firstMid = midpoint(pts[n - 1], pts[0])
  ctx.moveTo(firstMid[0], firstMid[1])
  for (let i = 0; i < n; i++) {
    const next  = pts[(i + 1) % n]
    const nextN = pts[(i + 2) % n]
    ctx.arcTo(next[0], next[1], midpoint(next, nextN)[0], midpoint(next, nextN)[1], r)
  }
  ctx.closePath()
}

function midpoint(a: [number, number], b: [number, number]): [number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
}

export function buildShapePath(
  ctx: CanvasRenderingContext2D,
  shape: ShapeKind | 'rect' | 'circle',
  w: number, h: number,
  cornerRadius: number,
  params?: ShapeParams,
) {
  ctx.beginPath()
  const cx = w / 2, cy = h / 2

  switch (shape) {
    case 'circle': {
      const r = Math.min(w, h) / 2
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      return
    }

    case 'ellipse': {
      ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2)
      return
    }

    case 'capsule': {
      const r = Math.min(w, h) / 2
      ctx.moveTo(r, 0)
      ctx.lineTo(w - r, 0)
      ctx.arcTo(w, 0, w, r, r)
      ctx.lineTo(w, h - r)
      ctx.arcTo(w, h, w - r, h, r)
      ctx.lineTo(r, h)
      ctx.arcTo(0, h, 0, h - r, r)
      ctx.lineTo(0, r)
      ctx.arcTo(0, 0, r, 0, r)
      ctx.closePath()
      return
    }

    case 'line':
    case 'arrow': {
      const x2       = params?.x2 ?? w
      const y2       = params?.y2 ?? 0
      ctx.moveTo(0, 0)
      ctx.lineTo(x2, y2)
      if (shape === 'arrow') {
        const headSize = params?.arrowHeadSize ?? 12
        const angle    = Math.atan2(y2, x2)
        ctx.moveTo(x2, y2)
        ctx.lineTo(
          x2 - headSize * Math.cos(angle - Math.PI / 6),
          y2 - headSize * Math.sin(angle - Math.PI / 6),
        )
        ctx.moveTo(x2, y2)
        ctx.lineTo(
          x2 - headSize * Math.cos(angle + Math.PI / 6),
          y2 - headSize * Math.sin(angle + Math.PI / 6),
        )
      }
      return
    }

    case 'polygon': {
      const sides     = Math.max(3, Math.round(params?.sides ?? 6))
      const r         = Math.min(w, h) / 2
      const roundness = Math.max(0, Math.min(1, params?.roundness ?? 0))
      const pts: [number, number][] = []
      for (let i = 0; i < sides; i++) {
        const a = -Math.PI / 2 + (i / sides) * Math.PI * 2
        pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
      }
      drawRoundedPolygon(ctx, pts, roundness)
      return
    }

    case 'star': {
      const points    = Math.max(3, Math.round(params?.sides ?? 5))
      const outerR    = params?.outerRadius ?? Math.min(w, h) / 2
      const innerR    = params?.innerRadius ?? outerR * 0.45
      const roundness = Math.max(0, Math.min(1, params?.roundness ?? 0))
      const pts: [number, number][] = []
      for (let i = 0; i < points * 2; i++) {
        const a = -Math.PI / 2 + (i / (points * 2)) * Math.PI * 2
        const rr = i % 2 === 0 ? outerR : innerR
        pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)])
      }
      drawRoundedPolygon(ctx, pts, roundness)
      return
    }

    case 'ring': {
      const startDeg = params?.startAngle ?? 0
      const endDeg   = params?.endAngle   ?? 360
      const outerR   = Math.min(w, h) / 2
      const innerR   = Math.max(0, Math.min(outerR - 1, params?.innerRadius ?? outerR * 0.6))
      const fullCircle = Math.abs(endDeg - startDeg) >= 360 - 0.01
      if (fullCircle) {
        // Two concentric circles using even-odd (closePath approach)
        ctx.arc(cx, cy, outerR, 0, Math.PI * 2)
        ctx.arc(cx, cy, innerR, 0, Math.PI * 2, true)
      } else {
        ctx.arc(cx, cy, outerR, polarToRad(startDeg), polarToRad(endDeg))
        ctx.arc(cx, cy, innerR, polarToRad(endDeg),   polarToRad(startDeg), true)
        ctx.closePath()
      }
      return
    }

    case 'arc': {
      const startDeg = params?.startAngle ?? -90
      const endDeg   = params?.endAngle   ??  90
      const r = Math.min(w, h) / 2
      ctx.arc(cx, cy, r, degToRad(startDeg), degToRad(endDeg))
      return
    }

    case 'rect':
    default: {
      // Rounded rect (cornerRadius = 0 → sharp corners)
      const r = Math.min(Math.max(0, cornerRadius), w / 2, h / 2)
      ctx.moveTo(r, 0)
      ctx.lineTo(w - r, 0)
      ctx.arcTo(w, 0, w, r, r)
      ctx.lineTo(w, h - r)
      ctx.arcTo(w, h, w - r, h, r)
      ctx.lineTo(r, h)
      ctx.arcTo(0, h, 0, h - r, r)
      ctx.lineTo(0, r)
      ctx.arcTo(0, 0, r, 0, r)
      ctx.closePath()
      return
    }
  }
}
