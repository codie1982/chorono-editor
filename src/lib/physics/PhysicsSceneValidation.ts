import { SimulationClock } from '@/lib/simulation/SimulationClock'
import type { PhysicsSceneData, RigidBakeRecord, RigidBodyBakeRecipe } from '@/lib/types/physics'
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
    assertExtendedOwnership(record as unknown as RigidBakeRecord, recipe, value)
  })
}

function assertExtendedOwnership(
  record: RigidBakeRecord,
  recipe: RigidBodyBakeRecipe,
  physics: PhysicsSceneData,
): void {
  const fracture = !!recipe.fractureEvents?.length
  const generatedLayers = record.generatedLayers
  const generation = record.fractureGeneration
  if ((generatedLayers === undefined) !== (generation === undefined)) {
    throw new Error('Rigid bake generated ownership is incomplete')
  }
  if (!fracture && (generatedLayers !== undefined || generation !== undefined)) {
    throw new Error('Ordinary rigid bake cannot own fracture output')
  }
  if (generatedLayers !== undefined) {
    if (!Array.isArray(generatedLayers) || generatedLayers.length > 512) {
      throw new Error('Invalid rigid bake generated-layer ownership')
    }
    const expected = new Set(recipe.bodies.filter(body => body.activation).map(body => body.layerId))
    const ids = new Set<string>()
    generatedLayers.forEach(owned => {
      if (!isRecord(owned) || !boundedText(owned.layerId) || !HASH.test(String(owned.contentHash)) || ids.has(String(owned.layerId))) {
        throw new Error('Invalid rigid bake generated-layer ownership')
      }
      ids.add(String(owned.layerId))
    })
    if (ids.size !== expected.size || Array.from(ids).some(id => !expected.has(id))) {
      throw new Error('Rigid bake generated-layer ownership does not match its fragments')
    }
    if (!isRecord(generation) || !boundedText(generation.generationId) || !HASH.test(String(generation.topologyHash))) {
      throw new Error('Invalid rigid bake fracture-generation ownership')
    }
    const ownedGeneration = physics.fractureGenerations?.find(candidate => candidate.generationId === generation.generationId)
    if (!ownedGeneration || ownedGeneration.topologyHash !== generation.topologyHash) {
      throw new Error('Rigid bake fracture-generation ownership is stale')
    }
  }
  const added = record.timelineLayerIdsAdded
  if (added !== undefined) {
    if (!Array.isArray(added) || added.length > 513) throw new Error('Invalid rigid bake timeline membership ownership')
    const relevant = new Set(recipe.bodies.filter(body => body.motionType === 'dynamic').map(body => body.layerId))
    const ids = new Set<string>()
    added.forEach(id => {
      if (!boundedText(id) || ids.has(id) || !relevant.has(id)) throw new Error('Invalid rigid bake timeline membership ownership')
      ids.add(id)
    })
  }
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
      || !['dynamic', 'static'].includes(String(body.motionType))
      || !['rectangle', 'convexPolygon', 'compoundPolygon'].includes(String(body.collider))
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
      if (body.colliderPartsPx !== undefined) throw new Error('Convex rigid body cannot carry compound collider parts')
      assertFragmentActivation(body)
    } else if (body.collider === 'compoundPolygon') {
      if (!Array.isArray(body.colliderPartsPx) || !body.colliderPartsPx.length || body.colliderPartsPx.length > 256
        || body.colliderVerticesPx !== undefined) throw new Error('Invalid compound rigid collider')
      let vertexCount = 0
      body.colliderPartsPx.forEach(part => {
        if (!Array.isArray(part) || part.length < 3 || part.length > 128) throw new Error('Invalid compound rigid collider part')
        vertexCount += part.length
        part.forEach(vertex => {
          if (!isRecord(vertex)) throw new Error('Invalid compound rigid vertex')
          assertFiniteNumber(vertex.x); assertFiniteNumber(vertex.y)
        })
      })
      if (vertexCount > 4096) throw new Error('Compound rigid collider vertex budget exceeded')
      assertFragmentActivation(body)
    } else if (body.colliderVerticesPx !== undefined || body.colliderPartsPx !== undefined || body.activation !== undefined) {
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
  assertRigidFractureEvents(value as unknown as RigidBodyBakeRecipe, { requireRealized: true })
  assertFractureAppearance(value as unknown as RigidBodyBakeRecipe)
}

function assertFragmentActivation(body: Record<string, unknown>): void {
  if (!isRecord(body.activation) || body.activation.kind !== 'fractureFragment'
    || !boundedText(body.activation.eventId) || !boundedText(body.activation.sourceBodyId)
    || !isRecord(body.activation.sourceLocalOffsetPx)) throw new Error('Invalid rigid fragment activation')
  assertFiniteNumber(body.activation.sourceLocalOffsetPx.x)
  assertFiniteNumber(body.activation.sourceLocalOffsetPx.y)
}

/** Validate additive fracture appearance provenance without loading media. */
function assertFractureAppearance(recipe: RigidBodyBakeRecipe): void {
  const appearance = recipe.fractureAppearance
  if (!appearance) return
  const event = recipe.fractureEvents?.[0]
  if (!event || appearance.schemaVersion !== 1 || !['solid', 'image', 'mesh2d'].includes(appearance.kind)
    || !boundedText(appearance.sourceLayerId) || !HASH.test(appearance.contentHash)) {
    throw new Error('Invalid fracture appearance provenance')
  }
  const source = recipe.bodies.find(body => body.bodyId === event.sourceBodyId)
  if (!source || source.layerId !== appearance.sourceLayerId) {
    throw new Error('Fracture appearance source does not match its event body')
  }
  if (appearance.kind === 'image') {
    if (!boundedText(appearance.assetId) || !Number.isFinite(appearance.assetWidth)
      || !Number.isFinite(appearance.assetHeight) || appearance.assetWidth <= 0 || appearance.assetHeight <= 0
      || !['fill', 'contain', 'cover', 'none'].includes(appearance.objectFit)) {
      throw new Error('Invalid fracture image appearance provenance')
    }
  }
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
