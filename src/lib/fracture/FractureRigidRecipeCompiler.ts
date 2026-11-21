import { SimulationClock } from '@/lib/simulation/SimulationClock'
import type { ChronoScene } from '@/lib/types'
import type { FractureGeneration, FragmentGeometry } from '@/lib/types/fracture'
import type {
  RigidBodyAuthoring,
  RigidBodyBakeRecipe,
  RigidBodySnapshot,
  RigidFractureExplosion,
} from '@/lib/types/physics'
import { hashRigidBodyBakeRecipe, hashRigidBodySource, RigidBodySceneCompiler } from '@/lib/physics/RigidBodySceneCompiler'
import { FractureAppearanceCompiler } from './FractureAppearanceCompiler'
import { FractureManifestValidator } from './FractureManifestValidator'
import { FractureSourceBoundaryCompiler } from './FractureSourceBoundaryCompiler'

export interface FractureRigidRecipeInput {
  readonly generation: FractureGeneration
  readonly timelineId: string
  readonly startTimeMs: number
  readonly durationMs: number
  /** Local simulation time, required by the default timed trigger. */
  readonly fractureTimeMs?: number
  readonly fractureTrigger?:
    | { readonly kind: 'time' }
    | {
      readonly kind: 'impact'
      readonly minimumRelativeNormalSpeedPxPerSecond: number
      /** Layer ids from the explicit static environment; omitted means all static bodies. */
      readonly colliderLayerIds?: readonly string[]
    }
  readonly explosion?: RigidFractureExplosion
  readonly sourceBody: RigidBodyAuthoring
  readonly staticBodies: readonly RigidBodyAuthoring[]
  readonly stepHz?: number
  readonly sampleFps?: number
  readonly pixelsPerMeter?: number
  readonly gravityMetersPerSecondSquared?: { readonly x: number; readonly y: number }
}

/**
 * Compiles one prepared Voronoi generation into the existing rigid recipe.
 *
 * The source boundary and static rectangle environment reuse
 * RigidBodySceneCompiler's shared layer adapter.
 * Fragment colliders are convex polygons centred on their uniform-density
 * centroid and stay inactive until the one topology event. Source-local
 * geometry is converted to composition pixels explicitly; Matter handles and
 * generated scene layers are not created here. Instances are stateless.
 */
export class FractureRigidRecipeCompiler {
  private readonly rigidCompiler = new RigidBodySceneCompiler()
  private readonly manifestValidator = new FractureManifestValidator()
  private readonly appearanceCompiler = new FractureAppearanceCompiler()
  private readonly sourceBoundaryCompiler = new FractureSourceBoundaryCompiler()

  /** Compiles an immutable one-generation recipe without mutating the scene. */
  compile(scene: ChronoScene, input: FractureRigidRecipeInput): RigidBodyBakeRecipe {
    this.manifestValidator.validate(input.generation)
    if (input.sourceBody.layerId !== input.generation.source.ownerId || input.sourceBody.motionType !== 'dynamic'
      || !['rectangle', 'convexPolygon'].includes(input.sourceBody.collider)) {
      throw new Error('Fracture source must be the generation owner and a dynamic supported boundary')
    }
    if (input.staticBodies.some(body => body.motionType !== 'static' || body.collider !== 'rectangle')) {
      throw new Error('First-slice fracture environment supports static rectangles only')
    }
    const sourceLayer = scene.layers.find(layer => layer.id === input.sourceBody.layerId)
    if (!sourceLayer) throw new Error('Fracture source layer is missing')
    const sourceBoundary = this.sourceBoundaryCompiler.compile(sourceLayer)
    if ((sourceBoundary.isOriginRectangle && input.sourceBody.collider !== 'rectangle')
      || (!sourceBoundary.isOriginRectangle && input.sourceBody.collider !== 'convexPolygon')) {
      throw new Error('Fracture source collider no longer matches its compiled boundary')
    }
    const fractureAppearance = this.appearanceCompiler.snapshot(scene, sourceLayer)
    assertGenerationMatchesBoundary(input.generation, sourceBoundary.polygon)

    const sourceSnapshot = this.rigidCompiler.compileBodySnapshot(
      scene,
      input.sourceBody,
      input.sourceBody.collider === 'convexPolygon' ? sourceBoundary : undefined,
    )
    const staticSnapshots = input.staticBodies.map(body => this.rigidCompiler.compileBodySnapshot(scene, body))
    const base = this.rigidCompiler.compileSnapshots(scene, {
      timelineId: input.timelineId,
      startTimeMs: input.startTimeMs,
      durationMs: input.durationMs,
      stepHz: input.stepHz,
      sampleFps: input.sampleFps,
      pixelsPerMeter: input.pixelsPerMeter,
      gravityMetersPerSecondSquared: input.gravityMetersPerSecondSquared,
      bodies: [sourceSnapshot, ...staticSnapshots],
    })
    const clock = new SimulationClock(base)
    const trigger = resolveTrigger(input, base)
    const eventTick = trigger.kind === 'time' ? resolveEventTick(input.fractureTimeMs, clock) : 0
    const eventTimeMs = trigger.kind === 'time' ? input.fractureTimeMs! : 0
    const source = base.bodies[0]
    const eventId = `${input.generation.generationId}:event`
    const fragments = input.generation.fragments.map(fragment => compileFragment(source, fragment, eventId))
    const bodies = [source, ...base.bodies.slice(1), ...fragments]
    const fractureEvents = [{
      id: eventId,
      timeMs: eventTimeMs,
      tick: eventTick,
      sourceBodyId: source.bodyId,
      fragmentBodyIds: fragments.map(fragment => fragment.bodyId),
      trigger,
      ...(input.explosion ? { explosion: cloneExplosion(input.explosion) } : {}),
    }]
    const sourceRevision = hashRigidBodySource(base.timelineId, bodies)
    const withoutHash: Omit<RigidBodyBakeRecipe, 'recipeHash'> = {
      ...base,
      source: { ...base.source, revision: sourceRevision },
      bodies,
      fractureEvents,
      fractureAppearance,
    }
    return Object.freeze({ ...withoutHash, recipeHash: hashRigidBodyBakeRecipe(withoutHash) })
  }

