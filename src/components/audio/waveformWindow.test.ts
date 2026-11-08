import { describe, expect, it } from 'vitest'
import type { WaveformPeaks } from '@/lib/timeline/audioWaveform'
import { sourceWaveformRanges, waveformBucketCount, waveformExtrema, waveformPixelSourceRange } from './waveformWindow'
const left = Float32Array.from([-.1, .2, -.3, .4, -.5, .6, -.7, .8])
const right = Float32Array.from([-.8, .7, -.6, .5, -.4, .3, -.2, .1])
const data: WaveformPeaks = { bucketCount: 4, durationSec: 4, channelCount: 2, peaks: left, channelPeaks: [left, right] }
describe('visible waveform source window', () => {
  it('keeps source offset, clip placement and scrolled visible position separate', () => {
    expect(waveformPixelSourceRange(1500, 6000, 3000, 8000, 1, 100)).toEqual([3600, 3601])
    expect(waveformPixelSourceRange(1500, 6000, 3000, 8000, 2, 100)).toEqual([3550, 3550.5])
  })
  it('crops the final pixel to the trimmed clip duration', () => {
    expect(waveformPixelSourceRange(1000, 2000, 1500, 3000, .001, 0)).toEqual([2000, 2500])
  })
  it('aggregates every peak bucket covered by a pixel and preserves stereo channels', () => {
    const a = waveformExtrema(data, 1500, 3500, false, 0)
    expect(a[0]).toBeCloseTo(-.7); expect(a[1]).toBeCloseTo(.8)
    const b = waveformExtrema(data, 0, 1000, false, 1)
    expect(b[0]).toBeCloseTo(-.8); expect(b[1]).toBeCloseTo(.7)
  })
  it('wraps looping audio instead of stretching one source waveform', () => {
    expect(sourceWaveformRanges(3500, 4500, 4000, true)).toEqual([[3500, 4000], [0, 500]])
    expect(sourceWaveformRanges(1000, 10000, 4000, true)).toEqual([[0, 4000]])
    expect(waveformExtrema(data, 4500, 5000, false)).toEqual([0, 0])
  })
  it('uses exact visible PCM at deep zoom without forcing positive samples to zero', () => {
    const buffer = { numberOfChannels: 1, sampleRate: 1, getChannelData: () => Float32Array.from([0, 1, 0, -1]) } as unknown as AudioBuffer
    expect(waveformExtrema(data, 1000, 2000, false, 0, buffer)).toEqual([1, 1])
  })
  it('quantizes overview resolution and bounds cache levels', () => {
    expect(waveformBucketCount(4000, .1)).toBe(512)
    expect(waveformBucketCount(4000, .11)).toBe(512)
    expect(waveformBucketCount(3_600_000, 1)).toBe(131072)
  })
})
