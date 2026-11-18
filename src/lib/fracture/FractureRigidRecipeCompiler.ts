import { SimulationClock } from '@/lib/simulation/SimulationClock'
import type { ChronoScene } from '@/lib/types'
import type { FractureGeneration, FragmentGeometry } from '@/lib/types/fracture'
import type { RigidBodyAuthoring, RigidBodyBakeRecipe, RigidBodySnapshot } from '@/lib/types/physics'
import { hashRigidBodyBakeRecipe, hashRigidBodySource, RigidBodySceneCompiler } from '@/lib/physics/RigidBodySceneCompiler'
import { FractureManifestValidator } from './FractureManifestValidator'

export interface FractureRigidRecipeInput {
  readonly generation: FractureGeneration
  readonly timelineId: string
  readonly startTimeMs: number
  readonly durationMs: number
  /** Local simulation time, quantized to one fixed solver tick. */
  readonly fractureTimeMs: number
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
 * The source rectangle and static environment reuse RigidBodySceneCompiler.
 * Fragment colliders are convex polygons centred on their uniform-density
 * centroid and stay inactive until the one topology event. Source-local
 * geometry is converted to composition pixels explicitly; Matter handles and
 * generated scene layers are not created here. Instances are stateless.
 */
export class FractureRigidRecipeCompiler {
  private readonly rigidCompiler = new RigidBodySceneCompiler()
  private readonly manifestValidator = new FractureManifestValidator()

  /** Compiles an immutable one-generation recipe without mutating the scene. */
  compile(scene: ChronoScene, input: FractureRigidRecipeInput): RigidBodyBakeRecipe {
    this.manifestValidator.validate(input.generation)
    if (input.sourceBody.layerId !== input.generation.source.ownerId || input.sourceBody.motionType !== 'dynamic'
      || input.sourceBody.collider !== 'rectangle') {
      throw new Error('Fracture source must be the generation owner and a dynamic rectangle')
    }
    if (input.staticBodies.some(body => body.motionType !== 'static' || body.collider !== 'rectangle')) {
      throw new Error('First-slice fracture environment supports static rectangles only')
    }
    const sourceLayer = scene.layers.find(layer => layer.id === input.sourceBody.layerId)
    if (!sourceLayer || sourceLayer.type !== 'shape' || (sourceLayer.shapeKind ?? sourceLayer.shape ?? 'rect') !== 'rect'
      || !sourceLayer.size) throw new Error('Fracture source layer must be a rectangle shape')
    if ((sourceLayer.style?.cornerRadius ?? 0) !== 0) throw new Error('First-slice fracture requires sharp rectangle corners')
    if (sourceLayer.style?.fill?.type !== 'solid') throw new Error('First-slice fracture requires a solid fill')
    if (sourceLayer.opacity !== 1) throw new Error('First-slice fracture requires source opacity 1')
    assertGenerationMatchesRectangle(input.generation, sourceLayer.size.width, sourceLayer.size.height)

    const base = this.rigidCompiler.compile(scene, {
      timelineId: input.timelineId,
      startTimeMs: input.startTimeMs,
      durationMs: input.durationMs,
      stepHz: input.stepHz,
      sampleFps: input.sampleFps,
      pixelsPerMeter: input.pixelsPerMeter,
      gravityMetersPerSecondSquared: input.gravityMetersPerSecondSquared,
      bodies: [input.sourceBody, ...input.staticBodies],
    })
    const clock = new SimulationClock(base)
    const eventTick = input.fractureTimeMs * clock.stepHz / 1000
    if (!Number.isSafeInteger(eventTick) || eventTick < 1 || eventTick >= clock.totalTicks) {
      throw new RangeError('Fracture time must align to an interior fixed-step tick')
    }
    const source = base.bodies[0]
    const eventId = `${input.generation.generationId}:event`
    const fragments = input.generation.fragments.map(fragment => compileFragment(source, fragment, eventId))
    const bodies = [source, ...base.bodies.slice(1), ...fragments]
    const fractureEvents = [{
      id: eventId,
      timeMs: input.fractureTimeMs,
      tick: eventTick,
      sourceBodyId: source.bodyId,
      fragmentBodyIds: fragments.map(fragment => fragment.bodyId),
    }]
    const sourceRevision = hashRigidBodySource(base.timelineId, bodies)
    const withoutHash: Omit<RigidBodyBakeRecipe, 'recipeHash'> = {
      ...base,
      source: { ...base.source, revision: sourceRevision },
      bodies,
      fractureEvents,
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
        fractureTimeMs: event.timeMs,
        stepHz: recipe.stepHz,
        sampleFps: recipe.sampleFps,
        pixelsPerMeter: recipe.pixelsPerMeter,
        gravityMetersPerSecondSquared: recipe.gravityMetersPerSecondSquared,
        sourceBody: authored(source),
        staticBodies: staticBodies.map(authored),
      })
      return current.recipeHash === recipe.recipeHash && current.source.revision === recipe.source.revision
    } catch {
      return false
    }
  }
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
    collider: 'rectangle',
    material: { ...body.material },
    initialVelocityPxPerSecond: { ...body.initialVelocityPxPerSecond },
    initialAngularVelocityDegPerSecond: body.initialAngularVelocityDegPerSecond,
  }
}

function assertGenerationMatchesRectangle(generation: FractureGeneration, width: number, height: number): void {
  const expected = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }]
  if (generation.source.polygon.length !== expected.length || generation.source.polygon.some((point, index) => (
    Math.abs(point.x - expected[index].x) > 1e-7 || Math.abs(point.y - expected[index].y) > 1e-7
  ))) throw new Error('Fracture generation no longer matches the source rectangle')
}

function rotate(point: { x: number; y: number }, angleDeg: number): { x: number; y: number } {
  const radians = angleDeg * Math.PI / 180
  const cosine = Math.cos(radians), sine = Math.sin(radians)
  return { x: cosine * point.x - sine * point.y, y: sine * point.x + cosine * point.y }
}
