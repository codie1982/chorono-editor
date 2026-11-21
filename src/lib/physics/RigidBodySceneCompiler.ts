import { hashCanonicalRecords } from '@/lib/hash/CanonicalRecordHash'
import { SimulationClock } from '@/lib/simulation/SimulationClock'
import type { ChronoScene } from '@/lib/types'
import type {
  RigidBodyAuthoring,
  RigidBodyBakeRecipe,
  RigidBodySnapshot,
} from '@/lib/types/physics'
import {
  RigidBodyLayerCompiler,
  type PreparedConvexColliderGeometry,
} from './RigidBodyLayerCompiler'

export { isRigidRectangleLayerCandidate } from './RigidBodyLayerCompiler'

export interface RigidBodyBakeInput {
  readonly timelineId: string
  readonly startTimeMs: number
  readonly durationMs: number
  readonly stepHz?: number
  readonly sampleFps?: number
  readonly pixelsPerMeter?: number
  readonly gravityMetersPerSecondSquared?: { readonly x: number; readonly y: number }
  readonly bodies: readonly RigidBodyAuthoring[]
}

export type RigidBodySnapshotBakeInput = Omit<RigidBodyBakeInput, 'bodies'> & {
  readonly bodies: readonly RigidBodySnapshot[]
}

/**
 * Compiles supported rectangular scene layers into an immutable rigid-body recipe.
 *
 * This first vertical slice accepts root, non-instanced rectangle shapes and
 * image layers with positive uniform scale and no live transform writer. It snapshots visual
 * geometry in composition pixels and physics settings in SI-facing units; it
 * never retains the scene or creates a solver. Instances are stateless.
 */
export class RigidBodySceneCompiler {
  private readonly layerCompiler = new RigidBodyLayerCompiler()

  /**
   * Validates the source scene and returns a deterministic Matter.js recipe.
   * The requested body order is preserved and therefore defines dense clip
   * order. Unsupported hierarchy/drivers fail instead of being approximated.
   */
  compile(scene: ChronoScene, input: RigidBodyBakeInput): RigidBodyBakeRecipe {
    const ids = new Set<string>()
    const bodies = input.bodies.map(authoring => {
      if (!authoring.layerId || ids.has(authoring.layerId)) throw new Error(`Rigid body layer id is missing or duplicated: ${authoring.layerId}`)
      ids.add(authoring.layerId)
      return this.compileBodySnapshot(scene, authoring)
    })
    return this.compileSnapshots(scene, { ...input, bodies })
  }

  /**
   * Compile an individual visual layer through the shared rectangle/convex
   * adapter. Prepared convex geometry remains owned by its domain compiler.
   */
  compileBodySnapshot(
    scene: ChronoScene,
    authoring: RigidBodyAuthoring,
    convex?: PreparedConvexColliderGeometry,
  ): RigidBodySnapshot {
    return this.layerCompiler.compile(scene, authoring, convex)
  }

