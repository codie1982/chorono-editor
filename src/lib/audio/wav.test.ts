import { describe, expect, it } from 'vitest'
import { encodeWav, measurePCM, sourceRangePeak } from './wav'
const pcm = (...channels: number[][]) => ({ numberOfChannels: channels.length, length: channels[0].length,
  sampleRate: 10000, getChannelData: (c: number) => Float32Array.from(channels[c]) })
describe('audio PCM output', () => {
  it('encodes a real stereo PCM WAV header and interleaves channels', () => {
    const bytes = encodeWav(pcm([0, 1, -1], [.5, -.5, 0])), view = new DataView(bytes.buffer)
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('RIFF')
    expect(view.getUint16(22, true)).toBe(2); expect(view.getUint32(24, true)).toBe(10000)
    expect(view.getUint32(40, true)).toBe(12); expect(bytes.length).toBe(56)
    expect([44,46,48,50,52,54].map(at => view.getInt16(at, true))).toEqual([0,16384,32767,-16384,-32768,0])
  })
  it('reports unclipped peak/RMS and clipping while encoding saturated integer output', () => {
    const buffer = pcm([2, -2])
    expect(measurePCM(buffer)).toMatchObject({ peak: 2, rms: 2, clippedSamples: 2 })
    const bytes = encodeWav(buffer), view = new DataView(bytes.buffer)
    expect(view.getInt16(44, true)).toBe(32767); expect(view.getInt16(46, true)).toBe(-32768)
    expect(measurePCM(pcm([0,0])).peakDbFS).toBeNull()
  })
  it('normalizes only the trimmed source, including loop wrapping and both channels', () => {
    const buffer = pcm([1,.25,.5,.75], [-1,.1,.2,-.9])
    expect(sourceRangePeak(buffer, .1, .1)).toBe(.25)
    expect(sourceRangePeak(buffer, .3, .2, true)).toBe(1)
    expect(sourceRangePeak(buffer, .1, 1, true)).toBe(1)
    expect(sourceRangePeak(buffer, 2, 1)).toBe(0)
  })
})
