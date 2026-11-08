import { describe, expect, it } from 'vitest'
import type { EasingDefinition, Track, Keyframe } from '../../types'
import { emptyScene } from '../../defaults'
import { evaluateNumericTrack } from '../../evaluator'
import { initHistory, pushHistory, undoHistory, redoHistory } from '../../editor/history'
import {
  insertCurveKeyframe, applyCurveKeyframeChanges, makeCurveKeyframeChangesCmd,
  curveChangesCollide, curveDragPosition, curveDragTimeLimits, makeReplaceCurveKeysCmd,
} from '../curveEditing'

const makeTrack = (easing: EasingDefinition): Track => ({ target: 'layers.box.transform.x', keyframes: [
  { id: 'a', timeMs: 0, value: 0, easing },
  { id: 'b', timeMs: 1000, value: 100, easing: { type: 'linear' } },
] })
const idFactory = () => { let n = 0; return () => `inserted_${++n}` }
const sceneOf = (track: Track) => ({ ...emptyScene(), timelines: [{ id: 'tl', durationMs: 1000, autoplay: true, loop: false, tracks: [track] }] })

describe('shape-preserving curve insertion', () => {
  it.each(['linear', 'hold', 'easeIn', 'easeOut', 'easeInOut'] as const)('preserves %s at every sampled time after insertion', type => {
    const track = makeTrack({ type })
    const before = structuredClone(track)
    const result = insertCurveKeyframe(track, 373, idFactory())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    for (let ms = 0; ms <= 1000; ms += 5) expect(evaluateNumericTrack(result.track, ms)).toBeCloseTo(evaluateNumericTrack(track, ms)!, 7)
    expect(track).toEqual(before)
    if (type === 'easeInOut') expect(result.insertedIds).toHaveLength(2)
  })

  it('uses the exact Ease In Out midpoint without unnecessary extra keys', () => {
    const track = makeTrack({ type: 'easeInOut' })
    const result = insertCurveKeyframe(track, 500, idFactory())
    expect(result.ok && result.insertedIds.length).toBe(1)
    if (result.ok) for (let ms = 0; ms <= 1000; ms += 7) expect(evaluateNumericTrack(result.track, ms)).toBeCloseTo(evaluateNumericTrack(track, ms)!, 8)
  })

  it('splits a custom Bezier with overshoot via De Casteljau', () => {
    const track = makeTrack({ type: 'customBezier', bezier: { cx1: 0.15, cy1: -0.5, cx2: 0.8, cy2: 1.5 } })
    const result = insertCurveKeyframe(track, 317, idFactory())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    for (let ms = 0; ms <= 1000; ms += 3) expect(evaluateNumericTrack(result.track, ms)).toBeCloseTo(evaluateNumericTrack(track, ms)!, 7)
    const command = makeReplaceCurveKeysCmd('tl', track, result.track)
    const base = sceneOf(track)
    expect(command.undo(command.execute(base))).toEqual(base)
  })

  it('does not double-apply an active modifier or mutate a procedural/remapped track', () => {
    const offset = { id: 'offset', type: 'offset' as const, enabled: true, blendMode: 'replace' as const, weight: 1, parameters: { delta: 100 } }
    const variants: Track[] = [
      { ...makeTrack({ type: 'linear' }), modifiers: [offset] },
      { ...makeTrack({ type: 'linear' }), timeWarp: { cx1: 0.3, cy1: 0, cx2: 0.7, cy2: 1 } },
      { ...makeTrack({ type: 'linear' }), easeCurve: { cx1: 0.3, cy1: 0, cx2: 0.7, cy2: 1 } },
      { ...makeTrack({ type: 'linear' }), multiplierCurve: { cx1: 0.3, cy1: 0, cx2: 0.7, cy2: 1 } },
      { ...makeTrack({ type: 'linear' }), controller: { type: 'waveform', waveform: { shape: 'sine', amplitude: 1, frequency: 1, phase: 0, offset: 0, duty: 0.5 } } },
    ]
    const segment = makeTrack({ type: 'linear' })
    segment.keyframes[0].segmentModifiers = [offset]
    variants.push(segment)
    for (const track of variants) {
      const before = structuredClone(track)
      const value = evaluateNumericTrack(track, 500)
      const result = insertCurveKeyframe(track, 500, idFactory())
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toMatch(/Bake/)
      expect(evaluateNumericTrack(track, 500)).toBe(value)
      expect(track).toEqual(before)
    }
  })

  it('selects an existing key instead of replacing its identity', () => {
    const track = makeTrack({ type: 'linear' })
    const result = insertCurveKeyframe(track, 1000, idFactory())
    expect(result).toMatchObject({ ok: false, existingId: 'b' })
    expect(track.keyframes.map(key => key.id)).toEqual(['a', 'b'])
  })

  it('refuses an endpoint-value overshoot crossing which the easing data model cannot represent', () => {
    const track = makeTrack({ type: 'customBezier', bezier: { cx1: 1 / 3, cy1: -1 / 3, cx2: 2 / 3, cy2: 0 } })
    const result = insertCurveKeyframe(track, 500, idFactory()) // y(0.5)=0 but the preceding lobe is nonconstant
    expect(result.ok).toBe(false)
    expect(track.keyframes).toHaveLength(2)
  })
})