  /** Recompiles authored inputs and compares full recipe provenance. */
  isCurrent(recipe: RigidBodyBakeRecipe, generation: FractureGeneration, scene: ChronoScene): boolean {
    const event = recipe.fractureEvents?.[0]
    if (!event) return false
    const source = recipe.bodies.find(body => body.bodyId === event.sourceBodyId)
    if (!source) return false
    const staticBodies = recipe.bodies.filter(body => body.motionType === 'static')
    try {
      const current = this.compile(scene, {
        generation,
        timelineId: recipe.timelineId,
        startTimeMs: recipe.startTimeMs,
        durationMs: recipe.durationMs,
        fractureTimeMs: event.trigger?.kind === 'impact' ? undefined : event.timeMs,
        fractureTrigger: triggerInput(recipe, event),
        explosion: event.explosion,
        stepHz: recipe.stepHz,
        sampleFps: recipe.sampleFps,
        pixelsPerMeter: recipe.pixelsPerMeter,
        gravityMetersPerSecondSquared: recipe.gravityMetersPerSecondSquared,
        sourceBody: authored(source),
        staticBodies: staticBodies.map(authored),
      })
      const comparable = copyRealization(current, recipe)
      return comparable.recipeHash === recipe.recipeHash && comparable.source.revision === recipe.source.revision
    } catch {
      return false
    }
  }
}

function resolveEventTick(timeMs: number | undefined, clock: SimulationClock): number {
  if (!Number.isFinite(timeMs)) throw new RangeError('Fracture time is required for a timed trigger')
  const tick = timeMs! * clock.stepHz / 1000
  if (!Number.isSafeInteger(tick) || tick < 1 || tick >= clock.totalTicks) {
    throw new RangeError('Fracture time must align to an interior fixed-step tick')
  }
  return tick
}

function resolveTrigger(input: FractureRigidRecipeInput, base: RigidBodyBakeRecipe) {
  if (input.fractureTrigger?.kind !== 'impact') return Object.freeze({ kind: 'time' as const })
  const minimum = input.fractureTrigger.minimumRelativeNormalSpeedPxPerSecond
  if (!Number.isFinite(minimum) || minimum <= 0) throw new RangeError('Impact fracture speed must be positive and finite')
  const requested = input.fractureTrigger.colliderLayerIds
  const colliders = base.bodies.filter(body => body.motionType === 'static'
    && (!requested || requested.includes(body.layerId)))
  if (!colliders.length) throw new Error('Impact fracture requires at least one selected static collider')
  if (requested?.some(layerId => !colliders.some(body => body.layerId === layerId))) {
    throw new Error('Impact fracture collider selection is missing or is not static')
  }
  return Object.freeze({
    kind: 'impact' as const,
    minimumRelativeNormalSpeedPxPerSecond: minimum,
    colliderBodyIds: Object.freeze(colliders.map(body => body.bodyId)),
  })
}

function cloneExplosion(value: RigidFractureExplosion): RigidFractureExplosion {
  return Object.freeze({ ...value, centerLocalOffsetPx: Object.freeze({ ...value.centerLocalOffsetPx }) })
}

