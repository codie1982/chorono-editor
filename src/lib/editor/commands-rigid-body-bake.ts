import { RigidBodySceneCompiler } from '@/lib/physics/RigidBodySceneCompiler'
import { hashRigidBakeTrack } from '@/lib/physics/RigidPoseTrackCompiler'
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
      if (!isRigidBodyBakeSourceCurrent(input.recipe, scene)) {
        throw new Error('Rigid body source changed. Prepare a new bake preview.')
      }
      if (!Number.isSafeInteger(input.sampleCount) || input.sampleCount < 2) throw new RangeError('Rigid bake sample count is invalid')
      if (input.tracks.some(track => track.keyframes.length !== input.sampleCount
        || track.controller !== undefined
        || track.keyframes.some((key, index) => typeof key.value !== 'number' || !Number.isFinite(key.value)
          || !Number.isFinite(key.timeMs) || (index > 0 && key.timeMs <= track.keyframes[index - 1].timeMs)))) {
        throw new Error('Rigid bake tracks contain invalid or incomplete samples')
      }
      const timeline = scene.timelines.find(candidate => candidate.id === input.recipe.timelineId)
      if (!timeline) throw new Error(`Rigid bake timeline does not exist: ${input.recipe.timelineId}`)
      const targets = input.tracks.map(track => track.target)
      if (!targets.length || new Set(targets).size !== targets.length) throw new Error('Rigid bake tracks have missing or duplicate targets')
      const expectedTargets = new Set(input.recipe.bodies.filter(body => body.motionType === 'dynamic').flatMap(body => [
        `layers.${body.layerId}.transform.x`, `layers.${body.layerId}.transform.y`, `layers.${body.layerId}.transform.rotationDeg`,
      ]))
      if (targets.some(target => !expectedTargets.delete(target)) || expectedTargets.size) throw new Error('Rigid bake tracks do not match the dynamic body recipe')
      const collision = timeline.tracks.find(track => targets.includes(track.target))
      if (collision) throw new Error(`Rigid bake target already exists: ${collision.target}`)
      if (scene.physics && scene.physics.schemaVersion !== 1) throw new Error('Physics scene schema is unsupported')
      if (scene.physics?.rigidBakes.some(record => record.id === recordId)) throw new Error(`Rigid bake record id already exists: ${recordId}`)
      beforeTimeline = timeline
      beforePhysics = scene.physics
      hadPhysics = Object.hasOwn(scene, 'physics')
      const layerIds = new Set(timeline.layerIds ?? [])
      input.recipe.bodies.filter(body => body.motionType === 'dynamic').forEach(body => layerIds.add(body.layerId))
      const nextTimeline: Timeline = {
        ...timeline,
        tracks: [...timeline.tracks, ...input.tracks],
        layerIds: timeline.layerIds === undefined ? undefined : Array.from(layerIds),
      }
      const record = {
        schemaVersion: 1 as const, id: recordId, recipe: input.recipe, sampleCount: input.sampleCount,
        tracks: input.tracks.map(track => ({ target: track.target, contentHash: hashRigidBakeTrack(track) })),
      }
      return {
        ...scene,
        timelines: scene.timelines.map(candidate => candidate.id === timeline.id ? nextTimeline : candidate),
        physics: { schemaVersion: 1, rigidBakes: [...(scene.physics?.rigidBakes ?? []), record] },
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
