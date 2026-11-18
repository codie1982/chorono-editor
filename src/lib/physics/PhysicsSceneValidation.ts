import { SimulationClock } from '@/lib/simulation/SimulationClock'
import type { PhysicsSceneData, RigidBodyBakeRecipe } from '@/lib/types/physics'
import { hashRigidBodyBakeRecipe, hashRigidBodySource } from './RigidBodySceneCompiler'
import { rigidBakeTrackTargets } from './RigidPoseTrackCompiler'
import { assertRigidFractureEvents } from './RigidFractureValidation'
import { FractureManifestValidator } from '@/lib/fracture/FractureManifestValidator'

const HASH = /^[0-9a-f]{16}$/

/**
 * Validates the bounded portable physics envelope without creating a solver.
 *
 * Dense samples, Matter handles and executable callbacks are intentionally not
 * supported. Unknown schema versions fail atomically at the document boundary
 * rather than being partially accepted into editor history.
 */
export function assertPhysicsSceneData(value: PhysicsSceneData | undefined): void {
  if (value === undefined) return
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.rigidBakes) || value.rigidBakes.length > 128
    || (value.fractureGenerations !== undefined && (!Array.isArray(value.fractureGenerations) || value.fractureGenerations.length > 128))) {
    throw new Error('Invalid physics scene envelope')
  }
  const fractureIds = new Set<string>()
  value.fractureGenerations?.forEach(generation => {
    if (fractureIds.has(generation.generationId)) throw new Error('Duplicate fracture generation id')
    new FractureManifestValidator().validate(generation)
    fractureIds.add(generation.generationId)
  })
  const recordIds = new Set<string>()
  value.rigidBakes.forEach(record => {
    if (!isRecord(record) || record.schemaVersion !== 1 || !boundedText(record.id) || recordIds.has(record.id)
      || typeof record.sampleCount !== 'number' || !Number.isSafeInteger(record.sampleCount) || record.sampleCount < 2 || !Array.isArray(record.tracks)) {
      throw new Error('Invalid rigid bake record')
    }
    recordIds.add(record.id)
    assertRecipe(record.recipe)
    const recipe = record.recipe as RigidBodyBakeRecipe
    const { recipeHash, ...withoutHash } = recipe
    if (hashRigidBodySource(recipe.timelineId, recipe.bodies) !== recipe.source.revision
      || hashRigidBodyBakeRecipe(withoutHash) !== recipeHash) throw new Error('Rigid bake provenance hash is stale')
    if (new SimulationClock(recipe).sampleCount !== record.sampleCount) throw new Error('Rigid bake sample count does not match its recipe')
    const expectedTrackCount = rigidBakeTrackTargets(recipe).length
    if (record.tracks.length !== expectedTrackCount) throw new Error('Invalid rigid bake track ownership')
    const expectedTargets = new Set(rigidBakeTrackTargets(recipe))
    const targets = new Set<string>()
    record.tracks.forEach(track => {
      if (!isRecord(track) || !boundedText(track.target) || !HASH.test(String(track.contentHash)) || targets.has(track.target)) {
        throw new Error('Invalid rigid bake track ownership')
      }
      targets.add(track.target)
    })
    if (targets.size !== expectedTargets.size || Array.from(targets).some(target => !expectedTargets.has(target))) {
      throw new Error('Rigid bake track ownership does not match its bodies')
    }
  })
}

