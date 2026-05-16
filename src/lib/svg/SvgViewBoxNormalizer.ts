// ── SvgViewBoxNormalizer ──────────────────────────────────────────────────────
//
// SVG documents define their coordinate system via `viewBox` + `width`/`height`
// attributes. To import shapes into a composition with different pixel
// dimensions, we need to compute a ROOT TRANSFORM that maps SVG user-space to
// Chorono composition space.
//
// Algorithm (per SVG spec, preserveAspectRatio):
//   1. Parse viewBox  → (vx, vy, vw, vh) — defaults to (0, 0, width, height)
//   2. Parse width/height (svgW/svgH) — falls back to viewBox dims
//   3. Compute scale: sx = svgW / vw,  sy = svgH / vh
//   4. preserveAspectRatio handling:
//      - 'none'              → use non-uniform scale (sx, sy)
//      - 'xMinYMin meet'     → use min(sx, sy), align top-left   (default)
//      - 'xMidYMid meet'     → use min(sx, sy), centre
//      - 'xMidYMid slice'    → use max(sx, sy), centre + clip
//   5. Root matrix = translate(-vx, -vy) post-multiplied by scale
//
// V1 supports the common cases. Exotic align/meet combos fall back to
// xMidYMid meet and emit no warning (silent — would be too noisy).

import { Matrix2D } from '@/lib/geometry/Matrix2D'
import type { SvgViewBox } from '@/lib/types/svg'

export interface SvgRootContext {
  /** Composition-space → SVG-userspace transformation. */
  rootMatrix: Matrix2D
  /** Final render width in composition pixels. */
  width:  number
  /** Final render height in composition pixels. */
  height: number
  /** Original viewBox, if present (for re-export later). */
  viewBox?: SvgViewBox
}

/** Minimal SVG element interface — accepts real SVGSVGElement or look-alike. */
interface SvgRootLike {
  getAttribute(name: string): string | null
}

export class SvgViewBoxNormalizer {
  /**
   * Computes the root transform that maps SVG user-space coordinates to the
   * normalised import space (typically composition pixels).
   *
   * Optional overrides:
   *   - desiredWidth / desiredHeight: target render size. Defaults to the
   *     SVG's intrinsic size.
   *   - scale: extra uniform scale (applied after fit).
   */
  createContext(
    svg: SvgRootLike,
    opts: { desiredWidth?: number; desiredHeight?: number; scale?: number } = {},
  ): SvgRootContext {
    const viewBox = this.parseViewBox(svg.getAttribute('viewBox'))
    const intrinsicW = this.parseLength(svg.getAttribute('width'))  ?? viewBox?.width  ?? 100
    const intrinsicH = this.parseLength(svg.getAttribute('height')) ?? viewBox?.height ?? 100

    const finalW = (opts.desiredWidth  ?? intrinsicW) * (opts.scale ?? 1)
    const finalH = (opts.desiredHeight ?? intrinsicH) * (opts.scale ?? 1)

    let rootMatrix: Matrix2D
    if (viewBox) {
      const par = this.parsePreserveAspectRatio(svg.getAttribute('preserveAspectRatio'))
      const sxRaw = finalW / viewBox.width
      const syRaw = finalH / viewBox.height

      let sx = sxRaw, sy = syRaw
      let dx = 0, dy = 0

      if (par.align !== 'none') {
        const s = par.meetOrSlice === 'slice'
          ? Math.max(sxRaw, syRaw)
          : Math.min(sxRaw, syRaw)
        sx = s; sy = s

        // Alignment offset within the (finalW × finalH) box
        const scaledW = viewBox.width  * s
        const scaledH = viewBox.height * s
        if (par.align.includes('xMid'))  dx = (finalW - scaledW) / 2
        if (par.align.includes('xMax'))  dx =  finalW - scaledW
        if (par.align.includes('YMid'))  dy = (finalH - scaledH) / 2
        if (par.align.includes('YMax'))  dy =  finalH - scaledH
      }

      // Compose: translate(dx, dy) × scale × translate(-vx, -vy)
      rootMatrix = Matrix2D
        .translation(dx, dy)
        .multiply(Matrix2D.scale(sx, sy))
        .multiply(Matrix2D.translation(-viewBox.x, -viewBox.y))
    } else if (opts.scale && opts.scale !== 1) {
      rootMatrix = Matrix2D.scale(opts.scale)
    } else {
      rootMatrix = Matrix2D.identity()
    }

    return { rootMatrix, width: finalW, height: finalH, viewBox }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private parseViewBox(str: string | null): SvgViewBox | undefined {
    if (!str) return undefined
    const nums = str.trim().split(/[\s,]+/).map(parseFloat).filter(Number.isFinite)
    if (nums.length !== 4) return undefined
    const [x, y, width, height] = nums
    if (width <= 0 || height <= 0) return undefined
    return { x, y, width, height }
  }

  private parseLength(str: string | null): number | undefined {
    if (!str) return undefined
    const m = str.match(/^(-?\d+(?:\.\d+)?)/)
    if (!m) return undefined
    return parseFloat(m[1])
  }

  private parsePreserveAspectRatio(str: string | null): { align: string; meetOrSlice: 'meet' | 'slice' } {
    // Default per spec: 'xMidYMid meet'
    if (!str) return { align: 'xMidYMid', meetOrSlice: 'meet' }
    const parts = str.trim().split(/\s+/)
    const align = parts[0]   ?? 'xMidYMid'
    const meet  = parts[1] === 'slice' ? 'slice' : 'meet'
    if (align === 'none') return { align: 'none', meetOrSlice: 'meet' }
    return { align, meetOrSlice: meet }
  }
}
