import { gainToDb } from '@/lib/audio/audioClip'

/** CSS-pixel envelope ordinate shared by audio drawing and data-based timeline
 * selection. Finite dB is clamped to [-60,12]; silence/nonfinite uses -60 dB. */
export function gainEnvelopeY(gain: number, height = 56): number {
  const db = gainToDb(gain)
  return 4 + (1 - Math.max(0, Math.min(1, ((Number.isFinite(db) ? db : -60) + 60) / 72))) * (height - 8)
}
