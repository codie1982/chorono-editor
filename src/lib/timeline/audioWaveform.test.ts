import { beforeEach, describe, expect, it, vi } from 'vitest'
import { acquireAudioBufferFromUrl, type AudioPcmLease } from '../audio/AudioAssetService'
import { loadWaveformPeaks, peekCachedPeaks } from './audioWaveform'

vi.mock('../audio/AudioAssetService', () => ({ acquireAudioBufferFromUrl: vi.fn() }))
const load = vi.mocked(acquireAudioBufferFromUrl)
const samples = new Float32Array([-1, 0, 0.5, 1])
const pcm: AudioBuffer = { length: 4, numberOfChannels: 1, duration: 4 / 48000, sampleRate: 48000,
  getChannelData: () => samples,
  copyFromChannel: (destination, _channel, start = 0) => destination.set(samples.subarray(start, start + destination.length)),
  copyToChannel: (source, _channel, start = 0) => samples.set(source, start),
}
beforeEach(() => { load.mockReset() })
const lease = (): AudioPcmLease => ({ buffer: pcm, release: vi.fn(), retain: lease })

describe('waveform consumer cancellation', () => {
  it('shares the peak result after independently cancellable consumers finish shared decoding', async () => {
    let decoded!: (buffer: AudioPcmLease) => void
    const pending = new Promise<AudioPcmLease>(resolve => { decoded = resolve })
    load.mockReturnValue(pending)
    const a = loadWaveformPeaks('wave-shared', 2), b = loadWaveformPeaks('wave-shared', 2)
    const owned = lease(); decoded(owned)
    const [one, two] = await Promise.all([a, b])
    expect(one).toBe(two); expect(peekCachedPeaks('wave-shared', 2)).toBe(one)
    expect(Array.from(one.peaks)).toEqual([-1, 0, 0.5, 1])
    expect(owned.release).toHaveBeenCalledTimes(2)
  })

  it('honors a pre-aborted consumer even when peak data is already cached', async () => {
    load.mockResolvedValue(lease())
    await loadWaveformPeaks('wave-cached', 2)
    const controller = new AbortController(); controller.abort()
    await expect(loadWaveformPeaks('wave-cached', 2, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(load).toHaveBeenCalledOnce()
  })

  it('does not compute/cache peaks if cancellation races a fulfilled decoder promise', async () => {
    let decoded!: (buffer: AudioPcmLease) => void
    load.mockReturnValue(new Promise(resolve => { decoded = resolve }))
    const controller = new AbortController()
    const pending = loadWaveformPeaks('wave-cancelled', 2, { signal: controller.signal })
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    const owned = lease(); decoded(owned); controller.abort(); await rejected
    expect(peekCachedPeaks('wave-cancelled', 2)).toBeNull()
    expect(load).toHaveBeenCalledWith('wave-cancelled', { signal: controller.signal })
    expect(owned.release).toHaveBeenCalledOnce()
  })
})
