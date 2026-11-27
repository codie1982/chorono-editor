import { FractureLayerFactory } from '@/lib/fracture/FractureLayerFactory'
import { FractureManifestValidator } from '@/lib/fracture/FractureManifestValidator'
import { FractureRegionLayerFactory } from '@/lib/fracture/FractureRegionLayerFactory'
import { FractureRegionManifestValidator } from '@/lib/fracture/FractureRegionManifestValidator'
import { FractureRigidRecipeCompiler } from '@/lib/fracture/FractureRigidRecipeCompiler'
import { FractureGenerationHierarchyCompiler } from '@/lib/fracture/FractureGenerationHierarchyCompiler'
import { FractureRecursiveRecipeCompiler } from '@/lib/fracture/FractureRecursiveRecipeCompiler'
import { createRigidBakeRecord } from '@/lib/physics/RigidBakeOwnership'
import { clearRigidBakeOwnedContent, type RigidBakeConflictPolicy } from '@/lib/physics/RigidBakeSceneMutation'
import { assertRigidBakeTracks } from '@/lib/physics/RigidBakeTrackValidation'
import { rigidBakeTrackTargets } from '@/lib/physics/RigidPoseTrackCompiler'
import { assertRigidFractureEvents } from '@/lib/physics/RigidFractureValidation'
import type { ChronoScene, Layer, Timeline, Track } from '@/lib/types'
import type { AnyFractureGeneration, FractureGeneration } from '@/lib/types/fracture'
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
  readonly generation: AnyFractureGeneration
  readonly childGenerations?: readonly FractureGeneration[]
  readonly recipe: RigidBodyBakeRecipe
  readonly tracks: readonly Track[]
  readonly sampleCount: number
  readonly recordId?: string
}): EditorCommand {
  const recordId = input.recordId ?? `fracture-bake:${input.recipe.recipeHash}`
  const generations: readonly AnyFractureGeneration[] = [input.generation, ...(input.childGenerations ?? [])]
  let beforeLayers: readonly Layer[] | undefined
  let beforeTimeline: Timeline | undefined
  let beforePhysics: PhysicsSceneData | undefined
  let hadPhysics = false
  return {
    label: `Bake Voronoi Fracture (${generations.reduce((sum, item) => sum + item.fragments.length, 0)} fragments)`,
    execute(scene: ChronoScene): ChronoScene {
      generations.forEach(generation => {
        if (generation.schemaVersion === 1) new FractureManifestValidator().validate(generation)
        else new FractureRegionManifestValidator().validate(generation)
      })
      if (generations.length > 1) {
        const hierarchy = new FractureGenerationHierarchyCompiler().compile(
          generations,
          input.recipe.fractureHierarchy?.limits,
        )
        if (hierarchy.hierarchyHash !== input.recipe.fractureHierarchy?.hierarchyHash) {
          throw new Error('Recursive fracture hierarchy does not match the recipe')
        }
      }
      assertRigidFractureEvents(input.recipe, { requireRealized: true })
      if (generations.length === 1 && !new FractureRigidRecipeCompiler().isCurrent(input.recipe, input.generation, scene)) {
        throw new Error('Fracture source changed. Prepare a new bake preview.')
      }
      if (generations.length > 1 && !new FractureRecursiveRecipeCompiler().isCurrent(input.recipe, generations, scene)) {
        throw new Error('Recursive fracture source or lineage changed. Prepare a new bake preview.')
      }
      if (!Number.isSafeInteger(input.sampleCount) || input.sampleCount < 2) throw new RangeError('Fracture bake sample count is invalid')
      const expectedTargets = new Set(rigidBakeTrackTargets(input.recipe))
      const targets = input.tracks.map(track => track.target)
      if (targets.length !== expectedTargets.size || new Set(targets).size !== targets.length
        || targets.some(target => !expectedTargets.delete(target)) || expectedTargets.size) {
        throw new Error('Fracture bake tracks do not match the recipe')
      }
      assertRigidBakeTracks(input.recipe, input.tracks)
      const timeline = scene.timelines.find(candidate => candidate.id === input.recipe.timelineId)
      if (!timeline) throw new Error(`Fracture bake timeline does not exist: ${input.recipe.timelineId}`)
      const collision = timeline.tracks.find(track => targets.includes(track.target))
      if (collision) throw new Error(`Fracture bake target already exists: ${collision.target}`)
      const fragmentIds = new Set(generations.flatMap(generation => generation.fragments.map(fragment => fragment.id)))
      const layerCollision = scene.layers.find(layer => fragmentIds.has(layer.id))
      if (layerCollision) throw new Error(`Fracture fragment layer already exists: ${layerCollision.id}`)
      if (scene.physics?.rigidBakes.some(record => record.id === recordId)) throw new Error(`Fracture bake record already exists: ${recordId}`)
      const generationCollision = scene.physics?.fractureGenerations?.find(existing => (
        generations.some(generation => generation.generationId === existing.generationId)
      ))
      if (generationCollision) {
        throw new Error(`Fracture generation already exists: ${generationCollision.generationId}`)
      }
      let layerScene: Pick<ChronoScene, 'layers' | 'assets'> = scene
      const fragmentLayers: Layer[] = []
      generations.forEach(generation => {
        const created = generation.schemaVersion === 1
          ? new FractureLayerFactory().create(layerScene, generation, input.recipe)
          : new FractureRegionLayerFactory().create(layerScene, generation, input.recipe)
        fragmentLayers.push(...created)
        layerScene = { ...layerScene, layers: [...layerScene.layers, ...created] }
      })
      beforeLayers = scene.layers
      beforeTimeline = timeline
      beforePhysics = scene.physics
      hadPhysics = Object.hasOwn(scene, 'physics')
      const hasExplicitMembership = timeline.layerIds !== undefined
      const layerIds = new Set(timeline.layerIds ?? [])
      const addedLayerIds: string[] = []
      if (hasExplicitMembership) {
        for (const layerId of [input.generation.source.ownerId, ...fragmentLayers.map(layer => layer.id)]) {
          if (!layerIds.has(layerId)) addedLayerIds.push(layerId)
          layerIds.add(layerId)
        }
      }
      const nextTimeline: Timeline = {
        ...timeline,
        tracks: [...timeline.tracks, ...input.tracks],
        ...(hasExplicitMembership ? { layerIds: Array.from(layerIds) } : {}),
      }
      const record = createRigidBakeRecord({
        id: recordId,
        recipe: input.recipe,
        sampleCount: input.sampleCount,
        tracks: input.tracks,
        generatedLayers: fragmentLayers,
        generations,
        timelineLayerIdsAdded: hasExplicitMembership ? addedLayerIds : undefined,
      })
      return {
        ...scene,
        layers: [...scene.layers, ...fragmentLayers],
        timelines: scene.timelines.map(candidate => candidate.id === timeline.id ? nextTimeline : candidate),
        physics: {
          ...scene.physics,
          schemaVersion: 1,
          rigidBakes: [...(scene.physics?.rigidBakes ?? []), record],
          fractureGenerations: [...(scene.physics?.fractureGenerations ?? []), ...generations],
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

/**
 * Replaces one existing Voronoi bake and its owned topology atomically.
 *
 * Old tracks, generated fragment layers and the topology manifest are removed
 * only through verified ownership. The replacement may use a different seed,
 * generation id or fragment count; unrelated scene content is never selected
 * by prefix. One undo restores the exact previous bake.
 */
export function makeReplaceVoronoiFractureBakeCmd(input: {
  readonly existingRecordId: string
  readonly generation: AnyFractureGeneration
  readonly childGenerations?: readonly FractureGeneration[]
  readonly recipe: RigidBodyBakeRecipe
  readonly tracks: readonly Track[]
  readonly sampleCount: number
  readonly conflictPolicy?: RigidBakeConflictPolicy
}): EditorCommand {
  const apply = makeApplyVoronoiFractureBakeCmd({
    generation: input.generation,
    childGenerations: input.childGenerations,
    recipe: input.recipe,
    tracks: input.tracks,
    sampleCount: input.sampleCount,
    recordId: input.existingRecordId,
  })
  let before: ChronoScene | undefined
  return {
    label: `Re-bake Voronoi Fracture (${input.generation.fragments.length
      + (input.childGenerations ?? []).reduce((sum, generation) => sum + generation.fragments.length, 0)} fragments)`,
    execute(scene: ChronoScene): ChronoScene {
      before = scene
      const cleared = clearRigidBakeOwnedContent(scene, input.existingRecordId, input.conflictPolicy)
      return apply.execute(cleared)
    },
    undo(scene: ChronoScene): ChronoScene {
      return before ?? scene
    },
  }
}
