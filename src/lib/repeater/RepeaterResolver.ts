// ── RepeaterResolver ──────────────────────────────────────────────────────────
//
// Computes N transformed instances of a source layer. Two modes:
//
//   - LINEAR  : each instance is the previous one with a delta transform
//               applied (matrix chain). Use for repeated icons, rows, etc.
//
//   - POLAR   : instances are placed at evenly-spaced angles around a circle
//               of given radius. Use for orbit dots, loading rings, radial
//               patterns.
//
// Pure resolver — does no rendering. Returns RepeatedInstance[] which the
// renderer then draws with each instance's matrix applied.

import { Matrix2D } from '@/lib/geometry'

export type RepeaterMode = 'linear' | 'polar'

export interface RepeaterTransformStep {
  x?:        number
  y?:        number
  rotation?: number   // degrees
  scaleX?:   number
  scaleY?:   number
  opacity?:  number   // multiplied per iteration
}

export interface PolarRepeaterParams {
  radius:     number
  startAngle: number   // degrees, 0 = 12 o'clock
  endAngle:   number   // degrees
  /** Rotate each instance to face outward (true = orient to angle). */
  orientToAngle?: boolean
}

export interface RepeaterDefinition {
  /** Source layer being repeated. */
  sourceLayerId: string
  count:         number
  mode:          RepeaterMode
  /** For linear mode. */
  transformStep?: RepeaterTransformStep
  /** For polar mode. */
  polar?: PolarRepeaterParams
}

export interface RepeatedInstance {
  index:             number
  /** Affine matrix to apply on top of the source layer's own transform. */
  matrix:            Matrix2D
  /** Opacity multiplier — combine with source layer opacity. */
  opacityMultiplier: number
}

export class RepeaterResolver {
  resolve(def: RepeaterDefinition): RepeatedInstance[] {
    if (def.count <= 0) return []
    if (def.mode === 'polar' && def.polar) return this.polar(def, def.polar)
    return this.linear(def, def.transformStep ?? {})
  }

  // ── Linear: build a matrix chain ────────────────────────────────────────

  private linear(def: RepeaterDefinition, step: RepeaterTransformStep): RepeatedInstance[] {
    const out: RepeatedInstance[] = []
    let matrix  = Matrix2D.identity()
    let opacity = 1

    const stepMatrix = this.stepToMatrix(step)
    const stepOpacity = step.opacity ?? 1

    for (let i = 0; i < def.count; i++) {
      out.push({ index: i, matrix, opacityMultiplier: opacity })
      matrix  = matrix.multiply(stepMatrix)
      opacity *= stepOpacity
    }
    return out
  }

  private stepToMatrix(step: RepeaterTransformStep): Matrix2D {
    let m = Matrix2D.identity()
    if (step.x || step.y) m = m.multiply(Matrix2D.translation(step.x ?? 0, step.y ?? 0))
    if (step.rotation)    m = m.multiply(Matrix2D.rotation(step.rotation))
    if (step.scaleX != null || step.scaleY != null) {
      m = m.multiply(Matrix2D.scale(step.scaleX ?? 1, step.scaleY ?? 1))
    }
    return m
  }

  // ── Polar: angle = lerp(startAngle, endAngle, t) ────────────────────────

  private polar(def: RepeaterDefinition, polar: PolarRepeaterParams): RepeatedInstance[] {
    const out: RepeatedInstance[] = []
    const { radius, startAngle, endAngle, orientToAngle = false } = polar

    for (let i = 0; i < def.count; i++) {
      const t      = def.count === 1 ? 0 : i / (def.count - 1)
      const angle  = startAngle + (endAngle - startAngle) * t
      const rad    = ((angle - 90) * Math.PI) / 180   // 0° = 12 o'clock convention

      let matrix = Matrix2D.translation(Math.cos(rad) * radius, Math.sin(rad) * radius)
      if (orientToAngle) matrix = matrix.multiply(Matrix2D.rotation(angle))

      out.push({ index: i, matrix, opacityMultiplier: 1 })
    }
    return out
  }
}

export const defaultRepeaterResolver = new RepeaterResolver()
