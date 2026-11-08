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
  /** Conservative command count before any path/vertex allocation. Mirrors
   * the converter's authoritative subdivision helpers; fixed primitive kinds
   * need at most 32 commands. The result may be nonfinite for malformed input:
   * admission callers must reject non-safe/nonpositive counts. No clamping of
   * polygon/star/arc detail is introduced; callers reject rather than degrade.
   * Dimensions/radii are layer-local pixels; count is dimensionless. */
  static estimateCommandCount(shape:ShapeKind|'rect'|'circle',size:Size,params?:ShapeParams,cornerRadius=0):number{
    switch(shape){
      case 'rect':return cornerRadius>0?10:5
      case 'circle':case 'ellipse':return 6
      case 'capsule':return 10
      case 'line':return 2
      case 'arrow':return 8
      case 'polygon':return this.polygonSides(params?.sides??6)+1
      case 'star':return this.polygonSides(params?.sides??5)*2+1
      case 'ring':return this.arcSamples(params?.startAngle??0,params?.endAngle??360)*2+3
      case 'arc':return this.arcSamples(params?.startAngle??-90,params?.endAngle??90)+1
      case 'spiral':return this.spiralSamples(this.clamp(params?.turns??3,.5,20))+1
      case 'wave':return this.waveSamples(size.width)+1
      case 'blob':return 65
      default:return 32
    }
  }

  /** Shared subdivision rules for construction and preallocation queries. */
  private static polygonSides(value:number):number{return Math.max(3,Math.round(value))}
  /** One line sample per five degrees, with eight as the existing minimum. */
  private static arcSamples(start:number,end:number):number{return Math.max(8,Math.ceil(Math.abs(end-start)/5))}
  /** Existing spiral resolution, bounded independently of the angle span. */
  private static spiralSamples(turns:number):number{return Math.min(4096,Math.max(24,Math.ceil(turns*180)))}
  /** Existing wave resolution in layer-local pixels, with 48–4096 samples. */
  private static waveSamples(width:number):number{return Math.min(4096,Math.max(48,Math.ceil(width/1.5)))}

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
      case 'spiral':  return this.spiral(w, h, params)   // BL-24
      case 'wave':    return this.wave(w, h, params)     // BL-24
      case 'blob':    return this.blob(w, h, params)     // BL-24
      case 'rect':
      default:        return this.rect(w, h, cornerRadius)
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private static clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v))
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
    const sides = this.polygonSides(params?.sides??6)
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
    const points = this.polygonSides(params?.sides??5)
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
    const samples = this.arcSamples(startDeg,endDeg)
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
    const samples = this.arcSamples(startDeg,endDeg)
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

  // ── Spiral (BL-24) — Archimedean spiral, open path ──────────────────────────
  //
  // r(t) = startR + (endR - startR) * t^tightness
  // angle(t) = t * turns * 2π - π/2   (starts at 12 o'clock)
  //
  // tightness = 1 → linear radius growth (uniform spacing)
  // tightness < 1 → looser outer turns
  // tightness > 1 → tighter inner turns

  private static spiral(w: number, h: number, params?: ShapeParams): PathDefinition {
    const minSize    = Math.max(1, Math.min(w, h))
    const turns      = this.clamp(params?.turns       ?? 3,           0.5, 20)
    const startR     = this.clamp(params?.startRadius ?? 4,           0,   minSize / 2)
    const endR       = this.clamp(params?.endRadius   ?? minSize / 2, 1,   minSize / 2)
    const tightness  = this.clamp(params?.tightness   ?? 1,           0.1, 5)
    const cx = w / 2, cy = h / 2
    const totalAngle = turns * Math.PI * 2
    // ~2° per sample, capped between 24 and 4096 samples
    const samples    = this.spiralSamples(turns)
    const cmds: PathDefinition['commands'] = []
    for (let i = 0; i <= samples; i++) {
      const t = i / samples
      const a = t * totalAngle - Math.PI / 2
      const r = startR + (endR - startR) * Math.pow(t, tightness)
      const x = cx + r * Math.cos(a)
      const y = cy + r * Math.sin(a)
      cmds.push(i === 0 ? M(x, y) : L(x, y))
    }
    return { closed: false, commands: cmds }
  }

  // ── Wave (BL-24) — Sinusoidal wave line, open path ──────────────────────────
  //
  // y(t) = cy + amplitude * sin(2π * frequency * t + phase)
  // x(t) = t * width
  //
  // Centered vertically. Animate `phase` for traveling-wave effect.

  private static wave(w: number, h: number, params?: ShapeParams): PathDefinition {
    const amplitude = this.clamp(params?.amplitude ?? h / 4, 0,   h / 2)
    const frequency = this.clamp(params?.frequency ?? 2,     0.1, 50)
    const phase     = params?.phase ?? 0
    const cy        = h / 2
    // ~1.5px per sample, capped between 48 and 4096 samples
    const samples   = this.waveSamples(w)
    const cmds: PathDefinition['commands'] = []
    for (let i = 0; i <= samples; i++) {
      const t = i / samples
      const x = t * w
      const y = cy + amplitude * Math.sin(2 * Math.PI * frequency * t + phase)
      cmds.push(i === 0 ? M(x, y) : L(x, y))
    }
    return { closed: false, commands: cmds }
  }

  // ── Blob (BL-24) — Seeded irregular closed polygon ──────────────────────────
  //
  // Vertices placed evenly around a circle.
  // Each vertex radius modulated by deterministic noise:
  //   r(i) = baseR * (1 + irregularity * noise(seed, i))
  //
  // `seed` should NOT be animated — would cause per-frame jumping.

  private static blob(w: number, h: number, params?: ShapeParams): PathDefinition {
    const n     = this.clamp(Math.round(params?.sides ?? 8),         5, 64)
    const irr   = this.clamp(params?.irregularity ?? 0.4,            0, 1)
    const seed  = Math.round(params?.seed ?? 42)
    const baseR = Math.min(w, h) / 2
    const cx = w / 2, cy = h / 2
    // Deterministic seeded PRNG (sine-hash). Same (seed, i) → same value.
    const rng = (i: number) => {
      const x = Math.sin(seed * 9301 + i * 49297 + 233) * 1000
      return x - Math.floor(x)  // 0..1
    }
    const cmds: PathDefinition['commands'] = []
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2
      const r = baseR * (1 + irr * (rng(i) * 2 - 1))  // baseR ± irr*baseR
      const x = cx + r * Math.cos(a)
      const y = cy + r * Math.sin(a)
      cmds.push(i === 0 ? M(x, y) : L(x, y))
    }
    cmds.push(Z())
    return { closed: true, commands: cmds }
  }
}
