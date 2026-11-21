// ── RuntimeOptimizer ──────────────────────────────────────────────────────────
//
// Strips editor-only metadata and collapses redundant data BEFORE the JSON is
// shipped to the runtime player.
//
// Passes (in order):
//   1. compileRuntimeScene      — one canonical source/runtime field contract
//   2. normalizeKeyframes       — sort by timeMs, dedupe IDs
//   3. removeRedundantKeyframes — if 3 keyframes have identical value, drop
//                                 the middle one (cubic still passes through)

import type { ChronoScene, Track } from '../types'
import type { RuntimeAnimation } from '../types/runtime'
import { defaultRuntimeSceneCompiler, type RuntimeSceneCompiler } from './runtime/RuntimeSceneCompiler'

/**
 * Applies safe runtime track normalization after canonical scene compilation.
 * The compiler owns field selection and editor metadata; this class owns only
 * ordering/deduplication and redundant-key removal. Instances are stateless.
 */
export class RuntimeOptimizer {
  constructor(private readonly compiler: RuntimeSceneCompiler = defaultRuntimeSceneCompiler) {}

  optimize(scene: ChronoScene): RuntimeAnimation {
    let s = this.compiler.compile(scene)
    s = this.normalizeKeyframes(s)
    s = this.removeRedundantKeyframes(s)
    return s
  }

  // ── Pass 2: keyframe normalisation ───────────────────────────────────────

  private normalizeKeyframes(scene: RuntimeAnimation): RuntimeAnimation {
    return {
      ...scene,
      timelines: scene.timelines.map(tl => ({
        ...tl,
        tracks: tl.tracks.map(this.normaliseTrack),
      })),
    }
  }

  private normaliseTrack(track: Track): Track {
    // Sort by timeMs, defensive dedupe by id
    const seenIds = new Set<string>()
    const sorted = [...track.keyframes]
      .sort((a, b) => a.timeMs - b.timeMs)
      .filter(k => {
        if (seenIds.has(k.id)) return false
        seenIds.add(k.id)
        return true
      })
    return { ...track, keyframes: sorted }
  }

  // ── Pass 3: drop redundant flat-value keyframes ──────────────────────────

  private removeRedundantKeyframes(scene: RuntimeAnimation): RuntimeAnimation {
    return {
      ...scene,
      timelines: scene.timelines.map(tl => ({
        ...tl,
        tracks: tl.tracks.map(track => {
          if (track.keyframes.length < 3) return track
          const kept = [track.keyframes[0]]
          for (let i = 1; i < track.keyframes.length - 1; i++) {
            const prev = track.keyframes[i - 1]
            const curr = track.keyframes[i]
            const next = track.keyframes[i + 1]
            // Drop middle if all three values are identical AND easing is constant ('hold' or 'linear')
            if (
              prev.value === curr.value &&
              curr.value === next.value &&
              prev.easing.type === curr.easing.type
            ) {
              continue
            }
            kept.push(curr)
          }
          kept.push(track.keyframes[track.keyframes.length - 1])
          return { ...track, keyframes: kept }
        }),
      })),
    }
  }
}

export const defaultRuntimeOptimizer = new RuntimeOptimizer()
