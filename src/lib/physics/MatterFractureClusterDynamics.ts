import Matter from 'matter-js'

const MATTER_BASE_DELTA_MS = 1000 / 60

export interface MatterClusterContactLoad {
  readonly pointPx: { readonly x: number; readonly y: number }
  readonly impulse: number
  readonly relativeSpeed: number
}

/** Measure one active Matter pair in composition-pixel-facing load units. */
export function matterClusterContactLoad(
  pair: Matter.Pair,
  bodyA: Matter.Body,
  bodyB: Matter.Body,
): MatterClusterContactLoad {
  const pointPx = contactPoint(pair, bodyA, bodyB)
  const impulse = (pair.activeContacts ?? pair.contacts ?? []).reduce((sum: number, contact: Matter.Contact) => (
    sum + Math.abs(contact.normalImpulse)
  ), 0) * 1000 / MATTER_BASE_DELTA_MS
  const velocityA = velocityAtPoint(bodyA, pointPx)
  const velocityB = velocityAtPoint(bodyB, pointPx)
  const normal = pair.collision.normal
  const relativeSpeed = Math.abs((velocityB.x - velocityA.x) * normal.x
    + (velocityB.y - velocityA.y) * normal.y) * 1000 / MATTER_BASE_DELTA_MS
  return { pointPx, impulse, relativeSpeed }
}

/** Rotate a detached source-local vector by a clockwise y-down radian angle. */
export function rotateMatterVector(
  point: { readonly x: number; readonly y: number },
  radians: number,
): { x: number; y: number } {
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  return { x: cosine * point.x - sine * point.y, y: sine * point.x + cosine * point.y }
}

/**
 * Preserve mass, centre of mass and both momenta across one component split.
 *
 * Matter compound inertia omits the inter-component parallel-axis term. This
 * function therefore solves one common post-split angular velocity from the
 * complete effective inertia, applies the rigid velocity field at each child
 * centroid and verifies every invariant before the caller publishes bodies.
 */
export function applyConservedMatterClusterField(
  source: Matter.Body,
  children: readonly Matter.Body[],
): void {
  const totalMass = children.reduce((sum, body) => sum + body.mass, 0)
  if (!Number.isFinite(totalMass) || totalMass <= 0) throw new Error('Fracture cluster split produced invalid mass')
  const center = children.reduce((sum, body) => ({
    x: sum.x + body.position.x * body.mass,
    y: sum.y + body.position.y * body.mass,
  }), { x: 0, y: 0 })
  center.x /= totalMass
  center.y /= totalMass
  const effectiveInertia = children.reduce((sum, body) => {
    const dx = body.position.x - center.x
    const dy = body.position.y - center.y
    return sum + body.inertia + body.mass * (dx * dx + dy * dy)
  }, 0)
  if (!Number.isFinite(effectiveInertia) || effectiveInertia <= 0) {
    throw new Error('Fracture cluster split produced invalid inertia')
  }
  const angularVelocity = source.inertia * source.angularVelocity / effectiveInertia
  children.forEach(body => {
    const dx = body.position.x - center.x
    const dy = body.position.y - center.y
    Matter.Body.setVelocity(body, {
      x: source.velocity.x - angularVelocity * dy,
      y: source.velocity.y + angularVelocity * dx,
    })
    Matter.Body.setAngularVelocity(body, angularVelocity)
  })
  const linearMomentum = children.reduce((sum, body) => ({
    x: sum.x + body.mass * body.velocity.x,
    y: sum.y + body.mass * body.velocity.y,
  }), { x: 0, y: 0 })
  const angularMomentum = children.reduce((sum, body) => {
    const dx = body.position.x - center.x
    const dy = body.position.y - center.y
    return sum + body.inertia * body.angularVelocity
      + body.mass * (dx * body.velocity.y - dy * body.velocity.x)
  }, 0)
  assertRelativeClose(totalMass, source.mass, 'mass')
  assertRelativeClose(center.x, source.position.x, 'centre x')
  assertRelativeClose(center.y, source.position.y, 'centre y')
  assertRelativeClose(linearMomentum.x, source.mass * source.velocity.x, 'linear momentum x')
  assertRelativeClose(linearMomentum.y, source.mass * source.velocity.y, 'linear momentum y')
  assertRelativeClose(angularMomentum, source.inertia * source.angularVelocity, 'angular momentum')
}

function contactPoint(pair: Matter.Pair, bodyA: Matter.Body, bodyB: Matter.Body): { x: number; y: number } {
  const supports = (pair.collision.supports ?? []).filter((point): point is Matter.Vector => !!point)
  if (!supports.length) return { x: (bodyA.position.x + bodyB.position.x) / 2, y: (bodyA.position.y + bodyB.position.y) / 2 }
  return {
    x: supports.reduce((sum, point) => sum + point.x, 0) / supports.length,
    y: supports.reduce((sum, point) => sum + point.y, 0) / supports.length,
  }
}

function velocityAtPoint(body: Matter.Body, point: { readonly x: number; readonly y: number }): { x: number; y: number } {
  const x = point.x - body.position.x
  const y = point.y - body.position.y
  return { x: body.velocity.x - body.angularVelocity * y, y: body.velocity.y + body.angularVelocity * x }
}

function assertRelativeClose(actual: number, expected: number, label: string): void {
  const tolerance = Math.max(1e-7, Math.abs(expected) * 1e-6)
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
    throw new Error(`Fracture cluster split does not conserve ${label}`)
  }
}
