import { hashCanonicalRecords } from '@/lib/hash/CanonicalRecordHash'
import type { Track } from '@/lib/types'
import type { RigidBodyBakeRecipe, RigidBodySnapshot } from '@/lib/types/physics'
import type { RigidBodySolverEvent } from './PhysicsBackend'
import type { RigidPoseClip } from './RigidPoseClip'
import {
  RigidPoseKeyframeSimplifier,
  type RigidPoseSimplificationPolicy,
} from './RigidPoseKeyframeSimplifier'
import { visualTransformFromRigidPose } from './RigidVisualTransform'
import { assertRigidFractureEvents } from './RigidFractureValidation'

export const DEFAULT_RIGID_POSE_SIMPLIFICATION: RigidPoseSimplificationPolicy = Object.freeze({
  maxVertexErrorPx: .5,
  maxAngleErrorDeg: .25,
  maxComparisons: 2_000_000,
})

export interface RigidPoseTrackCompilationReport {
  readonly rawKeyframeCount: number
  readonly keyframeCount: number
  readonly protectedEventCount: number
  readonly protectedSampleCount: number
  readonly maxVertexErrorPx: number
  readonly maxAngleErrorDeg: number
  readonly policy: RigidPoseSimplificationPolicy
}

export interface RigidPoseTrackCompilation {
  readonly tracks: readonly Track[]
  readonly report: RigidPoseTrackCompilationReport
}

/**
 * Converts a dense rigid-pose preview into ordinary editable property tracks.
 *
 * Only dynamic bodies produce pose tracks. X, Y and unwrapped rotation are
 * simplified as one coupled trajectory with world-space collider-vertex and
 * angular error bounds. Fracture, contact and sleep times plus their adjacent
 * dense samples are mandatory boundaries. Visibility tracks remain exact hold
 * keys and are never simplified. Instances hold only an immutable policy.
 */
export class RigidPoseTrackCompiler {
  private readonly simplifier = new RigidPoseKeyframeSimplifier()
  private readonly policy: RigidPoseSimplificationPolicy

  constructor(policy: RigidPoseSimplificationPolicy = DEFAULT_RIGID_POSE_SIMPLIFICATION) {
    this.policy = Object.freeze({ ...policy })
  }

  /** Compiles x, y and unwrapped clockwise rotation tracks per dynamic body. */
  compile(
    recipe: RigidBodyBakeRecipe,
    clip: RigidPoseClip,
    solverEvents: readonly RigidBodySolverEvent[] = [],
  ): RigidPoseTrackCompilation {
    if (clip.header.recipeHash !== recipe.recipeHash) throw new Error('Rigid pose clip does not belong to this recipe')
    assertRigidFractureEvents(recipe, { requireRealized: true })
    const bodies = recipe.bodies.filter(body => body.motionType === 'dynamic')
      .map(body => this.compileBody(recipe, clip, body, protectedTimes(recipe, solverEvents, body.bodyId)))
    const visibility = this.compileFractureVisibility(recipe)
    const tracks = [...bodies.flatMap(body => body.tracks), ...visibility]
    return {
      tracks,
      report: Object.freeze({
        rawKeyframeCount: bodies.reduce((count, body) => count + body.rawKeyframeCount, 0)
          + visibility.reduce((count, track) => count + track.keyframes.length, 0),
        keyframeCount: tracks.reduce((count, track) => count + track.keyframes.length, 0),
        protectedEventCount: uniqueEventCount(recipe, solverEvents),
        protectedSampleCount: bodies.reduce((count, body) => count + body.protectedSampleCount, 0),
        maxVertexErrorPx: Math.max(0, ...bodies.map(body => body.maxVertexErrorPx)),
        maxAngleErrorDeg: Math.max(0, ...bodies.map(body => body.maxAngleErrorDeg)),
        policy: this.policy,
      }),
    }
  }

  private compileBody(
    recipe: RigidBodyBakeRecipe,
    clip: RigidPoseClip,
    body: RigidBodySnapshot,
    eventTimesMs: readonly number[],
  ): {
    tracks: Track[]; rawKeyframeCount: number; protectedSampleCount: number
    maxVertexErrorPx: number; maxAngleErrorDeg: number
  } {
    const times = mergeTimes(clip.sampleTimesMs(), eventTimesMs)
    const raw = times.map(timeMs => ({ timeMs, pose: clip.sample(body.bodyId, timeMs) }))
    const simplified = this.simplifier.simplify(body, raw, eventTimesMs, this.policy)
    const samples = simplified.samples.map((sample, index) => ({
      timeMs: recipe.startTimeMs + sample.timeMs,
      index,
      transform: visualTransformFromRigidPose(body, sample.pose),
    }))
    const tracks = (['x', 'y', 'rotationDeg'] as const).map(channel => ({
      target: `layers.${body.layerId}.transform.${channel}`,
      label: `Rigid Bake · ${channel === 'rotationDeg' ? 'Rotation' : channel.toUpperCase()}`,
      kind: 'property' as const,
      keyframes: samples.map(sample => ({
        id: `rigid:${recipe.recipeHash}:${body.layerId}:${channel}:${sample.index}`,
        timeMs: sample.timeMs,
        value: sample.transform[channel],
        easing: { type: 'linear' as const },
      })),
    }))
    return {
      tracks,
      rawKeyframeCount: simplified.rawSampleCount * 3,
      protectedSampleCount: simplified.protectedSampleCount,
      maxVertexErrorPx: simplified.maxVertexErrorPx,
      maxAngleErrorDeg: simplified.maxAngleErrorDeg,
    }
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

function protectedTimes(
  recipe: RigidBodyBakeRecipe,
  solverEvents: readonly RigidBodySolverEvent[],
  bodyId: string,
): number[] {
  const result = solverEvents.filter(event => event.bodyIds.includes(bodyId)).map(event => event.timeMs)
  for (const event of recipe.fractureEvents ?? []) {
    if (event.sourceBodyId === bodyId || event.fragmentBodyIds.includes(bodyId)) result.push(event.timeMs)
  }
  return mergeTimes([], result)
}

function uniqueEventCount(recipe: RigidBodyBakeRecipe, solverEvents: readonly RigidBodySolverEvent[]): number {
  return new Set([
    ...(recipe.fractureEvents ?? []).map(event => `fracture:${event.id}:${event.tick}`),
    ...solverEvents.map(event => `${event.kind}:${event.tick}:${event.bodyIds.join(',')}`),
  ]).size
}

function mergeTimes(base: ArrayLike<number>, extra: readonly number[]): number[] {
  const sorted = [...Array.from(base), ...extra].sort((left, right) => left - right)
  const result: number[] = []
  for (const time of sorted) {
    if (!Number.isFinite(time)) throw new RangeError('Rigid pose event time is invalid')
    if (!result.length || Math.abs(time - result[result.length - 1]) > 1e-7) result.push(time)
  }
  return result
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
