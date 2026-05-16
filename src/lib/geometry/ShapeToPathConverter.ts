// ── ShapeToPathConverter ──────────────────────────────────────────────────────
//
// Converts a (ShapeKind + size + params) tuple into a NormalizedPathDefinition.
// The renderer then only needs ONE path-execution loop — no per-shape switch.
//
// This is the bridge between the parametric shape system (rect, star, ring…)
// and the unified path pipeline (trim, motion path, length, hit-test).
//
// Pure: no side effects, no mutation, no I/O.

import type { ShapeKind, ShapeParams } from '@/lib/types'
import type { PathDefinition } from './PathCommand'
import { M, L, C, Z } from './PathCommand'

export interface Size {
  width:  number
  height: number
}

/**
 * Converts (shapeKind, size, params, cornerRadius) → PathDefinition.
 * Defaults for missing params are baked here so the renderer never has to
 * know about shape-specific math.
 */
export class ShapeToPathConverter {
  static convert(
    shape:        ShapeKind | 'rect' | 'circle',
    size:         Size,
    params?:      ShapeParams,
    cornerRadius: number = 0,
  ): PathDefinition {
    const { width: w, height: h } = size
    switch (shape) {
      case 'circle':  return this.circle(w, h)
      case 'ellipse': return this.ellipse(w, h)
      case 'capsule': return this.capsule(w, h)
      case 'line':    return this.line(w, h, params)
      case 'arrow':   return this.arrow(w, h, params)
      case 'polygon': return this.polygon(w, h, params)
      case 'star':    return this.star(w, h, params)
      case 'ring':    return this.ring(w, h, params)
      case 'arc':     return this.arc(w, h, params)
      case 'rect':
      default:        return this.rect(w, h, cornerRadius)
    }
  }

  // ── Rect (with optional rounded corners) ────────────────────────────────────

  private static rect(w: number, h: number, cr: number): PathDefinition {
    const r = Math.max(0, Math.min(cr, w / 2, h / 2))
    if (r === 0) {
      return {
        closed: true,
        commands: [M(0, 0), L(w, 0), L(w, h), L(0, h), Z()],
      }
    }
    // Rounded rect → cubic beziers (one per corner, kappa = 0.5522847498)
    const k = 0.5522847498 * r
    return {
      closed: true,
      commands: [
        M(r, 0),
        L(w - r, 0),
        C(w - r + k, 0,     w, r - k,        w, r),
        L(w, h - r),
        C(w, h - r + k,     w - r + k, h,   w - r, h),
        L(r, h),
        C(r - k, h,         0, h - r + k,    0, h - r),
        L(0, r),
        C(0, r - k,         r - k, 0,        r, 0),
        Z(),
      ],
    }
  }

  // ── Circle ──────────────────────────────────────────────────────────────────

  private static circle(w: number, h: number): PathDefinition {
    const cx = w / 2, cy = h / 2
    const r  = Math.min(w, h) / 2
    return this.ellipseAt(cx, cy, r, r, true)
  }

  // ── Ellipse ─────────────────────────────────────────────────────────────────

  private static ellipse(w: number, h: number): PathDefinition {
    return this.ellipseAt(w / 2, h / 2, w / 2, h / 2, true)
  }

  /** Generic ellipse builder used by circle/ellipse. Four-cubic approximation. */
  private static ellipseAt(cx: number, cy: number, rx: number, ry: number, closed: boolean): PathDefinition {
    const kx = 0.5522847498 * rx
    const ky = 0.5522847498 * ry
    return {
      closed,
      commands: [
        M(cx - rx, cy),
        C(cx - rx, cy - ky,  cx - kx, cy - ry,  cx,      cy - ry),
        C(cx + kx, cy - ry,  cx + rx, cy - ky,  cx + rx, cy),
        C(cx + rx, cy + ky,  cx + kx, cy + ry,  cx,      cy + ry),
        C(cx - kx, cy + ry,  cx - rx, cy + ky,  cx - rx, cy),
        Z(),
      ],
    }
  }

  // ── Capsule (pill) ──────────────────────────────────────────────────────────

  private static capsule(w: number, h: number): PathDefinition {
    const r = Math.min(w, h) / 2
    return this.rect(w, h, r)
  }

  // ── Line ────────────────────────────────────────────────────────────────────

  private static line(w: number, _h: number, params?: ShapeParams): PathDefinition {
    const x2 = params?.x2 ?? w
    const y2 = params?.y2 ?? 0
    return {
      closed: false,
      commands: [M(0, 0), L(x2, y2)],
    }
  }

  // ── Arrow (line + arrowhead) ────────────────────────────────────────────────