  /**
   * Assemble validated body snapshots into the canonical rigid recipe.
   *
   * This boundary is used by fracture after its source geometry adapter has
   * produced a convex snapshot. Callers must not pass unvalidated imported
   * polygons directly; layer adaptation remains the responsibility of
   * `compileBodySnapshot`.
   */
  compileSnapshots(scene: ChronoScene, input: RigidBodySnapshotBakeInput): RigidBodyBakeRecipe {
    if ((scene.mode ?? '2danimation') !== '2danimation') throw new Error('Rigid bake requires a 2D animation scene')
    const timeline = scene.timelines.find(candidate => candidate.id === input.timelineId)
    if (!timeline) throw new Error(`Rigid bake timeline does not exist: ${input.timelineId}`)
    const startTimeMs = finiteNonNegative(input.startTimeMs, 'Rigid bake start time')
    const durationMs = finitePositive(input.durationMs, 'Rigid bake duration')
    if (startTimeMs + durationMs > timeline.durationMs) throw new RangeError('Rigid bake range exceeds the target timeline')
    const stepHz = input.stepHz ?? 120, sampleFps = input.sampleFps ?? 30
    new SimulationClock({ durationMs, stepHz, sampleFps })
    const pixelsPerMeter = finitePositive(input.pixelsPerMeter ?? 100, 'Pixels per metre')
    const gravity = input.gravityMetersPerSecondSquared ?? { x: 0, y: 9.81 }
    assertFinite(gravity.x, 'Rigid gravity x'); assertFinite(gravity.y, 'Rigid gravity y')
    if (!input.bodies.length) throw new Error('Rigid bake requires at least one body')
    if (!input.bodies.some(body => body.motionType === 'dynamic')) throw new Error('Rigid bake requires at least one dynamic body')
    const ids = new Set<string>()
    input.bodies.forEach(body => {
      if (!body.layerId || ids.has(body.layerId)) throw new Error(`Rigid body layer id is missing or duplicated: ${body.layerId}`)
      ids.add(body.layerId)
    })
    const bodies = input.bodies
    const sourceRevision = hashRigidBodySource(input.timelineId, bodies)
    const recipeHash = hashCanonicalRecords('rigid-bake-recipe-v1', [
      `source:${sourceRevision}`, `timeline:${input.timelineId}`, `start:${startTimeMs}`,
      `duration:${durationMs}`, `step:${stepHz}`, `sample:${sampleFps}`, `ppm:${pixelsPerMeter}`,
      `gravity:${gravity.x},${gravity.y}`, 'solver:matter-js@0.20.0',
    ])
    return {
      version: 1, kind: 'rigidPose',
      source: { kind: 'rigidScene', ownerId: input.timelineId, revision: sourceRevision },
      recipeHash, timelineId: input.timelineId, startTimeMs, durationMs, stepHz, sampleFps,
      pixelsPerMeter, gravityMetersPerSecondSquared: { x: gravity.x, y: gravity.y },
      solverId: 'matter-js', solverVersion: '0.20.0', bodies,
    }
  }

  /** Recompiles a stored recipe's authored inputs and compares its provenance. */
  isCurrent(recipe: RigidBodyBakeRecipe, scene: ChronoScene): boolean {
    try {
      const current = this.compile(scene, {
        timelineId: recipe.timelineId, startTimeMs: recipe.startTimeMs, durationMs: recipe.durationMs,
        stepHz: recipe.stepHz, sampleFps: recipe.sampleFps, pixelsPerMeter: recipe.pixelsPerMeter,
        gravityMetersPerSecondSquared: recipe.gravityMetersPerSecondSquared,
        bodies: recipe.bodies.map(body => ({
          layerId: body.layerId, motionType: body.motionType, collider: body.collider,
          material: body.material, initialVelocityPxPerSecond: body.initialVelocityPxPerSecond,
          initialAngularVelocityDegPerSecond: body.initialAngularVelocityDegPerSecond,
        })),
      })
      return current.source.revision === recipe.source.revision && current.recipeHash === recipe.recipeHash
    } catch {
      return false
    }
  }

}

