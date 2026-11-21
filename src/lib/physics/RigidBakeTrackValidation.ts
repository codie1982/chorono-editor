import type { Track } from '@/lib/types'
import type { RigidBodyBakeRecipe } from '@/lib/types/physics'
import { fractureVisibilityPlan, rigidBakeTrackTargets } from './RigidPoseTrackCompiler'

const TIME_EPSILON_MS = 1e-7
const TRANSFORM_CHANNELS = ['x', 'y', 'rotationDeg'] as const

/**
 * Validates the editable track envelope produced by a rigid-pose bake.
 *
 * Transform channels may contain fewer keys than the dense solver clip, but
 * every body must expose the same strictly ordered time set for x, y and
 * unwrapped rotation. The clip boundaries and relevant fracture event are
 * mandatory. Visibility switches remain exact two-key hold tracks. This
 * function is side-effect free and throws before a command mutates the scene.
 */
export function assertRigidBakeTracks(
  recipe: RigidBodyBakeRecipe,
  tracks: readonly Track[],
): void {
  const expectedTargets = new Set(rigidBakeTrackTargets(recipe))
  const byTarget = new Map<string, Track>()
  for (const track of tracks) {
    if (!expectedTargets.delete(track.target) || byTarget.has(track.target)) {
      throw new Error(`Rigid bake track target is unexpected or duplicated: ${track.target}`)
    }
    byTarget.set(track.target, track)
  }
  if (expectedTargets.size || byTarget.size !== tracks.length) {
    throw new Error('Rigid bake tracks do not match the recipe')
  }

  const clipStartMs = recipe.startTimeMs
  const clipEndMs = recipe.startTimeMs + recipe.durationMs
  for (const body of recipe.bodies.filter(candidate => candidate.motionType === 'dynamic')) {
    const bodyTracks = TRANSFORM_CHANNELS.map(channel => requiredTrack(
      byTarget,
      `layers.${body.layerId}.transform.${channel}`,
    ))
    bodyTracks.forEach(track => validateTransformTrack(track, clipStartMs, clipEndMs))
    const referenceTimes = bodyTracks[0].keyframes.map(key => key.timeMs)
    bodyTracks.slice(1).forEach(track => assertSameTimes(referenceTimes, track))
    for (const event of recipe.fractureEvents ?? []) {
      if (event.sourceBodyId === body.bodyId || event.fragmentBodyIds.includes(body.bodyId)) {
        const eventTimeMs = recipe.startTimeMs + event.timeMs
        if (!referenceTimes.some(timeMs => sameTime(timeMs, eventTimeMs))) {
          throw new Error(`Rigid bake track omitted fracture event time: ${trackLabel(bodyTracks[0])}`)
        }
      }
    }
  }

  for (const plan of fractureVisibilityPlan(recipe)) validateVisibility(byTarget, plan.body.layerId, plan.values)
}

function validateTransformTrack(track: Track, startTimeMs: number, endTimeMs: number): void {
  if (track.controller !== undefined || track.keyframes.length < 2) {
    throw new Error(`Rigid bake transform track is incomplete: ${trackLabel(track)}`)
  }
  validateNumericKeys(track)
  if (!sameTime(track.keyframes[0].timeMs, startTimeMs)
    || !sameTime(track.keyframes[track.keyframes.length - 1].timeMs, endTimeMs)
    || track.keyframes.some(key => key.easing?.type !== 'linear')) {
    throw new Error(`Rigid bake transform track has invalid boundaries or interpolation: ${trackLabel(track)}`)
  }
}

function validateVisibility(
  tracks: ReadonlyMap<string, Track>,
  layerId: string,
  expected: readonly { readonly timeMs: number; readonly value: 0 | 1 }[],
): void {
  const track = requiredTrack(tracks, `layers.${layerId}.opacity`)
  validateNumericKeys(track)
  if (track.controller !== undefined || track.keyframes.length !== expected.length
    || track.keyframes.some((key, index) => !sameTime(key.timeMs, expected[index].timeMs)
      || key.value !== expected[index].value)
    || track.keyframes.some(key => key.easing?.type !== 'hold')) {
    throw new Error(`Rigid fracture visibility is not an atomic hold switch: ${trackLabel(track)}`)
  }
}

function validateNumericKeys(track: Track): void {
  track.keyframes.forEach((key, index) => {
    if (typeof key.value !== 'number' || !Number.isFinite(key.value) || !Number.isFinite(key.timeMs)
      || (index > 0 && key.timeMs <= track.keyframes[index - 1].timeMs)) {
      throw new Error(`Rigid bake track contains invalid keys: ${trackLabel(track)}`)
    }
  })
}

function assertSameTimes(referenceTimes: readonly number[], track: Track): void {
  if (track.keyframes.length !== referenceTimes.length
    || track.keyframes.some((key, index) => !sameTime(key.timeMs, referenceTimes[index]))) {
    throw new Error(`Rigid bake transform channels have different time sets: ${trackLabel(track)}`)
  }
}

function requiredTrack(tracks: ReadonlyMap<string, Track>, target: string): Track {
  const track = tracks.get(target)
  if (!track) throw new Error(`Rigid bake track is missing: ${target}`)
  return track
}

function sameTime(left: number, right: number): boolean {
  return Math.abs(left - right) <= TIME_EPSILON_MS
}

function trackLabel(track: Track): string {
  return track.target || track.label || 'unknown track'
}
