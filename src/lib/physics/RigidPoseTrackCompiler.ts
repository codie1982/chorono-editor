import { hashCanonicalRecords } from '@/lib/hash/CanonicalRecordHash'
import type { Track } from '@/lib/types'
import type { RigidBodyBakeRecipe, RigidBodySnapshot } from '@/lib/types/physics'
import type { RigidPoseClip } from './RigidPoseClip'
import { visualTransformFromRigidPose } from './RigidVisualTransform'

/**
 * Converts a dense rigid-pose preview into ordinary editable property tracks.
 *
 * Only dynamic bodies produce tracks. Every sample is retained as a linear key
 * in this correctness-first slice; later simplification may be added behind a
 * separate policy without changing physics or renderer contracts.
 */
export class RigidPoseTrackCompiler {
  /** Compiles x, y and unwrapped clockwise rotation tracks per dynamic body. */
  compile(recipe: RigidBodyBakeRecipe, clip: RigidPoseClip): Track[] {
    if (clip.header.recipeHash !== recipe.recipeHash) throw new Error('Rigid pose clip does not belong to this recipe')
    const times = clip.sampleTimesMs()
    return recipe.bodies.filter(body => body.motionType === 'dynamic').flatMap(body => this.compileBody(recipe, clip, body, times))
  }

  private compileBody(recipe: RigidBodyBakeRecipe, clip: RigidPoseClip, body: RigidBodySnapshot, times: Float64Array): Track[] {
    const samples = Array.from(times, (time, index) => ({
      timeMs: recipe.startTimeMs + time,
      index,
      transform: visualTransformFromRigidPose(body, clip.poseAt(body.bodyId, index)),
    }))
    return (['x', 'y', 'rotationDeg'] as const).map(channel => ({
      target: `layers.${body.layerId}.transform.${channel}`,
      label: `Rigid Bake · ${channel === 'rotationDeg' ? 'Rotation' : channel.toUpperCase()}`,
      kind: 'property',
      keyframes: samples.map(sample => ({
        id: `rigid:${recipe.recipeHash}:${body.layerId}:${channel}:${sample.index}`,
        timeMs: sample.timeMs,
        value: sample.transform[channel],
        easing: { type: 'linear' },
      })),
    }))
  }
}

/** Hashes the generated fields owned by a rigid bake record. */
export function hashRigidBakeTrack(track: Track): string {
  return hashCanonicalRecords('rigid-bake-track-v1', [
    `target:${track.target}`, `kind:${track.kind ?? 'property'}`, `keys:${track.keyframes.length}`,
    ...track.keyframes.flatMap(key => [
      `id:${key.id}`, `time:${key.timeMs}`, `value:${String(key.value)}`, `easing:${JSON.stringify(key.easing)}`,
    ]),
  ])
}
