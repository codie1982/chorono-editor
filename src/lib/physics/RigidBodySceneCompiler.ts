import { hashCanonicalRecords } from '@/lib/hash/CanonicalRecordHash'
import { SimulationClock } from '@/lib/simulation/SimulationClock'
import type { ChronoScene, Layer } from '@/lib/types'
import type {
  RigidBodyAuthoring,
  RigidBodyBakeRecipe,
  RigidBodyMaterial,
  RigidBodySnapshot,
} from '@/lib/types/physics'
import { rigidCenterFromVisual } from './RigidVisualTransform'

const TRANSFORM_PATHS = new Set([
  'transform.x', 'transform.y', 'transform.scaleX', 'transform.scaleY',
  'transform.rotationDeg', 'transform.anchorX', 'transform.anchorY',
])

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

/**
 * Compiles supported rectangular scene layers into an immutable rigid-body recipe.
 *
 * This first vertical slice accepts root, non-instanced rectangle shapes and
 * image layers with positive uniform scale and no live transform writer. It snapshots visual
 * geometry in composition pixels and physics settings in SI-facing units; it
 * never retains the scene or creates a solver. Instances are stateless.
 */
export class RigidBodySceneCompiler {
  /**
   * Validates the source scene and returns a deterministic Matter.js recipe.
   * The requested body order is preserved and therefore defines dense clip
   * order. Unsupported hierarchy/drivers fail instead of being approximated.
   */
  compile(scene: ChronoScene, input: RigidBodyBakeInput): RigidBodyBakeRecipe {
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
    const bodies = input.bodies.map(authoring => {
      if (!authoring.layerId || ids.has(authoring.layerId)) throw new Error(`Rigid body layer id is missing or duplicated: ${authoring.layerId}`)
      ids.add(authoring.layerId)
      const layer = scene.layers.find(candidate => candidate.id === authoring.layerId)
      if (!layer) throw new Error(`Rigid body layer does not exist: ${authoring.layerId}`)
      return this.compileBody(scene, layer, authoring)
    })
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

  private compileBody(scene: ChronoScene, layer: Layer, authoring: RigidBodyAuthoring): RigidBodySnapshot {
    if (authoring.collider !== 'rectangle' || !isRectangleVisualLayer(layer)) {
      throw new Error(`Rigid body ${layer.id} must be a rectangle shape or image layer`)
    }
    if (layer.parentId || layer.instanceOf) throw new Error(`Rigid body ${layer.id} cannot use hierarchy or live instances yet`)
    if (layer.motionPath || layer.followPath) throw new Error(`Rigid body ${layer.id} cannot use a motion/follow path`)
    const size = layer.size
    if (!size || !Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) {
      throw new RangeError(`Rigid body ${layer.id} requires positive finite rectangle dimensions`)
    }
    const transform = layer.transform
    Object.entries(transform).forEach(([field, value]) => assertFinite(value, `Rigid body ${layer.id} transform.${field}`))
    if (transform.scaleX <= 0 || transform.scaleY <= 0 || Math.abs(transform.scaleX - transform.scaleY) > 1e-9) {
      throw new Error(`Rigid body ${layer.id} requires positive uniform scale`)
    }
    this.assertNoTransformWriter(scene, layer)
    assertMaterial(authoring.material, layer.id)
    assertFinite(authoring.initialVelocityPxPerSecond.x, `Rigid body ${layer.id} velocity x`)
    assertFinite(authoring.initialVelocityPxPerSecond.y, `Rigid body ${layer.id} velocity y`)
    assertFinite(authoring.initialAngularVelocityDegPerSecond, `Rigid body ${layer.id} angular velocity`)
    const center = rigidCenterFromVisual({
      x: transform.x, y: transform.y, angleDeg: transform.rotationDeg,
      widthPx: size.width, heightPx: size.height, anchorX: transform.anchorX, anchorY: transform.anchorY,
      uniformScale: transform.scaleX,
    })
    return {
      ...authoring, material: { ...authoring.material },
      initialVelocityPxPerSecond: { ...authoring.initialVelocityPxPerSecond },
      bodyId: `rigid:${layer.id}`, centerPx: center, angleDeg: transform.rotationDeg,
      widthPx: size.width * transform.scaleX, heightPx: size.height * transform.scaleX,
      visual: {
        widthPx: size.width, heightPx: size.height, anchorX: transform.anchorX,
        anchorY: transform.anchorY, uniformScale: transform.scaleX,
      },
    }
  }

  private assertNoTransformWriter(scene: ChronoScene, layer: Layer): void {
    const prefix = `layers.${layer.id}.`
    const track = scene.timelines.flatMap(timeline => timeline.tracks).find(candidate => (
      candidate.target.startsWith(prefix)
      && TRANSFORM_PATHS.has(candidate.target.slice(prefix.length))
      && (candidate.keyframes.length > 0 || candidate.controller !== undefined)
    ))
    if (track) throw new Error(`Rigid body ${layer.id} transform is already animated: ${track.target}`)
    if (Object.keys(layer.propertyExpressions?.fields ?? {}).some(path => TRANSFORM_PATHS.has(path))) {
      throw new Error(`Rigid body ${layer.id} transform has a live expression`)
    }
    if (Object.keys(layer.paramBindings ?? {}).some(path => TRANSFORM_PATHS.has(path))) {
      throw new Error(`Rigid body ${layer.id} transform has a parameter binding`)
    }
    if (scene.bindings.some(binding => binding.target.type === 'layerProperty' && binding.target.layerId === layer.id
      && !!binding.target.property && TRANSFORM_PATHS.has(binding.target.property))) {
      throw new Error(`Rigid body ${layer.id} transform has a scene binding`)
    }
    if (scene.parameterWires?.some(wire => wire.enabled && wire.target.layerId === layer.id
      && TRANSFORM_PATHS.has(wire.target.propertyPath))) {
      throw new Error(`Rigid body ${layer.id} transform has an enabled parameter wire`)
    }
  }
}

/**
 * Reports whether a layer can be offered by rectangular rigid-body pickers.
 *
 * This inexpensive capability check covers static layer geometry, hierarchy
 * and uniform scale. The compiler still validates timeline/expression writers,
 * numeric material values and bake range when Preview starts.
 */
export function isRigidRectangleLayerCandidate(layer: Layer): boolean {
  return isRectangleVisualLayer(layer) && !!layer.size
    && Number.isFinite(layer.size.width) && layer.size.width > 0
    && Number.isFinite(layer.size.height) && layer.size.height > 0
    && !layer.parentId && !layer.instanceOf
    && Number.isFinite(layer.transform.scaleX) && layer.transform.scaleX > 0
    && Number.isFinite(layer.transform.scaleY)
    && Math.abs(layer.transform.scaleX - layer.transform.scaleY) <= 1e-9
}

function isRectangleVisualLayer(layer: Layer): boolean {
  return (layer.type === 'shape' && (layer.shapeKind ?? layer.shape ?? 'rect') === 'rect')
    || (layer.type === 'image' && !!layer.image)
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
      ...(body.activation ? [`activation:${body.activation.kind},${body.activation.eventId},${body.activation.sourceBodyId},${body.activation.sourceLocalOffsetPx.x},${body.activation.sourceLocalOffsetPx.y}`] : []),
      `visual:${body.visual.widthPx},${body.visual.heightPx},${body.visual.anchorX},${body.visual.anchorY},${body.visual.uniformScale}`,
      ...(body.visual.centerOfMassLocalPx ? [`visual-com:${body.visual.centerOfMassLocalPx.x},${body.visual.centerOfMassLocalPx.y}`] : []),
      `material:${body.material.densityKgPerSquareMeter},${body.material.friction},${body.material.restitution},${body.material.airFriction}`,
      `velocity:${body.initialVelocityPxPerSecond.x},${body.initialVelocityPxPerSecond.y},${body.initialAngularVelocityDegPerSecond}`,
    ]),
  ])
}

function assertMaterial(material: RigidBodyMaterial, layerId: string): void {
  if (!material || !Number.isFinite(material.densityKgPerSquareMeter) || material.densityKgPerSquareMeter <= 0) {
    throw new RangeError(`Rigid body ${layerId} density must be positive and finite`)
  }
  for (const [field, value] of [['friction', material.friction], ['restitution', material.restitution]] as const) {
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError(`Rigid body ${layerId} ${field} must be between 0 and 1`)
  }
  if (!Number.isFinite(material.airFriction) || material.airFriction < 0 || material.airFriction >= 1) {
    throw new RangeError(`Rigid body ${layerId} air friction must be in [0, 1)`)
  }
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