function triggerInput(recipe: RigidBodyBakeRecipe, event: NonNullable<RigidBodyBakeRecipe['fractureEvents']>[number]) {
  if (event.trigger?.kind !== 'impact') return { kind: 'time' as const }
  return {
    kind: 'impact' as const,
    minimumRelativeNormalSpeedPxPerSecond: event.trigger.minimumRelativeNormalSpeedPxPerSecond,
    colliderLayerIds: event.trigger.colliderBodyIds.map(bodyId => {
      const body = recipe.bodies.find(candidate => candidate.bodyId === bodyId)
      if (!body) throw new Error(`Impact fracture collider is missing: ${bodyId}`)
      return body.layerId
    }),
  }
}

function copyRealization(current: RigidBodyBakeRecipe, stored: RigidBodyBakeRecipe): RigidBodyBakeRecipe {
  const events = current.fractureEvents?.map((event, index) => {
    const source = stored.fractureEvents?.[index]
    return source?.trigger?.kind === 'impact'
      ? { ...event, timeMs: source.timeMs, tick: source.tick, realization: source.realization }
      : event
  })
  const withoutHash: Omit<RigidBodyBakeRecipe, 'recipeHash'> = { ...current, fractureEvents: events }
  return { ...withoutHash, recipeHash: hashRigidBodyBakeRecipe(withoutHash) }
}

function compileFragment(
  source: RigidBodySnapshot,
  fragment: FragmentGeometry,
  eventId: string,
): RigidBodySnapshot {
  const scale = source.visual.uniformScale
  const sourceCenterLocal = source.visual.centerOfMassLocalPx ?? {
    x: source.visual.widthPx / 2,
    y: source.visual.heightPx / 2,
  }
  const sourceLocalOffsetPx = {
    x: (fragment.centroidPx.x - sourceCenterLocal.x) * scale,
    y: (fragment.centroidPx.y - sourceCenterLocal.y) * scale,
  }
  const worldOffset = rotate(sourceLocalOffsetPx, source.angleDeg)
  return Object.freeze({
    layerId: fragment.id,
    bodyId: `rigid:${fragment.id}`,
    motionType: 'dynamic',
    collider: 'convexPolygon',
    colliderVerticesPx: fragment.polygon.map(point => Object.freeze({
      x: (point.x - fragment.centroidPx.x) * scale,
      y: (point.y - fragment.centroidPx.y) * scale,
    })),
    activation: {
      kind: 'fractureFragment' as const, eventId, sourceBodyId: source.bodyId, sourceLocalOffsetPx,
    },
    material: { ...source.material },
    initialVelocityPxPerSecond: { ...source.initialVelocityPxPerSecond },
    initialAngularVelocityDegPerSecond: source.initialAngularVelocityDegPerSecond,
    centerPx: { x: source.centerPx.x + worldOffset.x, y: source.centerPx.y + worldOffset.y },
    angleDeg: source.angleDeg,
    widthPx: (fragment.boundsPx.maxX - fragment.boundsPx.minX) * scale,
    heightPx: (fragment.boundsPx.maxY - fragment.boundsPx.minY) * scale,
    visual: {
      widthPx: source.visual.widthPx,
      heightPx: source.visual.heightPx,
      anchorX: fragment.centroidPx.x,
      anchorY: fragment.centroidPx.y,
      uniformScale: scale,
      centerOfMassLocalPx: { ...fragment.centroidPx },
    },
  })
}

function authored(body: RigidBodySnapshot): RigidBodyAuthoring {
  return {
    layerId: body.layerId,
    motionType: body.motionType,
    collider: body.collider,
    material: { ...body.material },
    initialVelocityPxPerSecond: { ...body.initialVelocityPxPerSecond },
    initialAngularVelocityDegPerSecond: body.initialAngularVelocityDegPerSecond,
  }
}

function assertGenerationMatchesBoundary(
  generation: FractureGeneration,
  expected: readonly { readonly x: number; readonly y: number }[],
): void {
  if (generation.source.polygon.length !== expected.length || generation.source.polygon.some((point, index) => (
    Math.abs(point.x - expected[index].x) > 1e-7 || Math.abs(point.y - expected[index].y) > 1e-7
  ))) throw new Error('Fracture generation no longer matches the source boundary')
}

function rotate(point: { x: number; y: number }, angleDeg: number): { x: number; y: number } {
  const radians = angleDeg * Math.PI / 180
  const cosine = Math.cos(radians), sine = Math.sin(radians)
  return { x: cosine * point.x - sine * point.y, y: sine * point.x + cosine * point.y }
}
