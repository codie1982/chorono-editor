// ── SvgTransformParser ────────────────────────────────────────────────────────
//
// Parses an SVG `transform="…"` attribute into a single Matrix2D.
//
// Supported functions (per SVG 1.1 / 2 spec):
//   translate(tx [, ty])
//   scale(sx [, sy])
//   rotate(angle [, cx, cy])
//   skewX(angle)
//   skewY(angle)
//   matrix(a b c d e f)
//
// Multiple functions compose left-to-right in DOM order (matches SVG spec:
// "transform=‘A B C’" applies A first to the local coordinate system, then
// B in that new system, then C — equivalent to A × B × C when post-multiplied).
//
// Pure: no DOM, fully testable in node.

import { Matrix2D } from '@/lib/geometry/Matrix2D'
import type { SvgImportWarning } from '@/lib/types/svg'

const TRANSFORM_FN_RE = /([a-zA-Z]+)\s*\(\s*([^)]*)\s*\)/g
const NUMBER_RE       = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g

export class SvgTransformParser {
  /**
   * Parses a transform string into a Matrix2D. Returns identity for null /
   * empty input. Unknown functions emit a warning but don't abort the parse.
   */
  parse(transformStr: string | null | undefined, warnings: SvgImportWarning[] = []): Matrix2D {
    if (!transformStr || transformStr.trim().length === 0) return Matrix2D.identity()

    let result = Matrix2D.identity()
    let match: RegExpExecArray | null
    TRANSFORM_FN_RE.lastIndex = 0

    while ((match = TRANSFORM_FN_RE.exec(transformStr)) !== null) {
      const fn   = match[1].toLowerCase()
      const args = this.parseNumbers(match[2])
      const m    = this.functionToMatrix(fn, args, warnings)
      if (m) result = result.multiply(m)
    }

    return result
  }

  /** Converts a single function invocation to a Matrix2D. */
  private functionToMatrix(
    fn:       string,
    args:     number[],
    warnings: SvgImportWarning[],
  ): Matrix2D | null {
    switch (fn) {
      case 'translate': {
        const [tx, ty = 0] = args
        if (tx === undefined) return null
        return Matrix2D.translation(tx, ty)
      }

      case 'scale': {
        const [sx, sy] = args
        if (sx === undefined) return null
        return Matrix2D.scale(sx, sy ?? sx)
      }

      case 'rotate': {
        const [angle, cx, cy] = args
        if (angle === undefined) return null
        // rotate(a, cx, cy) ≡ translate(cx, cy) × rotate(a) × translate(-cx, -cy)
        if (cx !== undefined && cy !== undefined) {
          return Matrix2D.translation(cx, cy)
            .multiply(Matrix2D.rotation(angle))
            .multiply(Matrix2D.translation(-cx, -cy))
        }
        return Matrix2D.rotation(angle)
      }

      case 'skewx': {
        const [a] = args
        if (a === undefined) return null
        return Matrix2D.skewX(a)
      }

      case 'skewy': {
        const [a] = args
        if (a === undefined) return null
        return Matrix2D.skewY(a)
      }

      case 'matrix': {
        if (args.length !== 6) return null
        const [a, b, c, d, e, f] = args
        return new Matrix2D(a, b, c, d, e, f)
      }

      default:
        warnings.push({
          code:    'UNSUPPORTED_TRANSFORM',
          message: `Unknown SVG transform function "${fn}" — skipped`,
        })
        return null
    }
  }

  private parseNumbers(str: string): number[] {
    const out: number[] = []
    let match: RegExpExecArray | null
    NUMBER_RE.lastIndex = 0
    while ((match = NUMBER_RE.exec(str)) !== null) {
      out.push(parseFloat(match[0]))
    }
    return out
  }
}
