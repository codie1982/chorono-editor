import type { RigidFractureExplosion } from '@/lib/types/physics'
import { SeededRandom } from './SeededRandom'

export interface FractureExplosionFragment {
  /** Source-local fragment-centroid offset from the source centre of mass. */
  readonly sourceLocalOffsetPx: { readonly x: number; readonly y: number }
}

export interface FractureExplosionDelta {
  readonly linearVelocityPxPerSecond: { readonly x: number; readonly y: number }
  readonly angularVelocityDegPerSecond: number
}

/**
 * Resolves deterministic one-shot artistic velocity deltas for rigid fragments.
 *
 * The radial centre is source-local and rotates with the source. Directional
 * velocity remains in composition space so its angle matches the editor. The
 * stable fragment array order owns PRNG consumption: two values per fragment,
 * regardless of zero strength. This helper adds no Matter or scene state.
 */
export class FractureExplosionImpulseResolver {
  resolve(
    explosion: RigidFractureExplosion,
    sourceAngleRadians: number,
    fragments: readonly FractureExplosionFragment[],
  ): readonly FractureExplosionDelta[] {
    const random = new SeededRandom(explosion.seed)
    const centre = rotate(explosion.centerLocalOffsetPx, sourceAngleRadians)
    const directionRadians = explosion.directionDeg * Math.PI / 180
    const directional = {
      x: Math.cos(directionRadians) * explosion.directionalVelocityPxPerSecond,
      y: Math.sin(directionRadians) * explosion.directionalVelocityPxPerSecond,
    }
    return Object.freeze(fragments.map(fragment => {
      const magnitudeRandom = random.next()
      const spinRandom = random.next()
      const offset = rotate(fragment.sourceLocalOffsetPx, sourceAngleRadians)
      const radial = normalizedOrSeeded(
        { x: offset.x - centre.x, y: offset.y - centre.y },
        magnitudeRandom,
      )
      const multiplier = 1 + (magnitudeRandom * 2 - 1) * explosion.variation
      return Object.freeze({
        linearVelocityPxPerSecond: Object.freeze({
          x: (radial.x * explosion.radialVelocityPxPerSecond + directional.x) * multiplier,
          y: (radial.y * explosion.radialVelocityPxPerSecond + directional.y) * multiplier,
        }),
        angularVelocityDegPerSecond: (spinRandom * 2 - 1)
          * explosion.spinVelocityDegPerSecond * multiplier,
      })
    }))
  }
}

function normalizedOrSeeded(
  value: { readonly x: number; readonly y: number },
  fallbackRandom: number,
): { x: number; y: number } {
  const length = Math.hypot(value.x, value.y)
  if (length > 1e-9) return { x: value.x / length, y: value.y / length }
  const angle = fallbackRandom * Math.PI * 2
  return { x: Math.cos(angle), y: Math.sin(angle) }
}

function rotate(
  point: { readonly x: number; readonly y: number },
  angleRadians: number,
): { x: number; y: number } {
  const cosine = Math.cos(angleRadians), sine = Math.sin(angleRadians)
  return { x: cosine * point.x - sine * point.y, y: sine * point.x + cosine * point.y }
}
