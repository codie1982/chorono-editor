import { describe, expect, it } from 'vitest'
import { bezierEasing, evaluateTrack } from '../../evaluator'
import { sampleBezier } from '../timeWarp/sampler'
import { solveBezierParameter, bezierComponent } from '../bezierEasing'
import { emptyScene } from '../../defaults'
import { makeUpdateEasingCmd } from '../../editor/commands-keyframe'

describe('bounded Bezier easing', () => {
  it('solves a flat endpoint derivative without Newton escaping the curve', () => {
    expect(bezierEasing(1, 0, 1, 1)(0.999)).toBeCloseTo(0.972, 8)
    const x = 0.000001
    const t = Math.cbrt(x)
    expect(bezierEasing(0, 0, 0, 1)(x)).toBeCloseTo(3 * t * t - 2 * t ** 3, 8)
    expect(sampleBezier({ cx1: 1, cy1: 0, cx2: 1, cy2: 1 }, 0.999)).toBeCloseTo(0.972, 8)
  })

  it('keeps the parameter bracketed for endpoint and interior-flat X curves', () => {
    for (const [cx1, cx2] of [[0, 0], [1, 1], [1, 0], [0, 1], [0.42, 0.58]]) {
      for (const x of [0, 1e-6, 0.001, 0.1, 0.4999, 0.5, 0.5001, 0.999, 0.999999, 1]) {
        const t = solveBezierParameter(cx1, cx2, x)
        expect(t).toBeGreaterThanOrEqual(0)
        expect(t).toBeLessThanOrEqual(1)
        expect(bezierComponent(t, cx1, cx2)).toBeCloseTo(x, 9)
      }
    }
  })

  it('preserves Y overshoot in both keyframe and time-warp samplers', () => {
    const bezier = { cx1: 1 / 3, cy1: 2, cx2: 2 / 3, cy2: 2 }
    expect(bezierEasing(bezier.cx1, bezier.cy1, bezier.cx2, bezier.cy2)(0.5)).toBeCloseTo(1.625)
    expect(sampleBezier(bezier, 0.5)).toBeCloseTo(1.625)
  })

  it('makes Linear tangent effective, then lets a new easing replace it and undo restore it', () => {
    const scene = emptyScene()
    const track = { target: 'layers.box.transform.x', keyframes: [
      { id: 'a', timeMs: 0, value: 0, easing: { type: 'easeOut' as const }, tangentMode: 'linear' as const },
      { id: 'b', timeMs: 1000, value: 100, easing: { type: 'linear' as const } },
    ] }
    scene.timelines = [{ id: 'tl', durationMs: 1000, autoplay: true, loop: false, tracks: [track] }]
    expect(evaluateTrack(track, 500)).toBe(50)
    const cmd = makeUpdateEasingCmd('tl', track.target, 'a', track.keyframes[0].easing, { type: 'easeIn' })
    const changed = cmd.execute(scene)
    expect(changed.timelines[0].tracks[0].keyframes[0].tangentMode).toBe('broken')
    expect(evaluateTrack(changed.timelines[0].tracks[0], 500)).toBe(12.5)
    expect(cmd.undo(changed)).toEqual(scene)
  })
})