/** Recomputes the deterministic recipe hash and rejects altered stored fields. */
export function hashRigidBodyBakeRecipe(recipe: Omit<RigidBodyBakeRecipe, 'recipeHash'>): string {
  return hashCanonicalRecords('rigid-bake-recipe-v1', [
    `source:${recipe.source.revision}`, `timeline:${recipe.timelineId}`, `start:${recipe.startTimeMs}`,
    `duration:${recipe.durationMs}`, `step:${recipe.stepHz}`, `sample:${recipe.sampleFps}`,
    `ppm:${recipe.pixelsPerMeter}`,
    `gravity:${recipe.gravityMetersPerSecondSquared.x},${recipe.gravityMetersPerSecondSquared.y}`,
    `solver:${recipe.solverId}@${recipe.solverVersion}`,
    ...(recipe.fractureEvents ?? []).flatMap(event => [
      `fracture:${event.id}`, `fracture-time:${event.timeMs}`, `fracture-tick:${event.tick}`,
      `fracture-source:${event.sourceBodyId}`, `fracture-fragments:${event.fragmentBodyIds.join(',')}`,
      ...(event.trigger ? event.trigger.kind === 'time'
        ? ['fracture-trigger:time']
        : [
          `fracture-trigger:impact,${event.trigger.minimumRelativeNormalSpeedPxPerSecond}`,
          `fracture-trigger-colliders:${event.trigger.colliderBodyIds.join(',')}`,
        ] : []),
      ...(event.explosion ? [
        `fracture-explosion-center:${event.explosion.centerLocalOffsetPx.x},${event.explosion.centerLocalOffsetPx.y}`,
        `fracture-explosion-velocity:${event.explosion.radialVelocityPxPerSecond},${event.explosion.directionDeg},${event.explosion.directionalVelocityPxPerSecond}`,
        `fracture-explosion-spin:${event.explosion.spinVelocityDegPerSecond}`,
        `fracture-explosion-random:${event.explosion.variation},${event.explosion.seed}`,
      ] : []),
      ...(event.realization ? [
        `fracture-impact-body:${event.realization.contactBodyId}`,
        `fracture-impact-speed:${event.realization.relativeNormalSpeedPxPerSecond}`,
        `fracture-impact-point:${event.realization.contactPointPx.x},${event.realization.contactPointPx.y}`,
        `fracture-impact-normal:${event.realization.contactNormal.x},${event.realization.contactNormal.y}`,
      ] : []),
    ]),
    ...(recipe.fractureAppearance ? [
      `fracture-appearance:${recipe.fractureAppearance.schemaVersion},${recipe.fractureAppearance.kind},${recipe.fractureAppearance.sourceLayerId},${recipe.fractureAppearance.contentHash}`,
      ...(recipe.fractureAppearance.kind === 'image' ? [
        `fracture-image:${recipe.fractureAppearance.assetId},${recipe.fractureAppearance.assetWidth},${recipe.fractureAppearance.assetHeight},${recipe.fractureAppearance.objectFit}`,
      ] : []),
    ] : []),
  ])
}

/** Hashes every persisted source snapshot field that can affect rigid output. */
export function hashRigidBodySource(timelineId: string, bodies: readonly RigidBodySnapshot[]): string {
  return hashCanonicalRecords('rigid-scene-source-v1', [
    `timeline:${timelineId}`, ...bodies.flatMap(body => [
      `body:${body.bodyId}`, `layer:${body.layerId}`, `motion:${body.motionType}`, `collider:${body.collider}`,
      `center:${body.centerPx.x},${body.centerPx.y}`, `angle:${body.angleDeg}`,
      `size:${body.widthPx},${body.heightPx}`,
      ...(body.colliderVerticesPx ? [`vertices:${body.colliderVerticesPx.map(point => `${point.x},${point.y}`).join(';')}`] : []),
      ...(body.colliderPartsPx ? body.colliderPartsPx.map((part, index) => (
        `part-${index}:${part.map(point => `${point.x},${point.y}`).join(';')}`
      )) : []),
      ...(body.activation ? [`activation:${body.activation.kind},${body.activation.eventId},${body.activation.sourceBodyId},${body.activation.sourceLocalOffsetPx.x},${body.activation.sourceLocalOffsetPx.y}`] : []),
      `visual:${body.visual.widthPx},${body.visual.heightPx},${body.visual.anchorX},${body.visual.anchorY},${body.visual.uniformScale}`,
      ...(body.visual.centerOfMassLocalPx ? [`visual-com:${body.visual.centerOfMassLocalPx.x},${body.visual.centerOfMassLocalPx.y}`] : []),
      `material:${body.material.densityKgPerSquareMeter},${body.material.friction},${body.material.restitution},${body.material.airFriction}`,
      `velocity:${body.initialVelocityPxPerSecond.x},${body.initialVelocityPxPerSecond.y},${body.initialAngularVelocityDegPerSecond}`,
    ]),
  ])
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`)
}

function finitePositive(value: number, label: string): number {
  assertFinite(value, label)
  if (value <= 0) throw new RangeError(`${label} must be positive`)
  return value
}

function finiteNonNegative(value: number, label: string): number {
  assertFinite(value, label)
  if (value < 0) throw new RangeError(`${label} cannot be negative`)
  return value
}
