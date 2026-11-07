import { describe, expect, it, vi } from 'vitest'
import { AudioAssetService } from './AudioAssetService'
import { downsampleAudioBuffer } from '../timeline/audioWaveform'
const pcm = (channels: number[][]): AudioBuffer => ({ length: channels[0].length, numberOfChannels: channels.length, duration: channels[0].length / 10,
  getChannelData: (c: number) => Float32Array.from(channels[c]) } as AudioBuffer)

describe('shared audio decode and waveform', () => {
  it('deduplicates PCM retained by engines and counts pins after cache eviction without changing LRU', async () => {
    const buffer = pcm([[1, 1], [1, 1]])
    const other = pcm([[1]])
    const service = new AudioAssetService({
      fetch: vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) } as Response)),
      createContext: () => ({ state: 'running', decodeAudioData: async () => buffer } as unknown as AudioContext),
    })
    await service.loadUrl('a')
    expect(service.getMemorySnapshot([buffer, buffer, other])).toMatchObject({ bytes: 20, bufferCount: 2 })
    service.clear()
    expect(service.getMemorySnapshot([buffer])).toMatchObject({ bytes: 16, bufferCount: 1 })
  })
  it('deduplicates concurrent decoding and retries a failed URL', async () => {
    const buffer = pcm([[0, 0.5, 1]])
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })
    const decodeAudioData = vi.fn(async () => buffer)
    const service = new AudioAssetService({ fetch: fetcher, createContext: () => ({ state: 'running', decodeAudioData } as unknown as AudioContext) })
    await expect(service.loadUrl('a')).rejects.toThrow('offline')
    const [one, two] = await Promise.all([service.loadUrl('a'), service.loadUrl('a')])
    expect(one).toBe(two); expect(decodeAudioData).toHaveBeenCalledTimes(1); expect(fetcher).toHaveBeenCalledTimes(2)
    expect(await service.loadUrl('a')).toBe(buffer)
  })
  it('bounds PCM cache and refuses to cache stale completions after clear', async () => {
    let complete!: (value: AudioBuffer) => void
    const service = new AudioAssetService({ fetch: vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) } as Response)), maxBytes: 8,
      createContext: () => ({ state: 'running', decodeAudioData: () => new Promise<AudioBuffer>(resolve => { complete = resolve }) } as unknown as AudioContext) })
    const pending = service.loadUrl('a'); await Promise.resolve(); await Promise.resolve(); service.clear()
    complete(pcm([[1, 1, 1]])); await pending; expect(service.peek('a')).toBeUndefined()
  })
  it('preserves stereo opposition and the final source sample in every peak reduction', () => {
    const peaks = downsampleAudioBuffer(pcm([[0, 0, 0, 0, 1], [0, 0, 0, 0, -1]]), 2)
    expect(Array.from(peaks.peaks)).toEqual([0, 0, -1, 1])
    expect(Array.from(peaks.channelPeaks[0])).toEqual([0, 0, 0, 1])
    expect(Array.from(peaks.channelPeaks[1])).toEqual([0, 0, -1, 0])
    expect(Array.from(downsampleAudioBuffer(pcm([[0.5]]), 4).peaks)).toEqual([0, 0, 0, 0, 0, 0, 0.5, 0.5])
  })
  it('does not recreate a decoder when a request completes after disposal', async () => {
    let complete!: (value: Response) => void
    const createContext = vi.fn()
    const service = new AudioAssetService({ fetch: vi.fn(() => new Promise<Response>(resolve => { complete = resolve })), createContext })
    const pending = service.loadUrl('late')
    await service.dispose()
    complete({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) } as Response)
    await expect(pending).rejects.toThrow('disposed')
    expect(createContext).not.toHaveBeenCalled()
  })
})
