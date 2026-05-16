// ── SvgShapeConverter ─────────────────────────────────────────────────────────
//
// Converts an SVG shape primitive (<rect>, <circle>, <ellipse>, <line>,
// <polygon>, <polyline>) directly to a NormalizedPathDefinition. The result
// is then wrapped in a Chorono 'path' layer by SvgLayerFactory.
//
// We deliberately funnel every SVG shape through the unified path pipeline
// instead of mapping <rect> → 'rect' shape layer etc. Two reasons:
//   1. SVG shapes carry a `transform` attribute that may rotate / skew them
//      — Chorono's parametric shape layers don't model arbitrary affine
//      transforms on the geometry itself.
//   2. The path pipeline (trim, motion-path, length) already works on every
//      shape, so we get those for free.
//
// Pure: takes an SvgElementLike + warnings, returns commands. No DOM mutation.

import type { NormalizedPathCommand } from '@/lib/geometry'
import { M, L, C, Z } from '@/lib/geometry'
import type { SvgElementLike } from './SvgStyleParser'
import type { SvgImportWarning } from '@/lib/types/svg'

export class SvgShapeConverter {
  /**
   * Dispatch by tag name. Returns empty if the element isn't a known shape
   * primitive (caller should already have filtered).
   */
  convert(
    el:       SvgElementLike,
    warnings: SvgImportWarning[] = [],
  ): NormalizedPathCommand[] {
    switch (el.tagName.toLowerCase()) {
      case 'rect':     return this.rect(el)
      case 'circle':   return this.circle(el)
      case 'ellipse':  return this.ellipse(el)
      case 'line':     return this.line(el)
      case 'polygon':  return this.polyline(el, true)
      case 'polyline': return this.polyline(el, false)
      default:
        warnings.push({
          code:     'UNSUPPORTED_ELEMENT',
          message:  `SvgShapeConverter cannot convert <${el.tagName}>`,
          nodeName: el.tagName,
        })
        return []
    }
  }

  // ── <rect> ──────────────────────────────────────────────────────────────────

  private rect(el: SvgElementLike): NormalizedPathCommand[] {
    const x  = num(el, 'x',  0)
    const y  = num(el, 'y',  0)
    const w  = num(el, 'width',  0)
    const h  = num(el, 'height', 0)
    let   rx = num(el, 'rx', NaN)
    let   ry = num(el, 'ry', NaN)
    if (w <= 0 || h <= 0) return []

    // SVG spec: if rx is missing but ry is set, rx = ry (and vice-versa).
    // Clamp to half the shorter side.
    if (Number.isNaN(rx) && Number.isNaN(ry)) rx = ry = 0
    if (Number.isNaN(rx)) rx = ry
    if (Number.isNaN(ry)) ry = rx
    rx = Math.max(0, Math.min(rx, w / 2))
    ry = Math.max(0, Math.min(ry, h / 2))

    if (rx === 0 && ry === 0) {
      return [M(x, y), L(x + w, y), L(x + w, y + h), L(x, y + h), Z()]
    }

    // Rounded corners → 4 cubic beziers (one per corner)
    const kx = 0.5522847498 * rx
    const ky = 0.5522847498 * ry
    return [
      M(x + rx, y),
      L(x + w - rx, y),
      C(x + w - rx + kx, y,             x + w, y + ry - ky,   x + w, y + ry),
      L(x + w, y + h - ry),
      C(x + w, y + h - ry + ky,         x + w - rx + kx, y + h, x + w - rx, y + h),
      L(x + rx, y + h),
      C(x + rx - kx, y + h,             x, y + h - ry + ky,    x, y + h - ry),
      L(x, y + ry),
      C(x, y + ry - ky,                 x + rx - kx, y,        x + rx, y),
      Z(),
    ]
  }

  // ── <circle> / <ellipse> ────────────────────────────────────────────────────

  private circle(el: SvgElementLike): NormalizedPathCommand[] {
    const cx = num(el, 'cx', 0)
    const cy = num(el, 'cy', 0)
    const r  = num(el, 'r', 0)
    if (r <= 0) return []
    return this.ellipseAt(cx, cy, r, r)
  }

  private ellipse(el: SvgElementLike): NormalizedPathCommand[] {
    const cx = num(el, 'cx', 0)
    const cy = num(el, 'cy', 0)
    const rx = num(el, 'rx', 0)
    const ry = num(el, 'ry', 0)
    if (rx <= 0 || ry <= 0) return []
    return this.ellipseAt(cx, cy, rx, ry)
  }

  private ellipseAt(cx: number, cy: number, rx: number, ry: number): NormalizedPathCommand[] {
    // Same 4-cubic kappa-approximation we use in ShapeToPathConverter.
    const kx = 0.5522847498 * rx
    const ky = 0.5522847498 * ry
    return [
      M(cx - rx, cy),
      C(cx - rx, cy - ky,   cx - kx, cy - ry,   cx,      cy - ry),
      C(cx + kx, cy - ry,   cx + rx, cy - ky,   cx + rx, cy),
      C(cx + rx, cy + ky,   cx + kx, cy + ry,   cx,      cy + ry),
      C(cx - kx, cy + ry,   cx - rx, cy + ky,   cx - rx, cy),
      Z(),
    ]
  }

  // ── <line> ──────────────────────────────────────────────────────────────────

  private line(el: SvgElementLike): NormalizedPathCommand[] {
    const x1 = num(el, 'x1', 0)
    const y1 = num(el, 'y1', 0)
    const x2 = num(el, 'x2', 0)
    const y2 = num(el, 'y2', 0)
    if (x1 === x2 && y1 === y2) return []
    return [M(x1, y1), L(x2, y2)]
  }

  // ── <polygon> / <polyline> ──────────────────────────────────────────────────

  private polyline(el: SvgElementLike, closed: boolean): NormalizedPathCommand[] {
    const points = parsePoints(el.getAttribute('points'))
    if (points.length === 0) return []
    const cmds: NormalizedPathCommand[] = [M(points[0].x, points[0].y)]
    for (let i = 1; i < points.length; i++) cmds.push(L(points[i].x, points[i].y))
    if (closed) cmds.push(Z())
    return cmds
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function num(el: SvgElementLike, name: string, fallback: number): number {
  const v = el.getAttribute(name)
  if (v == null) return fallback
  const m = v.match(/^(-?\d+(?:\.\d+)?)/)
  if (!m) return fallback
  const n = parseFloat(m[1])
  return Number.isFinite(n) ? n : fallback
}

function parsePoints(str: string | null): { x: number; y: number }[] {
  if (!str) return []
  const nums = str.match(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g)
  if (!nums) return []
  const out: { x: number; y: number }[] = []
  for (let i = 0; i + 1 < nums.length; i += 2) {
    out.push({ x: parseFloat(nums[i]), y: parseFloat(nums[i + 1]) })
  }
  return out
}
