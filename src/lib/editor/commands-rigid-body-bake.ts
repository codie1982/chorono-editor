import { RigidBodySceneCompiler } from '@/lib/physics/RigidBodySceneCompiler'
import { createRigidBakeRecord } from '@/lib/physics/RigidBakeOwnership'
import { clearRigidBakeOwnedContent, type RigidBakeConflictPolicy } from '@/lib/physics/RigidBakeSceneMutation'
import { assertRigidBakeTracks } from '@/lib/physics/RigidBakeTrackValidation'
import type { ChronoScene, Timeline, Track } from '@/lib/types'
import type { PhysicsSceneData, RigidBodyBakeRecipe } from '@/lib/types/physics'
import type { EditorCommand } from './commands-keyframe'

/** Compares the live source rectangles and settings to a prepared recipe. */
export function isRigidBodyBakeSourceCurrent(recipe: RigidBodyBakeRecipe, scene: ChronoScene): boolean {
  return new RigidBodySceneCompiler().isCurrent(recipe, scene)
}

/**
 * Publishes generated rigid pose tracks and their ownership record atomically.
 *
 * The command rejects source/target collisions before constructing a new scene,
 * preserves unrelated tracks and layer edits, and restores the exact previous
 * timeline plus physics envelope in one undo operation. Dense solver samples
 * and Matter objects never enter scene JSON or history.
 */
export function makeApplyRigidBodyBakeCmd(input: {
  readonly recipe: RigidBodyBakeRecipe
  readonly tracks: readonly Track[]
  readonly sampleCount: number
  readonly recordId?: string
}): EditorCommand {
  const recordId = input.recordId ?? `rigid-bake:${input.recipe.recipeHash}`
  let beforeTimeline: Timeline | undefined
  let beforePhysics: PhysicsSceneData | undefined
  let hadPhysics = false
  return {
    label: `Bake Rigid Bodies (${input.sampleCount} samples)`,
    execute(scene: ChronoScene): ChronoScene {
      if (input.recipe.fractureEvents?.length) {
        throw new Error('Fracture recipes require the atomic Voronoi fracture bake command')
      }
      if (!isRigidBodyBakeSourceCurrent(input.recipe, scene)) {
        throw new Error('Rigid body source changed. Prepare a new bake preview.')
      }
      if (!Number.isSafeInteger(input.sampleCount) || input.sampleCount < 2) throw new RangeError('Rigid bake sample count is invalid')
      assertRigidBakeTracks(input.recipe, input.tracks)
      const timeline = scene.timelines.find(candidate => candidate.id === input.recipe.timelineId)
      if (!timeline) throw new Error(`Rigid bake timeline does not exist: ${input.recipe.timelineId}`)
      const targets = input.tracks.map(track => track.target)
      const collision = timeline.tracks.find(track => targets.includes(track.target))
      if (collision) throw new Error(`Rigid bake target already exists: ${collision.target}`)
      if (scene.physics && scene.physics.schemaVersion !== 1) throw new Error('Physics scene schema is unsupported')
      if (scene.physics?.rigidBakes.some(record => record.id === recordId)) throw new Error(`Rigid bake record id already exists: ${recordId}`)
      beforeTimeline = timeline
      beforePhysics = scene.physics
      hadPhysics = Object.hasOwn(scene, 'physics')
      const layerIds = new Set(timeline.layerIds ?? [])
      const addedLayerIds: string[] = []
      input.recipe.bodies.filter(body => body.motionType === 'dynamic').forEach(body => {
        if (!layerIds.has(body.layerId)) addedLayerIds.push(body.layerId)
        layerIds.add(body.layerId)
      })
      const nextTimeline: Timeline = {
        ...timeline,
        tracks: [...timeline.tracks, ...input.tracks],
        layerIds: timeline.layerIds === undefined ? undefined : Array.from(layerIds),
      }
      const record = createRigidBakeRecord({
        id: recordId,
        recipe: input.recipe,
        sampleCount: input.sampleCount,
        tracks: input.tracks,
        timelineLayerIdsAdded: addedLayerIds,
      })
      return {
        ...scene,
        timelines: scene.timelines.map(candidate => candidate.id === timeline.id ? nextTimeline : candidate),
        physics: {
          ...scene.physics,
          schemaVersion: 1,
          rigidBakes: [...(scene.physics?.rigidBakes ?? []), record],
        },
      }
    },
    undo(scene: ChronoScene): ChronoScene {
      if (!beforeTimeline) return scene
      const restored: ChronoScene = {
        ...scene,
        timelines: scene.timelines.map(candidate => candidate.id === beforeTimeline!.id ? beforeTimeline! : candidate),
        physics: beforePhysics,
      }
      if (!hadPhysics) delete restored.physics
      return restored
    },
  }
}

/**
 * Replaces one existing ordinary rigid bake after ownership validation.
 *
 * The default refuses user-edited output. `discard-edits` is reserved for an
 * explicit product/MCP choice and still cannot cross ambiguous duplicate
 * targets. Clear plus apply is one command, so undo restores the entire prior
 * bake exactly rather than replaying a simulation.
 */
export function makeReplaceRigidBodyBakeCmd(input: {
  readonly existingRecordId: string
  readonly recipe: RigidBodyBakeRecipe
  readonly tracks: readonly Track[]
  readonly sampleCount: number
  readonly conflictPolicy?: RigidBakeConflictPolicy
}): EditorCommand {
  const apply = makeApplyRigidBodyBakeCmd({
    recipe: input.recipe,
    tracks: input.tracks,
    sampleCount: input.sampleCount,
    recordId: input.existingRecordId,
  })
  let before: ChronoScene | undefined
  return {
    label: `Re-bake Rigid Bodies (${input.sampleCount} samples)`,
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
