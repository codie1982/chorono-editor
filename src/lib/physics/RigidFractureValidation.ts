import { SimulationClock } from '@/lib/simulation/SimulationClock'
import type { RigidBodyBakeRecipe } from '@/lib/types/physics'

/**
 * Validates atomic body-replacement events independently from geometry authoring.
 *
 * Events must land on a fixed solver tick, be strictly ordered, own distinct
 * source/fragment bodies, and match every fragment activation descriptor. The
 * first implementation supports one generation per source; later recursive
 * destruction can extend this policy without changing Matter body creation.
 */
export function assertRigidFractureEvents(recipe: RigidBodyBakeRecipe): void {
  const events = recipe.fractureEvents ?? []
  if (events.length > 32) throw new RangeError('Rigid fracture event budget exceeded')
  const clock = new SimulationClock(recipe)
  const bodyById = new Map(recipe.bodies.map(body => [body.bodyId, body]))
  const eventIds = new Set<string>(), ownedBodies = new Set<string>()
  let previousTick = 0
  events.forEach(event => {
    if (!event.id || eventIds.has(event.id)) throw new Error(`Rigid fracture event id is missing or duplicated: ${event.id}`)
    eventIds.add(event.id)
    if (!Number.isSafeInteger(event.tick) || event.tick <= previousTick || event.tick > clock.totalTicks
      || Math.abs(clock.timeMsForTick(event.tick) - event.timeMs) > 1e-7) {
      throw new Error(`Rigid fracture event ${event.id} is not aligned to an ordered fixed tick`)
    }
    previousTick = event.tick
    const source = bodyById.get(event.sourceBodyId)
    if (!source || source.motionType !== 'dynamic' || source.activation || ownedBodies.has(source.bodyId)) {
      throw new Error(`Rigid fracture source is invalid: ${event.sourceBodyId}`)
    }
    ownedBodies.add(source.bodyId)
    if (event.fragmentBodyIds.length < 2 || event.fragmentBodyIds.length > 100
      || new Set(event.fragmentBodyIds).size !== event.fragmentBodyIds.length) {
      throw new Error(`Rigid fracture event ${event.id} has an invalid fragment set`)
    }
    event.fragmentBodyIds.forEach(bodyId => {
      const body = bodyById.get(bodyId)
      if (!body || body.motionType !== 'dynamic' || body.collider !== 'convexPolygon'
        || body.activation?.kind !== 'fractureFragment' || body.activation.eventId !== event.id
        || body.activation.sourceBodyId !== source.bodyId || ownedBodies.has(bodyId)) {
        throw new Error(`Rigid fracture fragment is invalid: ${bodyId}`)
      }
      ownedBodies.add(bodyId)
    })
  })
  recipe.bodies.filter(body => body.activation).forEach(body => {
    if (!ownedBodies.has(body.bodyId)) throw new Error(`Rigid fragment has no owning event: ${body.bodyId}`)
  })
}
