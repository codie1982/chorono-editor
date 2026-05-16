// ── SvgArcConverter ───────────────────────────────────────────────────────────
//
// Converts an SVG elliptical arc command:
//
//   A rx ry x-axis-rotation large-arc-flag sweep-flag x y
//
// …into a sequence of cubic bezier `C` commands. The chorono renderer never
// has to know about arcs — they're just curves like any other.
//
// Algorithm (per SVG 2 spec Appendix B.2 "Elliptical Arc Implementation Notes",
// commonly attributed to Luc Maisonobe's "Drawing an elliptical arc using
// polylines, quadratic or cubic Bezier curves", 2003):
//
//   1. Endpoint → centre parameterisation
//      Recovers (cx, cy), start angle θ₁, sweep angle Δθ from the two
//      endpoints + radii + flags.
//
//   2. Subdivide into ≤90° segments
//      A cubic bezier can approximate at most a quarter-circle with ~10⁻⁴
//      max radial error. Beyond that the error grows quickly, so we split.
//
//   3. Each segment → one cubic bezier
//      For a unit-circle arc from angle α to β (β − α ≤ π/2):
//          P0 = (cos α, sin α)
//          P3 = (cos β, sin β)
//          t  = (4/3) · tan((β − α)/4)            ← magic tangent length
//          P1 = (cos α − t·sin α,  sin α + t·cos α)
//          P2 = (cos β + t·sin β,  sin β − t·cos β)
//      Then scale by (rx, ry), rotate by φ, translate by (cx, cy).
//
// Pure: takes numbers, returns commands. No DOM, no canvas. Tested in node.

import type { CubicToCommand } from '@/lib/geometry/PathCommand'
import { C } from '@/lib/geometry/PathCommand'

/** Inputs to one A command, post-tokenization. */
export interface SvgArcParams {
  /** Start of arc (current point). */
  x1: number
  y1: number
  /** End of arc (the A command's x, y). */
  x2: number
  y2: number
  /** Ellipse radii. Will be auto-normalised to positive + made big enough. */
  rx: number
  ry: number
  /** x-axis rotation in degrees. */
  xAxisRotationDeg: number
  /** Large-arc flag (0 = small, 1 = large). */
  largeArc: 0 | 1
  /** Sweep flag (0 = counter-clockwise, 1 = clockwise). */
  sweep: 0 | 1
}

