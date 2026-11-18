import { FractureLayerFactory } from '@/lib/fracture/FractureLayerFactory'
import { FractureManifestValidator } from '@/lib/fracture/FractureManifestValidator'
import { FractureRigidRecipeCompiler } from '@/lib/fracture/FractureRigidRecipeCompiler'
import { hashRigidBakeTrack, rigidBakeTrackTargets } from '@/lib/physics/RigidPoseTrackCompiler'
import type { ChronoScene, Layer, Timeline, Track } from '@/lib/types'
import type { FractureGeneration } from '@/lib/types/fracture'
import type { PhysicsSceneData, RigidBodyBakeRecipe } from '@/lib/types/physics'
import type { EditorCommand } from './commands-keyframe'

/**
 * Atomically publishes one generated fragment forest plus its editable bake.
 *
 * Preparation remains side-effect free. Execute rechecks source provenance,
 * target/layer collisions and every generated track before adding path layers,
 * timeline tracks, ownership and the realized topology in one scene value.
 * Undo restores the exact prior layers, timeline and optional physics envelope.
 */
export function makeApplyVoronoiFractureBakeCmd(input: {
  readonly generation: FractureGeneration
  readonly recipe: RigidBodyBakeRecipe
  readonly tracks: readonly Track[]
  readonly sampleCount: number
  readonly recordId?: string
}): EditorCommand {
  const recordId = input.recordId ?? `fracture-bake:${input.recipe.recipeHash}`
  let beforeLayers: readonly Layer[] | undefined
  let beforeTimeline: Timeline | undefined
  let beforePhysics: PhysicsSceneData | undefined
  let hadPhysics = false
  return {
    label: `Bake Voronoi Fracture (${input.generation.fragments.length} fragments)`,
    execute(scene: ChronoScene): ChronoScene {
      new FractureManifestValidator().validate(input.generation)
      if (!new FractureRigidRecipeCompiler().isCurrent(input.recipe, input.generation, scene)) {
        throw new Error('Fracture source changed. Prepare a new bake preview.')
      }
      if (!Number.isSafeInteger(input.sampleCount) || input.sampleCount < 2) throw new RangeError('Fracture bake sample count is invalid')
      const expectedTargets = new Set(rigidBakeTrackTargets(input.recipe))
      const targets = input.tracks.map(track => track.target)
      if (targets.length !== expectedTargets.size || new Set(targets).size !== targets.length
        || targets.some(target => !expectedTargets.delete(target)) || expectedTargets.size) {
        throw new Error('Fracture bake tracks do not match the recipe')
      }
      input.tracks.forEach(track => validateTrack(track, input.sampleCount))
      const timeline = scene.timelines.find(candidate => candidate.id === input.recipe.timelineId)
      if (!timeline) throw new Error(`Fracture bake timeline does not exist: ${input.recipe.timelineId}`)
      const collision = timeline.tracks.find(track => targets.includes(track.target))
      if (collision) throw new Error(`Fracture bake target already exists: ${collision.target}`)
      const fragmentIds = new Set(input.generation.fragments.map(fragment => fragment.id))
      const layerCollision = scene.layers.find(layer => fragmentIds.has(layer.id))
      if (layerCollision) throw new Error(`Fracture fragment layer already exists: ${layerCollision.id}`)
      if (scene.physics?.rigidBakes.some(record => record.id === recordId)) throw new Error(`Fracture bake record already exists: ${recordId}`)
      if (scene.physics?.fractureGenerations?.some(generation => generation.generationId === input.generation.generationId)) {
        throw new Error(`Fracture generation already exists: ${input.generation.generationId}`)
      }
      const fragmentLayers = new FractureLayerFactory().create(scene.layers, input.generation, input.recipe)
      beforeLayers = scene.layers
      beforeTimeline = timeline
      beforePhysics = scene.physics
      hadPhysics = Object.hasOwn(scene, 'physics')
      const layerIds = new Set(timeline.layerIds ?? [])
      layerIds.add(input.generation.source.ownerId)
      fragmentLayers.forEach(layer => layerIds.add(layer.id))
      const nextTimeline: Timeline = {
        ...timeline,
        tracks: [...timeline.tracks, ...input.tracks],
        layerIds: timeline.layerIds === undefined ? undefined : Array.from(layerIds),
      }
      const record = {
        schemaVersion: 1 as const,
        id: recordId,
        recipe: input.recipe,
        sampleCount: input.sampleCount,
        tracks: input.tracks.map(track => ({ target: track.target, contentHash: hashRigidBakeTrack(track) })),
      }
      return {
        ...scene,
        layers: [...scene.layers, ...fragmentLayers],
        timelines: scene.timelines.map(candidate => candidate.id === timeline.id ? nextTimeline : candidate),
        physics: {
          schemaVersion: 1,
          rigidBakes: [...(scene.physics?.rigidBakes ?? []), record],
          fractureGenerations: [...(scene.physics?.fractureGenerations ?? []), input.generation],
        },
      }
    },
    undo(scene: ChronoScene): ChronoScene {
      if (!beforeLayers || !beforeTimeline) return scene
      const restored: ChronoScene = {
        ...scene,
        layers: [...beforeLayers],
        timelines: scene.timelines.map(candidate => candidate.id === beforeTimeline!.id ? beforeTimeline! : candidate),
        physics: beforePhysics,
      }
      if (!hadPhysics) delete restored.physics
      return restored
    },
  }
}

function validateTrack(track: Track, sampleCount: number): void {
  const visibility = track.target.endsWith('.opacity')
  if (track.controller !== undefined || track.keyframes.length !== (visibility ? 2 : sampleCount)) {
    throw new Error(`Fracture bake track has an invalid sample count: ${track.target}`)
  }
  track.keyframes.forEach((key, index) => {
    if (typeof key.value !== 'number' || !Number.isFinite(key.value) || !Number.isFinite(key.timeMs)
      || (index > 0 && key.timeMs <= track.keyframes[index - 1].timeMs)) {
      throw new Error(`Fracture bake track contains invalid samples: ${track.target}`)
    }
  })
  if (visibility && track.keyframes.some(key => key.easing?.type !== 'hold' || (key.value !== 0 && key.value !== 1))) {
    throw new Error(`Fracture visibility track is not an atomic hold switch: ${track.target}`)
  }
}
