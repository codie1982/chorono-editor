import { describe, expect, it } from 'vitest'
import { DEFAULT_WAVEFORM_PARAMS } from '../../animation/controllers/types'
import { curveSignalPreview } from '../curveSignalPreview'
import { buildCurvePath, buildCurvePathSegments } from '../curveMath'
import type { Track } from '../../types'
import { createNumericTrackSampler, evaluateNumericTrack } from '../../evaluator'

describe('zero-key procedural graph', () => {
  it('renders a bounded evaluated path and range without authoring synthetic keys', () => {
    const track: Track = { target: 'layers.hero.transform.x', keyframes: [], controller: { type: 'waveform', waveform: { ...DEFAULT_WAVEFORM_PARAMS, amplitude: 90, offset: 905 } } }
    const before = JSON.stringify(track), preview = curveSignalPreview([track], 0, 1000), viewport = { startMs: 0, endMs: 1000, widthPx: 1e6, heightPx: 200, range: preview.range }
    expect(preview.range.min).toBeLessThan(815); expect(preview.range.max).toBeGreaterThan(995)
    const path = buildCurvePath(track, viewport); expect(path).toContain('M'); expect(path.match(/[ML]/g)!.length).toBeLessThanOrEqual(2049)
    expect(buildCurvePathSegments(track, viewport).inRange).toBe(path)
    expect(JSON.stringify(track)).toBe(before)
  })
  it('diagnoses invalid controller output rather than inventing editable samples', () => {
    const track: Track = { target: 'x', keyframes: [], controller: { type: 'waveform', waveform: { ...DEFAULT_WAVEFORM_PARAMS, amplitude: NaN } } }
    expect(curveSignalPreview([track], 0, 1000).diagnostics.has('x')).toBe(true)
  })
  it('keeps prepared graph/bake probes equal to playback through sorting, warps, modifiers and range repeats', () => {
    const track: Track = { target: 'layers.hero.transform.x', keyframes: [
      { id: 'end', timeMs: 1000, value: 90, easing: { type: 'linear' } },
      { id: 'start', timeMs: 0, value: 10, easing: { type: 'customBezier', bezier: { cx1: .2, cy1: -.2, cx2: .8, cy2: 1.2 } } },
    ], outOfRange: { before: 'cycle', after: 'relativeRepeat' },
    timeWarp: { cx1: .3, cy1: .1, cx2: .7, cy2: .9 },
    multiplierCurve: { cx1: .2, cy1: .4, cx2: .8, cy2: .7 }, multiplierAmplitude: .5,
    modifiers: [{ id: 'offset', type: 'offset', enabled: true, blendMode: 'add', weight: 1, parameters: { amount: 7 } }] }
    const before = JSON.stringify(track), sample = createNumericTrackSampler(track)
    for (let time = -1250.25; time < 3500; time += 17.125) expect(sample(time)).toBe(evaluateNumericTrack(track, time))
    expect(sample(NaN)).toBeNull(); expect(sample(Infinity)).toBeNull()
    expect(JSON.stringify(track)).toBe(before)
    expect(createNumericTrackSampler({ target: 'layers.hero.text', keyframes: [{ id: 'text', timeMs: 0, value: '09:05', easing: { type: 'hold' } }] })(0)).toBeNull()
  })
})
