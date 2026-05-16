// ── PathTrimResolver ──────────────────────────────────────────────────────────
//
// Resolves a TrimPathDefinition into one OR TWO visible segments, expressed
// as normalised [0,1] ranges along the path. Handles wrap-around for
// 'movingSegment' mode (rotating light, worm trail) where the segment may
// straddle the path's end and reappear at the start.

import type { TrimPathDefinition } from '@/lib/types'

export interface TrimSegment {
  start: number   // 0–1
  end:   number   // 0–1
}

export class PathTrimResolver {
  /**
   * Returns the visible segment list. Usually one entry; two when a
   * 'movingSegment' window wraps around end-of-path.
   */
  resolve(trim: TrimPathDefinition): TrimSegment[] {
    const mode = trim.mode ?? 'static'

    if (mode === 'static') {
      const s = clamp01(trim.start + trim.offset)
      const e = clamp01(trim.end   + trim.offset)
      if (e <= s) return []
      return [{ start: s, end: e }]
    }

    // movingSegment: a fixed-length window that slides with offset.
    const segLen = clamp01(trim.segmentLength ?? 0.2)
    if (segLen <= 0) return []

    const start = wrap01(trim.offset)
    const end   = start + segLen
    if (end <= 1) return [{ start, end }]
    // Wrap-around — emit two segments
    return [
      { start,    end: 1            },
      { start: 0, end: end - 1      },
    ]
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function wrap01(v: number): number {
  // Map any real value into [0, 1) via modulo.
  return ((v % 1) + 1) % 1
}

export const defaultPathTrimResolver = new PathTrimResolver()
