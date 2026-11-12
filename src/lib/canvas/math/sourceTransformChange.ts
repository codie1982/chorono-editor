import type { Layer, Transform } from '@/lib/types'
import type { PreparedTransformTarget } from './preparedTransforms'

export interface SourceTransformChange {
  prev: Layer
  next: Layer
  changedProperties: string[]
}

const CHANNELS = ['x', 'y', 'rotationDeg', 'scaleX', 'scaleY', 'anchorX', 'anchorY'] as const

/**
 * Convert one evaluated gesture result to an authored source patch. Compare
 * with target.transform (the displayed start pose), then copy only changed
 * channels onto originalLayer.transform. Unedited keyed x/scale/etc. therefore
 * never become source values. Intent is retained even when a final displayed
 * value equals the authored fallback; commit adapters still receive its path.
 *
 * Uses the viewport's existing absolute 1e-8 channel tolerance. Returns null for
 * a displayed no-op, throws RangeError for non-finite final channels, and never
 * mutates the borrowed target/source. The returned next layer owns a fresh
 * transform; unrelated geometry, metadata and nested records remain borrowed.
 */
export function sourceTransformChange(target: PreparedTransformTarget,
  finalTransform: Readonly<Transform>): SourceTransformChange | null {
  if (CHANNELS.some(channel => !Number.isFinite(finalTransform[channel]))) throw new RangeError('Transform values must be finite.')
  const edited = CHANNELS.filter(channel => Math.abs(finalTransform[channel] - target.transform[channel]) > 1e-8)
  if (!edited.length) return null
  const next = { ...target.originalLayer, transform: { ...target.originalLayer.transform } }
  for (const channel of edited) next.transform[channel] = finalTransform[channel]
  return { prev: target.originalLayer, next, changedProperties: edited.map(channel => `transform.${channel}`) }
}