export class SvgArcConverter {
  /**
   * Returns 1–4 cubic bezier commands approximating the arc. Each command
   * ends at the next point on the arc; the final command ends at (x2, y2).
   *
   * Degenerate cases handled:
   *   - rx == 0 or ry == 0     → returns [] (caller should emit L x2 y2)
   *   - (x1,y1) == (x2,y2)     → returns [] (zero-length arc per spec)
   */
  convert(params: SvgArcParams): CubicToCommand[] {
    let { rx, ry } = params
    const { x1, y1, x2, y2, xAxisRotationDeg, largeArc, sweep } = params

    // ── Degenerate: same endpoints — spec says "do not draw anything"
    if (x1 === x2 && y1 === y2) return []

    // ── Degenerate: zero radius — caller should treat as line
    if (rx === 0 || ry === 0) return []

    // Radii must be positive
    rx = Math.abs(rx)
    ry = Math.abs(ry)

    // ── Step 1: Compute (cx, cy), θ₁, Δθ ─────────────────────────────────────
    const phi    = (xAxisRotationDeg * Math.PI) / 180
    const cosPhi = Math.cos(phi)
    const sinPhi = Math.sin(phi)

    // Step B.2.5.1: (x1', y1') — endpoints in the rotated coordinate system,
    // centred on the midpoint of the chord.
    const dx = (x1 - x2) / 2
    const dy = (y1 - y2) / 2
    const x1p =  cosPhi * dx + sinPhi * dy
    const y1p = -sinPhi * dx + cosPhi * dy

    // Step B.2.5.2: enlarge radii if they're too small to span the chord.
    // Λ = (x1')²/rx² + (y1')²/ry²  > 1 means the radii don't reach.
    const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
    if (lambda > 1) {
      const sqrtL = Math.sqrt(lambda)
      rx *= sqrtL
      ry *= sqrtL
    }

    // Step B.2.5.3: (cx', cy') — centre in the rotated coordinate system.
    const rxSq  = rx * rx
    const rySq  = ry * ry
    const y1pSq = y1p * y1p
    const x1pSq = x1p * x1p

    let factor = (rxSq * rySq - rxSq * y1pSq - rySq * x1pSq) /
                 (rxSq * y1pSq + rySq * x1pSq)
    factor = Math.max(0, factor)        // guard against tiny negatives from FP
    factor = Math.sqrt(factor)
    if (largeArc === sweep) factor = -factor

    const cxp = factor *  (rx * y1p) / ry
    const cyp = factor * -(ry * x1p) / rx

    // Step B.2.5.4: rotate centre back to original coordinate system.
    const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2
    const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2

    // Step B.2.5.5: θ₁ (start angle) and Δθ (sweep angle).
    const ux = ( x1p - cxp) / rx
    const uy = ( y1p - cyp) / ry
    const vx = (-x1p - cxp) / rx
    const vy = (-y1p - cyp) / ry

    const theta1 = signedAngle(1, 0, ux, uy)
    let   delta  = signedAngle(ux, uy, vx, vy)

    // Normalise Δθ to match sweep flag.
    if (sweep === 0 && delta > 0) delta -= 2 * Math.PI
    if (sweep === 1 && delta < 0) delta += 2 * Math.PI

    // ── Step 2: Subdivide into ≤90° segments ─────────────────────────────────
    const nSegments = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)))
    const segAngle  = delta / nSegments

    // Magic tangent length for cubic bezier approximation of a circular arc:
    //   t = (4/3) · tan(segAngle / 4)
    // Derivation: forces the bezier to match the arc's endpoints, tangents,
    // AND midpoint, giving maximal accuracy for the four-point representation.
    const t = (4 / 3) * Math.tan(segAngle / 4)

    const commands: CubicToCommand[] = []
    for (let i = 0; i < nSegments; i++) {
      const a1 = theta1 + i * segAngle
      const a2 = a1 + segAngle

      const cosA1 = Math.cos(a1), sinA1 = Math.sin(a1)
      const cosA2 = Math.cos(a2), sinA2 = Math.sin(a2)

      // Unit-circle bezier control points
      // (P0 is the previous segment's endpoint; not emitted here.)
      const p1x = cosA1 - t * sinA1
      const p1y = sinA1 + t * cosA1
      const p2x = cosA2 + t * sinA2
      const p2y = sinA2 - t * cosA2
      const p3x = cosA2
      const p3y = sinA2

      // Apply ellipse scale, x-axis rotation, centre translation.
      const out1 = transformPoint(p1x, p1y, rx, ry, cosPhi, sinPhi, cx, cy)
      const out2 = transformPoint(p2x, p2y, rx, ry, cosPhi, sinPhi, cx, cy)
      const out3 = transformPoint(p3x, p3y, rx, ry, cosPhi, sinPhi, cx, cy)

      commands.push(C(out1.x, out1.y, out2.x, out2.y, out3.x, out3.y))
    }

    return commands
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Signed angle from vector (ux, uy) to (vx, vy), in radians.
 * Range: [-π, π]. Sign follows the cross product (positive = counter-clockwise
 * in standard math convention).
 */
function signedAngle(ux: number, uy: number, vx: number, vy: number): number {
  const dot   = ux * vx + uy * vy
  const lenU  = Math.hypot(ux, uy)
  const lenV  = Math.hypot(vx, vy)
  // Clamp to avoid acos domain errors from FP noise (|cos| sometimes lands
  // at 1 + 1e-16 which would make acos return NaN).
  const cos   = Math.max(-1, Math.min(1, dot / (lenU * lenV)))
  const angle = Math.acos(cos)
  const cross = ux * vy - uy * vx
  return cross < 0 ? -angle : angle
}

/** Scales by (rx, ry), rotates by φ, translates by (cx, cy). */
function transformPoint(
  x:       number,
  y:       number,
  rx:      number,
  ry:      number,
  cosPhi:  number,
  sinPhi:  number,
  cx:      number,
  cy:      number,
): { x: number; y: number } {
  const px = x * rx
  const py = y * ry
  return {
    x: cosPhi * px - sinPhi * py + cx,
    y: sinPhi * px + cosPhi * py + cy,
  }
}
