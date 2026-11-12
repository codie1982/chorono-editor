import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newTimeline } from '../../../defaults'
import { evaluateNumericTrack } from '../../../evaluator'
import { bakeTrack, sampleTrackDense, prepareBake, type BakeOptions } from '../bake'
import type { Track } from '../../../types'
import { makeBakeTrackToKeyframesCmd } from '../../../editor/commands-track'

const options: BakeOptions = { startMs: 0, endMs: 3000, fps: 60, tolerance: .001 }
function signal(): Track { return { target: 'layers.hero.transform.x', keyframes: [], label: 'Manual sine', controller: { type: 'waveform', waveform: {
  shape: 'sine', amplitude: 50, frequency: 1 / Math.PI, phase: 0, offset: 100, duty: .5,
} } } }

describe('bounded, identity-aware numeric bake', () => {
  it('rejects finite endpoints whose baked interpolation would overflow', () => {
    const track = signal()
    if (track.controller?.type === 'waveform') Object.assign(track.controller.waveform, { amplitude: 1e308, offset: 0, frequency: .5, phase: Math.PI / 2 })
    expect(() => bakeTrack(track, { ...options, endMs: 1000, fps: 1, tolerance: 0 })).toThrow(/finite/)
  })
  it('matches sin(2t), reports measured error and preserves unrelated metadata/source', () => {
    const track = signal(), before = JSON.stringify(track), preview = prepareBake(track, options)
    expect(preview.track.label).toBe('Manual sine'); expect(preview.track.controller).toBeUndefined()
    expect(preview.report.maxSampleError).toBeLessThanOrEqual(preview.report.valueSpan * options.tolerance + 1e-8)
    for (let t = 0; t <= 3000; t += 7.25) {
      expect(evaluateNumericTrack(track, t)).toBeCloseTo(100 + 50 * Math.sin(2 * t / 1000), 10)
      expect(Math.abs(evaluateNumericTrack(track, t)! - evaluateNumericTrack(preview.track, t)!)).toBeLessThan(.2)
    }
    expect(JSON.stringify(track)).toBe(before)
  })
  it.each([{ fps: 0 }, { fps: Infinity }, { fps: -1 }, { fps: 241 }, { startMs: -1 }, { endMs: -1 }, { endMs: 1e12 },
    { tolerance: NaN }, { tolerance: -.1 }, { tolerance: 2 }, { signal: { aborted: true } }])('rejects invalid/oversized/cancelled input %j atomically', patch => {
    const track = signal(), before = JSON.stringify(track)
    expect(() => bakeTrack(track, { ...options, ...patch })).toThrow()
    expect(JSON.stringify(track)).toBe(before)
  })
  it('rejects a non-finite controller and retains exact terminal/fractional samples', () => {
    const track = signal(); if (track.controller?.type === 'waveform') track.controller.waveform.amplitude = Infinity
    expect(() => bakeTrack(track, options)).toThrow(/finite/)
    const samples = sampleTrackDense(signal(), { ...options, fps: 29.97, startMs: .25, endMs: 1000.25 })
    expect(samples[0].timeMs).toBe(.25); expect(samples.at(-1)?.timeMs).toBe(1000.25)
    expect(samples.every((sample, index) => !index || sample.timeMs > samples[index - 1].timeMs)).toBe(true)
  })
  it('retains outside keys and exact-time identities, strips active signal and creates independent IDs per timeline', () => {
    const track = signal(); track.keyframes = [-100, 0, 3000, 4000].map(timeMs => ({ id: `manual-${timeMs}`, timeMs, value: 905, easing: { type: 'hold' } }))
    const baked = bakeTrack(track, { ...options, tolerance: 0, keyIdPrefix: 'intro' })
    expect(baked.keyframes[0]).toEqual(track.keyframes[0]); expect(baked.keyframes.at(-1)).toEqual(track.keyframes.at(-1))
    expect(baked.keyframes.find(key => key.timeMs === 0)?.id).toBe('manual-0')
    const other = bakeTrack(signal(), { ...options, keyIdPrefix: 'other' })
    expect(other.keyframes.some(key => baked.keyframes.some(item => item.id === key.id))).toBe(false)
  })
  it('commits one stale-checked membership/source change with exact undo and rejects a changed track', () => {
    const scene = emptyScene(), track = signal(), timeline = { ...newTimeline(), id: 'active', durationMs: 3000, layerIds: [] as string[], tracks: [track] }
    scene.layers = [{ ...newRectLayer(), id: 'hero' }]; scene.timelines = [timeline]
    const command = makeBakeTrackToKeyframesCmd('active', track.target, structuredClone(track), options)
    const next = command.execute(scene); expect(next.timelines[0].layerIds).toEqual(['hero']); expect(command.undo(next)).toEqual(scene)
    const stale = { ...scene, timelines: [{ ...timeline, tracks: [{ ...track, label: 'Human changed' }] }] }
    expect(() => command.execute(stale)).toThrow(/changed/)
  })
})
