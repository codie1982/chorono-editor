import type { Track } from '@/lib/types'
import { parseTrackTarget } from './TrackTargetParser'

const EMPTY: readonly Track[] = Object.freeze([])

/**
 * Borrowed timeline snapshot indexed once by the canonical track-target parser.
 * Preserves input/duplicate-target ordering and keyframe identities. Rebuild
 * after track membership or target changes; never evaluates or mutates tracks.
 * forLayer is expected O(1) for canonical IDs. Legacy dotted/empty IDs retain the
 * original prefix-filter behavior via a deliberately slower compatibility path.
 */
export class LayerTrackIndex {
  private readonly byLayer = new Map<string, Track[]>()
  constructor(private readonly tracks: readonly Track[]) {
    for (const track of tracks) {
      const target = parseTrackTarget(track.target)
      if (target?.entityType !== 'layer' || !track.target.startsWith(`layers.${target.entityId}.`)) continue
      const entries = this.byLayer.get(target.entityId)
      if (entries) entries.push(track)
      else this.byLayer.set(target.entityId, [track])
    }
  }
  /** Readonly ordered view; unknown IDs borrow one shared empty array. */
  forLayer(id: string): readonly Track[] {
    return !id || id.includes('.') ? this.tracks.filter(track => track.target.startsWith(`layers.${id}.`)) : this.byLayer.get(id) ?? EMPTY
  }
}
