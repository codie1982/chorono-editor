import type { RigidBodySnapshot } from '@/lib/types/physics'

export interface RigidPose2D {
  readonly centerX: number
  readonly centerY: number
  /** Clockwise screen-space degrees; never wrapped to a single turn. */
  readonly angleDeg: number
}

/**
 * Maps a Chorono rectangle transform to its rigid-body centre.
 *
 * Layer x/y locate the unrotated local origin while rotation occurs around the
 * authored anchor. The solver owns the rectangle centre of mass, so preserving
 * this offset prevents a non-centred anchor from jumping when bake playback
 * begins. Coordinates are composition pixels with +Y down.
 */
export function rigidCenterFromVisual(input: {
  readonly x: number
  readonly y: number
  readonly angleDeg: number
  readonly widthPx: number
  readonly heightPx: number
  readonly anchorX: number
  readonly anchorY: number
  readonly uniformScale: number
}): { x: number; y: number } {
  const offset = rotate(
    (input.widthPx / 2 - input.anchorX) * input.uniformScale,
    (input.heightPx / 2 - input.anchorY) * input.uniformScale,
    input.angleDeg,
  )
  return { x: input.x + input.anchorX + offset.x, y: input.y + input.anchorY + offset.y }
}

/** Inverts rigidCenterFromVisual for normal transform-track compilation. */
export function visualTransformFromRigidPose(body: RigidBodySnapshot, pose: RigidPose2D): {
  x: number; y: number; rotationDeg: number
} {
  const visual = body.visual
  const center = visual.centerOfMassLocalPx ?? { x: visual.widthPx / 2, y: visual.heightPx / 2 }
  const offset = rotate(
    (center.x - visual.anchorX) * visual.uniformScale,
    (center.y - visual.anchorY) * visual.uniformScale,
    pose.angleDeg,
  )
  return {
    x: pose.centerX - visual.anchorX - offset.x,
    y: pose.centerY - visual.anchorY - offset.y,
    rotationDeg: pose.angleDeg,
  }
}

function rotate(x: number, y: number, degrees: number): { x: number; y: number } {
  const radians = degrees * Math.PI / 180
  const cosine = Math.cos(radians), sine = Math.sin(radians)
  return { x: cosine * x - sine * y, y: sine * x + cosine * y }
}
