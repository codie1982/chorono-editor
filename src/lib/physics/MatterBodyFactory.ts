import Matter from 'matter-js'
import type { RigidBodyBakeRecipe, RigidBodySnapshot } from '@/lib/types/physics'

/**
 * Creates one detached Matter body from a validated rigid snapshot.
 *
 * The factory owns no world, listener or body registry. Polygon coordinates
 * are centroid-relative composition pixels; `center` and `angleDeg` place the
 * resulting body in world space. Callers own insertion and disposal.
 */
export class MatterBodyFactory {
  constructor(private readonly recipe: RigidBodyBakeRecipe) {}

  create(
    input: RigidBodySnapshot,
    center: { readonly x: number; readonly y: number },
    angleDeg: number,
  ): Matter.Body {
    const options = {
      label: input.bodyId,
      isStatic: input.motionType === 'static',
      angle: angleDeg * Math.PI / 180,
      density: input.material.densityKgPerSquareMeter / this.recipe.pixelsPerMeter ** 2,
      friction: input.material.friction,
      restitution: input.material.restitution,
      frictionAir: input.material.airFriction,
    }
    if (input.collider === 'rectangle') {
      return Matter.Bodies.rectangle(center.x, center.y, input.widthPx, input.heightPx, options)
    }
    if (input.collider === 'convexPolygon') {
      if (!input.colliderVerticesPx || input.colliderVerticesPx.length < 3) {
        throw new Error(`Convex rigid body ${input.bodyId} has no collider vertices`)
      }
      return Matter.Bodies.fromVertices(
        center.x,
        center.y,
        [input.colliderVerticesPx.map(point => ({ x: point.x, y: point.y }))],
        options,
        false,
        1e-9,
        1e-9,
        1e-9,
      )
    }
    if (!input.colliderPartsPx?.length || input.colliderPartsPx.some(part => part.length < 3)) {
      throw new Error(`Compound rigid body ${input.bodyId} has no convex collider parts`)
    }
    return Matter.Bodies.fromVertices(
      center.x,
      center.y,
      input.colliderPartsPx.map(part => part.map(point => ({ x: point.x, y: point.y }))),
      options,
      false,
      1e-9,
      1e-9,
      1e-9,
    )
  }
}
