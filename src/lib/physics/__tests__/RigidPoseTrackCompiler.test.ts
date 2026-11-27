import { describe, expect, it } from 'vitest'
import { rigidBakeFixture } from '@/lib/bake/__tests__/RigidBodyBakeFixture'
import type { RigidPoseCacheHeader } from '@/lib/types/physics'
import { RigidPoseClip } from '../RigidPoseClip'
import { RigidPoseTrackCompiler } from '../RigidPoseTrackCompiler'

describe('RigidPoseTrackCompiler', () => {
  it('inserts an exact solver event time and protects its dense neighbours in every channel', () => {
    const { recipe } = rigidBakeFixture()
    const sampleTimesMs = new Float64Array([0, 1000, 2000, 3000])
    const poses = new Float64Array(Array.from(sampleTimesMs).flatMap(timeMs => [
      timeMs / 10, timeMs / 20, timeMs * .72,
      0, 400, 0,
    ]))
    const header: RigidPoseCacheHeader = {
      schemaVersion: 1,
      kind: 'rigidPose',
      solverId: recipe.solverId,
      solverVersion: recipe.solverVersion,
      sourceHash: recipe.source.revision,
      recipeHash: recipe.recipeHash,
      coordinateSpace: 'composition-pixels-y-down',
      linearUnit: 'pixel',
      angularUnit: 'degree-unwrapped',
      timeUnit: 'millisecond',
      pixelsPerMeter: recipe.pixelsPerMeter,
      stepHz: recipe.stepHz,
      sampleFps: recipe.sampleFps,
      durationMs: recipe.durationMs,
      bodyIds: recipe.bodies.map(body => body.bodyId),
      channels: ['centerX', 'centerY', 'angle'],
    }
    const clip = new RigidPoseClip({ header, sampleTimesMs, poses })

    const result = new RigidPoseTrackCompiler().compile(recipe, clip, [{
      kind: 'contact-start',
      tick: 180,
      timeMs: 1500,
      bodyIds: ['rigid:box', 'rigid:floor'],
    }])

    expect(result.tracks).toHaveLength(3)
    result.tracks.forEach(track => {
      expect(track.keyframes.map(key => key.timeMs)).toEqual([0, 1000, 1500, 2000, 3000])
    })
    expect(result.report).toMatchObject({
      rawKeyframeCount: 15,
      keyframeCount: 15,
      protectedEventCount: 1,
      protectedSampleCount: 5,
    })
    expect(result.tracks[2].keyframes.at(-1)?.value).toBe(2160)
  })
})