describe('curve drag edits', () => {
  const viewport = { startMs: 0, endMs: 1000, range: { min: -0.1, max: 1.1 }, widthPx: 600, heightPx: 300 }
  it('uses the normalized track range and pointer delta without jumping to shared values', () => {
    const result = curveDragPosition(viewport, 'layers.box.opacity', 500, 0.5, 60, -25, null, true)
    expect(result.ms).toBe(600)
    expect(result.value).toBeCloseTo(0.6)
    expect(curveDragPosition(viewport, 'layers.box.opacity', 500, 0.5, 0, 0, null, true)).toEqual({ ms: 500, value: 0.5 })
  })

  it('locks only the requested axis and computes bounds that preserve group spacing', () => {
    expect(curveDragPosition(viewport, 'layers.box.opacity', 500, 0.5, 60, -25, 'x', true)).toEqual({ ms: 600, value: 0.5 })
    expect(curveDragPosition(viewport, 'layers.box.opacity', 500, 0.5, 60, -25, 'y', true).ms).toBe(500)
    expect(curveDragTimeLimits([40, 900], 1000)).toEqual({ min: -40, max: 100 })
    expect(curveDragTimeLimits([1001], 1000)).toBeNull()
    expect(curveDragTimeLimits([-1, 50], 1000)).toBeNull()
  })

  it('keeps the original during clone preview and commits the clone as one reversible transaction', () => {
    const track = makeTrack({ type: 'easeOut' })
    const base = sceneOf(track)
    const original = track.keyframes[0]
    const clone: Keyframe = { ...original, id: 'clone', timeMs: 0 }
    const preview = applyCurveKeyframeChanges(base, 'tl', [{ target: track.target, keyframe: clone, duplicate: true }])
    expect(preview.timelines[0].tracks[0].keyframes.map(key => key.id)).toEqual(['a', 'clone', 'b'])
    expect(base.timelines[0].tracks[0].keyframes).toHaveLength(2) // cancellation restores this exact snapshot
    const changes = [{ target: track.target, keyframe: { ...clone, timeMs: 200, value: 30 }, duplicate: true }]
    expect(curveChangesCollide(base, 'tl', changes)).toBe(false)
    const cmd = makeCurveKeyframeChangesCmd(base, 'tl', changes)
    const history = pushHistory(initHistory(base), cmd.execute(base))
    expect(history.past).toHaveLength(1)
    expect(undoHistory(history).present).toBe(base)
    expect(cmd.undo(history.present)).toEqual(base)
    expect(redoHistory(undoHistory(history)).present).toEqual(history.present)
    expect(history.present.timelines[0].tracks[0].keyframes.find(key => key.id === 'a')).toBe(original)
  })

  it('commits a two-axis multi-selection edit with one snapshot undo and detects collisions', () => {
    const track = makeTrack({ type: 'linear' })
    const base = sceneOf(track)
    const change = { target: track.target, keyframe: { ...track.keyframes[0], timeMs: 200, value: 20 } }
    const cmd = makeCurveKeyframeChangesCmd(base, 'tl', [change])
    const history = pushHistory(initHistory(base), cmd.execute(base))
    expect(history.present.timelines[0].tracks[0].keyframes[0]).toMatchObject({ timeMs: 200, value: 20 })
    expect(undoHistory(history).present.timelines[0].tracks[0].keyframes[0]).toMatchObject({ timeMs: 0, value: 0 })
    expect(curveChangesCollide(base, 'tl', [{ ...change, keyframe: { ...change.keyframe, timeMs: 1000 } }])).toBe(true)
  })
})