function assertRecipe(value: unknown): void {
  if (!isRecord(value) || value.version !== 1 || value.kind !== 'rigidPose' || !isRecord(value.source)
    || value.source.kind !== 'rigidScene' || value.source.ownerId !== value.timelineId
    || typeof value.source.revision !== 'string' || !HASH.test(value.source.revision)
    || typeof value.recipeHash !== 'string' || !HASH.test(value.recipeHash) || !boundedText(value.timelineId)
    || value.solverId !== 'matter-js' || value.solverVersion !== '0.20.0' || !Array.isArray(value.bodies)
    || !value.bodies.length || value.bodies.length > 512 || !isRecord(value.gravityMetersPerSecondSquared)) {
    throw new Error('Invalid rigid body bake recipe')
  }
  for (const number of [value.startTimeMs, value.durationMs, value.stepHz, value.sampleFps, value.pixelsPerMeter,
    value.gravityMetersPerSecondSquared.x, value.gravityMetersPerSecondSquared.y]) assertFiniteNumber(number)
  if ((value.startTimeMs as number) < 0 || (value.durationMs as number) <= 0 || (value.pixelsPerMeter as number) <= 0) {
    throw new Error('Invalid rigid body bake range or scale')
  }
  const bodyIds = new Set<string>(), layerIds = new Set<string>()
  let dynamic = 0
  value.bodies.forEach(body => {
    if (!isRecord(body) || !boundedText(body.bodyId) || !boundedText(body.layerId) || bodyIds.has(body.bodyId) || layerIds.has(body.layerId)
      || !['dynamic', 'static'].includes(String(body.motionType)) || !['rectangle', 'convexPolygon'].includes(String(body.collider))
      || !isRecord(body.centerPx) || !isRecord(body.visual) || !isRecord(body.material) || !isRecord(body.initialVelocityPxPerSecond)) {
      throw new Error('Invalid rigid body snapshot')
    }
    bodyIds.add(String(body.bodyId)); layerIds.add(String(body.layerId)); if (body.motionType === 'dynamic') dynamic++
    for (const number of [body.centerPx.x, body.centerPx.y, body.angleDeg, body.widthPx, body.heightPx,
      body.visual.widthPx, body.visual.heightPx, body.visual.anchorX, body.visual.anchorY, body.visual.uniformScale,
      body.material.densityKgPerSquareMeter, body.material.friction, body.material.restitution, body.material.airFriction,
      body.initialVelocityPxPerSecond.x, body.initialVelocityPxPerSecond.y, body.initialAngularVelocityDegPerSecond]) assertFiniteNumber(number)
    if (body.visual.centerOfMassLocalPx !== undefined) {
      if (!isRecord(body.visual.centerOfMassLocalPx)) throw new Error('Invalid rigid centre of mass')
      assertFiniteNumber(body.visual.centerOfMassLocalPx.x); assertFiniteNumber(body.visual.centerOfMassLocalPx.y)
    }
    if (body.collider === 'convexPolygon') {
      if (!Array.isArray(body.colliderVerticesPx) || body.colliderVerticesPx.length < 3 || body.colliderVerticesPx.length > 128) {
        throw new Error('Invalid convex rigid collider')
      }
      body.colliderVerticesPx.forEach(vertex => {
        if (!isRecord(vertex)) throw new Error('Invalid convex rigid vertex')
        assertFiniteNumber(vertex.x); assertFiniteNumber(vertex.y)
      })
      if (!isRecord(body.activation) || body.activation.kind !== 'fractureFragment'
        || !boundedText(body.activation.eventId) || !boundedText(body.activation.sourceBodyId)
        || !isRecord(body.activation.sourceLocalOffsetPx)) throw new Error('Invalid rigid fragment activation')
      assertFiniteNumber(body.activation.sourceLocalOffsetPx.x); assertFiniteNumber(body.activation.sourceLocalOffsetPx.y)
    } else if (body.colliderVerticesPx !== undefined || body.activation !== undefined) {
      throw new Error('Rectangle rigid body cannot carry fragment collider data')
    }
    if ((body.widthPx as number) <= 0 || (body.heightPx as number) <= 0
      || (body.visual.widthPx as number) <= 0 || (body.visual.heightPx as number) <= 0
      || (body.visual.uniformScale as number) <= 0 || (body.material.densityKgPerSquareMeter as number) <= 0) {
      throw new Error('Rigid body dimensions, scale and density must be positive')
    }
    if ((body.material.friction as number) < 0 || (body.material.friction as number) > 1
      || (body.material.restitution as number) < 0 || (body.material.restitution as number) > 1
      || (body.material.airFriction as number) < 0 || (body.material.airFriction as number) >= 1) {
      throw new Error('Rigid body material coefficients are outside supported bounds')
    }
  })
  if (!dynamic) throw new Error('Rigid bake recipe requires a dynamic body')
  new SimulationClock(value as unknown as RigidBodyBakeRecipe)
  assertRigidFractureEvents(value as unknown as RigidBodyBakeRecipe)
}

function assertFiniteNumber(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Rigid bake numeric fields must be finite')
}

function boundedText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
