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
    const transforms = recipe.bodies.filter(body => body.motionType === 'dynamic')
      .flatMap(body => this.compileBody(recipe, clip, body, times))
    return [...transforms, ...this.compileFractureVisibility(recipe)]
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

  private compileFractureVisibility(recipe: RigidBodyBakeRecipe): Track[] {
    return (recipe.fractureEvents ?? []).flatMap(event => {
      const eventTimeMs = recipe.startTimeMs + event.timeMs
      const participants = [
        { bodyId: event.sourceBodyId, from: 1, to: 0 },
        ...event.fragmentBodyIds.map(bodyId => ({ bodyId, from: 0, to: 1 })),
      ]
      return participants.map(participant => {
        const body = recipe.bodies.find(candidate => candidate.bodyId === participant.bodyId)
        if (!body) throw new Error(`Rigid fracture visibility body is missing: ${participant.bodyId}`)
        return {
          target: `layers.${body.layerId}.opacity`,
          label: `Rigid Bake · Fracture Visibility`,
          kind: 'property' as const,
          keyframes: [
            {
              id: `rigid:${recipe.recipeHash}:${body.layerId}:opacity:before`,
              timeMs: recipe.startTimeMs,
              value: participant.from,
              easing: { type: 'hold' as const },
            },
            {
              id: `rigid:${recipe.recipeHash}:${body.layerId}:opacity:event`,
              timeMs: eventTimeMs,
              value: participant.to,
              easing: { type: 'hold' as const },
            },
          ],
        }
      })
    })
  }
}

/** Returns the complete track target set owned by an ordinary/fracture bake. */
export function rigidBakeTrackTargets(recipe: RigidBodyBakeRecipe): string[] {
  const targets = recipe.bodies.filter(body => body.motionType === 'dynamic').flatMap(body => [
    `layers.${body.layerId}.transform.x`,
    `layers.${body.layerId}.transform.y`,
    `layers.${body.layerId}.transform.rotationDeg`,
  ])
  for (const event of recipe.fractureEvents ?? []) {
    for (const bodyId of [event.sourceBodyId, ...event.fragmentBodyIds]) {
      const body = recipe.bodies.find(candidate => candidate.bodyId === bodyId)
      if (!body) throw new Error(`Rigid fracture track body is missing: ${bodyId}`)
      targets.push(`layers.${body.layerId}.opacity`)
    }
  }
  return targets
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
