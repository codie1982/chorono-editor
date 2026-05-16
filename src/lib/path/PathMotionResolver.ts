// ── PathMotionResolver ────────────────────────────────────────────────────────
//
// Computes the (x, y, rotation) override for a target layer that should follow
// a path layer's curve at a given progress (0–1).
//
// Used by the renderer when a layer carries a `motionPath.followPathLayerId`
// binding. Combined with timeline keyframes on `motionPath.offset`, this drives
// "object travels along this curve" animations.

import type { PathDefinition } from '@/lib/geometry'
import { defaultPathSampler, PathSampler } from './PathSampler'

export interface PathMotionOptions {
  /** Rotate the layer to match the path tangent direction. */
  orientToPath?: boolean
  /** Extra rotation added on top of the tangent angle (degrees). */
  rotationOffset?: number
  /** Perpendicular offset from the path (px) — positive = right of travel. */
  perpendicularOffset?: number
}

export interface PathMotionResult {
  x: number
  y: number
  /** Angle in degrees. 0 if orientToPath is false. */
  rotation: number
}

export class PathMotionResolver {
  constructor(private sampler: PathSampler = defaultPathSampler) {}

  /**
   * Returns the world-space (x, y) and tangent rotation for a target layer at
   * the given progress along the supplied path.
   *
   * `pathOriginX/Y` is added to the sampled point — useful when the path layer
   * itself is positioned away from origin and its commands are layer-local.
   */
  resolve(
    path:         PathDefinition,
    progress:     number,
    pathOriginX:  number,
    pathOriginY:  number,
    options:      PathMotionOptions = {},
  ): PathMotionResult {
    const table  = this.sampler.buildLengthTable(path)
    const sample = table.pointAtProgress(progress)

    let x = pathOriginX + sample.x
    let y = pathOriginY + sample.y

    if (options.perpendicularOffset && options.perpendicularOffset !== 0) {
      // Perpendicular to tangent (right-hand normal): (ty, -tx) — when tangent
      // is (tx, ty), the right normal in screen coords (Y down) is (ty, -tx).
      const nx = sample.tangentY
      const ny = -sample.tangentX
      x += nx * options.perpendicularOffset
      y += ny * options.perpendicularOffset
    }

    const rotation = options.orientToPath
      ? sample.angle + (options.rotationOffset ?? 0)
      : 0

    return { x, y, rotation }
  }
}

export const defaultPathMotionResolver = new PathMotionResolver()
