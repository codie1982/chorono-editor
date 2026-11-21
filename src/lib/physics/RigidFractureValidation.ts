import { SimulationClock } from '@/lib/simulation/SimulationClock'
import { FractureBondGraphValidator } from '@/lib/fracture/FractureBondGraphValidator'
import type { RigidBodyBakeRecipe } from '@/lib/types/physics'

/**
 * Validates atomic body-replacement events independently from geometry authoring.
 *
 * Events must land on a fixed solver tick, be strictly ordered, own distinct
 * source/fragment bodies, and match every fragment activation descriptor. The
 * first implementation supports one generation per source; later recursive
 * destruction can extend this policy without changing Matter body creation.
 */
export function assertRigidFractureEvents(
  recipe: RigidBodyBakeRecipe,
  options: { readonly requireRealized?: boolean } = {},
): void {
  const events = recipe.fractureEvents ?? []
  if (events.length > 32) throw new RangeError('Rigid fracture event budget exceeded')
  const clock = new SimulationClock(recipe)
  const bodyById = new Map(recipe.bodies.map(body => [body.bodyId, body]))
  const eventIds = new Set<string>(), ownedBodies = new Set<string>()
  let previousTick = 0
  events.forEach(event => {
    if (!event.id || eventIds.has(event.id)) throw new Error(`Rigid fracture event id is missing or duplicated: ${event.id}`)
    eventIds.add(event.id)
    const unresolvedImpact = event.trigger?.kind === 'impact' && event.tick === 0
      && event.timeMs === 0 && !event.realization
    if (options.requireRealized && unresolvedImpact) {
      throw new Error(`Impact fracture event ${event.id} was not realized by the simulation`)
    }
    if (!unresolvedImpact && (!Number.isSafeInteger(event.tick) || event.tick <= previousTick || event.tick > clock.totalTicks
      || Math.abs(clock.timeMsForTick(event.tick) - event.timeMs) > 1e-7)) {
      throw new Error(`Rigid fracture event ${event.id} is not aligned to an ordered fixed tick`)
    }
    if (!unresolvedImpact) previousTick = event.tick
    const source = bodyById.get(event.sourceBodyId)
    if (!source || source.motionType !== 'dynamic' || source.activation || ownedBodies.has(source.bodyId)) {
      throw new Error(`Rigid fracture source is invalid: ${event.sourceBodyId}`)
    }
    ownedBodies.add(source.bodyId)
    assertTrigger(event, bodyById, source.bodyId, unresolvedImpact)
    assertExplosion(event)
    if (event.fragmentBodyIds.length < 2 || event.fragmentBodyIds.length > 256
      || new Set(event.fragmentBodyIds).size !== event.fragmentBodyIds.length) {
      throw new Error(`Rigid fracture event ${event.id} has an invalid fragment set`)
    }
    event.fragmentBodyIds.forEach(bodyId => {
      const body = bodyById.get(bodyId)
      if (!body || body.motionType !== 'dynamic' || !['convexPolygon', 'compoundPolygon'].includes(body.collider)
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
  assertClusters(recipe, events)
  assertBondBreakEvents(recipe)
}

function assertClusters(
  recipe: RigidBodyBakeRecipe,
  events: readonly NonNullable<RigidBodyBakeRecipe['fractureEvents']>[number][],
): void {
  const clusters = recipe.fractureClusters ?? []
  if (clusters.length > events.length) throw new RangeError('Rigid fracture cluster budget exceeded')
  const eventIds = new Set<string>()
  clusters.forEach(cluster => {
    if (cluster.strategy !== 'compoundBody' || eventIds.has(cluster.eventId)) {
      throw new Error(`Rigid fracture cluster is invalid: ${cluster.eventId}`)
    }
    eventIds.add(cluster.eventId)
    const event = events.find(candidate => candidate.id === cluster.eventId)
    if (!event || event.explosion) throw new Error(`Rigid fracture cluster event is invalid: ${cluster.eventId}`)
    new FractureBondGraphValidator().validatePortable(cluster.graph)
    const fragmentLayerIds = event.fragmentBodyIds.map(bodyId => (
      recipe.bodies.find(body => body.bodyId === bodyId)?.layerId
    )).sort()
    if (cluster.graph.generationId !== cluster.eventId.replace(/:event$/, '')
      || JSON.stringify(cluster.graph.fragmentIds) !== JSON.stringify(fragmentLayerIds)) {
      throw new Error(`Rigid fracture cluster ownership is stale: ${cluster.eventId}`)
    }
  })
}

function assertBondBreakEvents(recipe: RigidBodyBakeRecipe): void {
  const realized = recipe.fractureBondBreakEvents ?? []
  if (realized.length > 100_000) throw new RangeError('Rigid fracture bond event budget exceeded')
  const clock = new SimulationClock(recipe)
  const bodyIds = new Set(recipe.bodies.map(body => body.bodyId))
  const seen = new Set<string>()
  let previousTick = 0
  realized.forEach(event => {
    const cluster = recipe.fractureClusters?.find(candidate => candidate.graph.graphId === event.graphId)
    const bond = cluster?.graph.bonds.find(candidate => candidate.bondId === event.bondId)
    const expectedBodyIds = bond ? [bond.fragmentAId, bond.fragmentBId].map(layerId => (
      recipe.bodies.find(body => body.layerId === layerId)?.bodyId
    )).sort() : []
    if (!bond || seen.has(event.bondId) || !Number.isSafeInteger(event.tick)
      || event.tick < previousTick || event.tick < 1 || event.tick > clock.totalTicks
      || Math.abs(clock.timeMsForTick(event.tick) - event.timeMs) > 1e-7
      || event.fragmentBodyIds.length !== 2 || event.fragmentBodyIds.some(id => !bodyIds.has(id))
      || JSON.stringify(event.fragmentBodyIds) !== JSON.stringify(expectedBodyIds)
      || !Number.isFinite(event.load) || event.load < 0
      || !Number.isFinite(event.accumulatedDamage) || event.accumulatedDamage < 0
      || !['impulse', 'damage', 'forced'].includes(event.reason)
      || !event.componentIds.length || event.componentIds.some(id => !id)) {
      throw new Error(`Rigid fracture bond event is invalid: ${event.bondId}`)
    }
    seen.add(event.bondId)
    previousTick = event.tick
  })
}

function assertTrigger(
  event: NonNullable<RigidBodyBakeRecipe['fractureEvents']>[number],
  bodyById: ReadonlyMap<string, RigidBodyBakeRecipe['bodies'][number]>,
  sourceBodyId: string,
  unresolvedImpact: boolean,
): void {
  if (!event.trigger || event.trigger.kind === 'time') {
    if (event.realization) throw new Error(`Timed fracture event ${event.id} has impact evidence`)
    return
  }
  const trigger = event.trigger
  if (!Number.isFinite(trigger.minimumRelativeNormalSpeedPxPerSecond)
    || trigger.minimumRelativeNormalSpeedPxPerSecond <= 0
    || !trigger.colliderBodyIds.length
    || new Set(trigger.colliderBodyIds).size !== trigger.colliderBodyIds.length
    || trigger.colliderBodyIds.some(bodyId => bodyId === sourceBodyId || bodyById.get(bodyId)?.motionType !== 'static')) {
    throw new Error(`Impact fracture event ${event.id} has an invalid trigger`)
  }
  if (unresolvedImpact) return
  const realization = event.realization
  if (!realization || realization.kind !== 'impact'
    || !trigger.colliderBodyIds.includes(realization.contactBodyId)
    || realization.relativeNormalSpeedPxPerSecond + 1e-7 < trigger.minimumRelativeNormalSpeedPxPerSecond
    || !finitePoint(realization.contactPointPx) || !finitePoint(realization.contactNormal)) {
    throw new Error(`Impact fracture event ${event.id} has invalid realization evidence`)
  }
}

function assertExplosion(event: NonNullable<RigidBodyBakeRecipe['fractureEvents']>[number]): void {
  const value = event.explosion
  if (!value) return
  if (!finitePoint(value.centerLocalOffsetPx) || !Number.isFinite(value.directionDeg)
    || ![value.radialVelocityPxPerSecond, value.directionalVelocityPxPerSecond, value.spinVelocityDegPerSecond]
      .every(item => Number.isFinite(item) && item >= 0)
    || !Number.isFinite(value.variation) || value.variation < 0 || value.variation > 1
    || !Number.isSafeInteger(value.seed) || value.seed < 0 || value.seed > 0xffffffff
    || value.radialVelocityPxPerSecond + value.directionalVelocityPxPerSecond + value.spinVelocityDegPerSecond <= 0) {
    throw new Error(`Fracture explosion ${event.id} is invalid`)
  }
}

function finitePoint(value: { readonly x: number; readonly y: number }): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y)
}
