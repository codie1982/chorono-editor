import { describe, expect, it } from 'vitest'
import { rigidBakeFixture } from '@/lib/bake/__tests__/RigidBodyBakeFixture'
import { RigidPoseKeyframeSimplifier, type RigidPoseSample } from '../RigidPoseKeyframeSimplifier'

const policy = { maxVertexErrorPx: .5, maxAngleErrorDeg: .25, maxComparisons: 10_000 }

describe('RigidPoseKeyframeSimplifier', () => {
  it('reduces a linear two-turn trajectory to its unwrapped endpoints', () => {
    const body = rigidBakeFixture().recipe.bodies[0]
    const samples: RigidPoseSample[] = Array.from({ length: 9 }, (_, index) => ({
      timeMs: index * 100,
      pose: { centerX: index * 10, centerY: 25, angleDeg: index * 90 },
    }))

    const result = new RigidPoseKeyframeSimplifier().simplify(body, samples, [], policy)

    expect(result.samples).toHaveLength(2)
    expect(result.samples.map(sample => sample.pose.angleDeg)).toEqual([0, 720])
    expect(result.maxVertexErrorPx).toBeLessThan(1e-9)
    expect(result.maxAngleErrorDeg).toBeLessThan(1e-9)
  })

  it('keeps enough samples for a curved trajectory to satisfy both tolerances', () => {
    const body = rigidBakeFixture().recipe.bodies[0]
    const samples: RigidPoseSample[] = Array.from({ length: 41 }, (_, index) => ({
      timeMs: index * 25,
      pose: {
        centerX: index * 3,
        centerY: 30 + Math.sin(index / 5) * 18,
        angleDeg: index * 2 + Math.sin(index / 4),
      },
    }))

    const result = new RigidPoseKeyframeSimplifier().simplify(body, samples, [], policy)

    expect(result.samples.length).toBeGreaterThan(2)
    expect(result.samples.length).toBeLessThan(samples.length)
    expect(result.maxVertexErrorPx).toBeLessThanOrEqual(policy.maxVertexErrorPx + 1e-9)
    expect(result.maxAngleErrorDeg).toBeLessThanOrEqual(policy.maxAngleErrorDeg + 1e-9)
  })

  it('retains an event sample and its immediate dense neighbours', () => {
    const body = rigidBakeFixture().recipe.bodies[0]
    const samples: RigidPoseSample[] = Array.from({ length: 7 }, (_, index) => ({
      timeMs: index * 100,
      pose: { centerX: index * 10, centerY: index * 5, angleDeg: index * 2 },
    }))

    const result = new RigidPoseKeyframeSimplifier().simplify(body, samples, [300], policy)

    expect(result.samples.map(sample => sample.timeMs)).toEqual([0, 200, 300, 400, 600])
    expect(result.protectedSampleCount).toBe(5)
  })

  it('uses collider vertices even when the independent angle tolerance permits the rotation', () => {
    const body = rigidBakeFixture().recipe.bodies[0]
    const samples: RigidPoseSample[] = [
      { timeMs: 0, pose: { centerX: 0, centerY: 0, angleDeg: 0 } },
      { timeMs: 100, pose: { centerX: 0, centerY: 0, angleDeg: 1 } },
      { timeMs: 200, pose: { centerX: 0, centerY: 0, angleDeg: 0 } },
    ]

    const result = new RigidPoseKeyframeSimplifier().simplify(body, samples, [], {
      maxVertexErrorPx: .5,
      maxAngleErrorDeg: 180,
    })

    expect(result.samples).toHaveLength(3)
  })

  it('fails explicitly when the comparison budget cannot prove the result', () => {
    const body = rigidBakeFixture().recipe.bodies[0]
    const samples: RigidPoseSample[] = Array.from({ length: 6 }, (_, index) => ({
      timeMs: index * 100,
      pose: { centerX: index, centerY: index ** 2, angleDeg: index ** 2 },
    }))

    expect(() => new RigidPoseKeyframeSimplifier().simplify(body, samples, [], {
      ...policy,
      maxComparisons: 1,
    })).toThrow(/work limit/)
  })
})
