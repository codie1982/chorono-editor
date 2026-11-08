import { encodeWav } from '../wav'

/** Real, deterministic 50ms stereo WAV with opposing channels. Shared native
 * fixtures use the production encoder, not hand-authored container bytes. */
export function nativeStereoSource(): Blob {
  const channels = [new Float32Array(2400).fill(0.5), new Float32Array(2400).fill(-0.5)]
  return new Blob([encodeWav({ numberOfChannels: 2, length: 2400, sampleRate: 48000,
    getChannelData: channel => channels[channel] }).buffer as ArrayBuffer], { type: 'audio/wav' })
}
