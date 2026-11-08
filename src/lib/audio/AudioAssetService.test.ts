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
      fetch: vi.fn(async () => new Response(new Uint8Array(1))),
      createContext: () => ({ state: 'running', decodeAudioData: async () => buffer } as unknown as AudioContext),
    })
    await service.loadUrl('a')
    expect(service.getMemorySnapshot([buffer, buffer, other])).toMatchObject({ bytes: 20, bufferCount: 2 })
    service.clear()
    expect(service.getMemorySnapshot([buffer])).toMatchObject({ bytes: 16, bufferCount: 1 })
  })
  it('deduplicates concurrent decoding and retries a failed URL', async () => {
    const buffer = pcm([[0, 0.5, 1]])
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(new Response(new Uint8Array(1)))
    const decodeAudioData = vi.fn(async () => buffer)
    const service = new AudioAssetService({ fetch: fetcher, createContext: () => ({ state: 'running', decodeAudioData } as unknown as AudioContext) })
    await expect(service.loadUrl('a')).rejects.toThrow('offline')
    const [one, two] = await Promise.all([service.loadUrl('a'), service.loadUrl('a')])
    expect(one).toBe(two); expect(decodeAudioData).toHaveBeenCalledTimes(1); expect(fetcher).toHaveBeenCalledTimes(2)
    expect(await service.loadUrl('a')).toBe(buffer)
  })
  it('bounds PCM cache and refuses to cache stale completions after clear', async () => {
    let complete!: (value: AudioBuffer) => void
    let started!: () => void
    const decoding = new Promise<void>(resolve => { started = resolve })
    const service = new AudioAssetService({ fetch: vi.fn(async () => new Response(new Uint8Array(1))), maxBytes: 8,
      createContext: () => ({ state: 'running', decodeAudioData: () => new Promise<AudioBuffer>(resolve => { complete = resolve; started() }) } as unknown as AudioContext) })
    const pending = service.loadUrl('a'); await decoding; service.clear()
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
    let started!: () => void
    const fetching = new Promise<void>(resolve => { started = resolve })
    const createContext = vi.fn()
    const service = new AudioAssetService({ fetch: vi.fn(() => new Promise<Response>(resolve => { complete = resolve; started() })), createContext })
    const pending = service.loadUrl('late')
    const rejected = expect(pending).rejects.toThrow('disposed')
    await fetching
    await service.dispose()
    complete(new Response(new Uint8Array(1)))
    await rejected
    expect(createContext).not.toHaveBeenCalled()
  })
})
