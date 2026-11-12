import type { Track, Keyframe, AnimatableValue } from '../../types'
import type { BakeOptions } from './BakeOptions'

/** One stable ID/metadata conversion for numeric, vector, color and discrete
 * jobs. Exact old times keep identity; synthetic IDs include target/namespace.
 * Segment signal modifiers are removed; source inputs and values are borrowed. */
export function bakedKeysForSamples(track: Track, samples: readonly { timeMs: number; value: AnimatableValue }[], opts: BakeOptions, discrete = false): Keyframe[] {
  const existing = new Map(track.keyframes.map(key => [key.timeMs, key]))
  const used = new Set(track.keyframes.map(key => key.id))
  return samples.map(sample => {
    const old = existing.get(sample.timeMs)
    const { segmentModifiers: _segments, ...metadata } = old ?? ({} as Partial<Keyframe>)
    let id = old?.id ?? `baked:${encodeURIComponent(opts.keyIdPrefix ?? '')}:${encodeURIComponent(track.target)}:${sample.timeMs}`
    if (!old) { const base = id; let suffix = 0; while (used.has(id)) id = `${base}:${++suffix}` }
    used.add(id)
    return { ...metadata, id, timeMs: sample.timeMs, value: sample.value, easing: { type: discrete ? 'hold' : 'linear' }, tangentMode: 'linear' }
  })
}