  private static arrow(w: number, _h: number, params?: ShapeParams): PathDefinition {
    const x2       = params?.x2 ?? w
    const y2       = params?.y2 ?? 0
    const headSize = params?.arrowHeadSize ?? 12
    const angle    = Math.atan2(y2, x2)
    // Two arrowhead lines, both starting at the tip
    const hx1 = x2 - headSize * Math.cos(angle - Math.PI / 6)
    const hy1 = y2 - headSize * Math.sin(angle - Math.PI / 6)
    const hx2 = x2 - headSize * Math.cos(angle + Math.PI / 6)
    const hy2 = y2 - headSize * Math.sin(angle + Math.PI / 6)
    return {
      closed: false,
      commands: [
        M(0, 0),
        L(x2, y2),
        M(x2, y2),
        L(hx1, hy1),
        M(x2, y2),
        L(hx2, hy2),
      ],
    }
  }

  // ── Polygon ─────────────────────────────────────────────────────────────────

  private static polygon(w: number, h: number, params?: ShapeParams): PathDefinition {
    const sides = Math.max(3, Math.round(params?.sides ?? 6))
    const r     = Math.min(w, h) / 2
    const cx = w / 2, cy = h / 2
    const cmds: PathDefinition['commands'] = []
    for (let i = 0; i < sides; i++) {
      const a = -Math.PI / 2 + (i / sides) * Math.PI * 2
      const x = cx + r * Math.cos(a)
      const y = cy + r * Math.sin(a)
      cmds.push(i === 0 ? M(x, y) : L(x, y))
    }
    cmds.push(Z())
    return { closed: true, commands: cmds }
  }

  // ── Star (alternating outer / inner radius) ─────────────────────────────────

  private static star(w: number, h: number, params?: ShapeParams): PathDefinition {
    const points = Math.max(3, Math.round(params?.sides ?? 5))
    const outerR = params?.outerRadius ?? Math.min(w, h) / 2
    const innerR = params?.innerRadius ?? outerR * 0.45
    const cx = w / 2, cy = h / 2
    const cmds: PathDefinition['commands'] = []
    for (let i = 0; i < points * 2; i++) {
      const a = -Math.PI / 2 + (i / (points * 2)) * Math.PI * 2
      const r = i % 2 === 0 ? outerR : innerR
      const x = cx + r * Math.cos(a)
      const y = cy + r * Math.sin(a)
      cmds.push(i === 0 ? M(x, y) : L(x, y))
    }
    cmds.push(Z())
    return { closed: true, commands: cmds }
  }

  // ── Ring (annular arc) ──────────────────────────────────────────────────────

  private static ring(w: number, h: number, params?: ShapeParams): PathDefinition {
    const startDeg = params?.startAngle ?? 0
    const endDeg   = params?.endAngle   ?? 360
    const outerR   = Math.min(w, h) / 2
    const innerR   = Math.max(0, Math.min(outerR - 1, params?.innerRadius ?? outerR * 0.6))
    const cx = w / 2, cy = h / 2
    // Sample the arc into line segments (12 per 360°). Trade-off:
    // simpler than building exact cubic bezier arcs, good enough for V1.
    const samples = Math.max(8, Math.ceil(Math.abs(endDeg - startDeg) / 5))
    const cmds: PathDefinition['commands'] = []
    // Outer arc forward
    for (let i = 0; i <= samples; i++) {
      const t = i / samples
      const deg = startDeg + (endDeg - startDeg) * t
      const a = (deg - 90) * (Math.PI / 180)
      const x = cx + outerR * Math.cos(a)
      const y = cy + outerR * Math.sin(a)
      cmds.push(i === 0 ? M(x, y) : L(x, y))
    }
    // Inner arc reverse
    for (let i = samples; i >= 0; i--) {
      const t = i / samples
      const deg = startDeg + (endDeg - startDeg) * t
      const a = (deg - 90) * (Math.PI / 180)
      const x = cx + innerR * Math.cos(a)
      const y = cy + innerR * Math.sin(a)
      cmds.push(L(x, y))
    }
    cmds.push(Z())
    return { closed: true, commands: cmds }
  }

  // ── Arc (open curve) ────────────────────────────────────────────────────────

  private static arc(w: number, h: number, params?: ShapeParams): PathDefinition {
    const startDeg = params?.startAngle ?? -90
    const endDeg   = params?.endAngle   ??  90
    const r = Math.min(w, h) / 2
    const cx = w / 2, cy = h / 2
    const samples = Math.max(8, Math.ceil(Math.abs(endDeg - startDeg) / 5))
    const cmds: PathDefinition['commands'] = []
    for (let i = 0; i <= samples; i++) {
      const t = i / samples
      const deg = startDeg + (endDeg - startDeg) * t
      const a = deg * (Math.PI / 180)
      const x = cx + r * Math.cos(a)
      const y = cy + r * Math.sin(a)
      cmds.push(i === 0 ? M(x, y) : L(x, y))
    }
    return { closed: false, commands: cmds }
  }
}
