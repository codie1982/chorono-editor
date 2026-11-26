import type { RigidBodySolverEvent } from './PhysicsBackend'
import type { RigidBodyBakeRecipe, RigidFractureEvent } from '@/lib/types/physics'
import { hashRigidBodyBakeRecipe } from './RigidBodySceneCompiler'
import { assertRigidFractureEvents } from './RigidFractureValidation'

/**
 * Replaces unresolved impact placeholders with exact solver tick evidence.
 *
 * The input recipe remains immutable. Timed events are verified against the
 * solver marker; impact events require contact body, point, normal and closing
 * speed metadata. The returned recipe receives a new canonical hash and is the
 * only recipe that may compile visibility tracks or be committed to a scene.
 */
export function realizeRigidFractureRecipe(
  recipe: RigidBodyBakeRecipe,
  solverEvents: readonly RigidBodySolverEvent[],
): RigidBodyBakeRecipe {
  if (!recipe.fractureEvents?.length) return recipe
  const markers = new Map(solverEvents
    .filter(event => event.kind === 'fracture' && event.fracture)
    .map(event => [event.fracture!.eventId, event]))
  const fractureEvents = recipe.fractureEvents.map(event => realizeEvent(event, markers.get(event.id)))
  const fractureBondBreakEvents = solverEvents.filter(event => event.kind === 'bond-break' && event.bondBreak)
    .map(event => Object.freeze({
      tick: event.tick,
      timeMs: event.timeMs,
      graphId: event.bondBreak!.graphId,
      bondId: event.bondBreak!.bondId,
      fragmentBodyIds: Object.freeze([...event.bodyIds] as [string, string]),
      load: event.bondBreak!.load,
      accumulatedDamage: event.bondBreak!.accumulatedDamage,
      reason: event.bondBreak!.reason,
      componentIds: Object.freeze([...event.bondBreak!.componentIds]),
    }))
  const withoutHash: Omit<RigidBodyBakeRecipe, 'recipeHash'> = {
    ...recipe,
    fractureEvents,
    ...(fractureBondBreakEvents.length ? { fractureBondBreakEvents } : {}),
  }
  const realized = Object.freeze({ ...withoutHash, recipeHash: hashRigidBodyBakeRecipe(withoutHash) })
  assertRigidFractureEvents(realized, { requireRealized: true })
  return realized
}

function realizeEvent(event: RigidFractureEvent, marker: RigidBodySolverEvent | undefined): RigidFractureEvent {
  if (!marker?.fracture) throw new Error(`Fracture trigger did not occur during simulation: ${event.id}`)
  if (event.trigger?.kind !== 'impact') {
    if (marker.tick !== event.tick || Math.abs(marker.timeMs - event.timeMs) > 1e-7) {
      throw new Error(`Timed fracture marker does not match recipe event: ${event.id}`)
    }
    return event
  }
  const evidence = marker.fracture
  if (evidence.triggerKind !== 'impact' || !evidence.contactBodyId
    || evidence.relativeNormalSpeedPxPerSecond === undefined
    || !evidence.contactPointPx || !evidence.contactNormal) {
    throw new Error(`Impact fracture marker is incomplete: ${event.id}`)
  }
  return Object.freeze({
    ...event,
    timeMs: marker.timeMs,
    tick: marker.tick,
    realization: Object.freeze({
      kind: 'impact' as const,
      contactBodyId: evidence.contactBodyId,
      relativeNormalSpeedPxPerSecond: evidence.relativeNormalSpeedPxPerSecond,
      contactPointPx: Object.freeze({ ...evidence.contactPointPx }),
      contactNormal: Object.freeze({ ...evidence.contactNormal }),
    }),
  })
}
