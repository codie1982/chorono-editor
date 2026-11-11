// ── RuntimeOptimizer ──────────────────────────────────────────────────────────
//
// Strips editor-only metadata and collapses redundant data BEFORE the JSON is
// shipped to the runtime player.
//
// Passes (in order):
//   1. removeEditorMetadata     — drop locked / hidden / solo / colorLabel /
//                                 internalGrid / paramBindings (UI editor state)
//   2. normalizeKeyframes       — sort by timeMs, dedupe IDs
//   3. removeRedundantKeyframes — if 3 keyframes have identical value, drop
//                                 the middle one (cubic still passes through)
//   4. packAssets               — already lean; placeholder for future binary pack

import { withoutAuthoring } from '../editor/authoring/AuthoringConverter'
import type { ChronoScene, Layer, Track } from '../types'
import type { RuntimeAnimation } from '../types/runtime'

export class RuntimeOptimizer {
  optimize(scene: ChronoScene): RuntimeAnimation {
    let s = withoutAuthoring(scene)
    s = this.removeEditorMetadata(s)
    s = this.normalizeKeyframes(s)
    s = this.removeRedundantKeyframes(s)
    return {
      formatVersion: '1.0.0',
      composition:   s.composition,
      layers:        s.layers,
      timelines:     s.timelines,
      parameters:    s.parameters ?? [],
      triggers:      s.triggers,
      bindings:      s.bindings,
    }
  }

  // ── Pass 1: strip editor-only fields ─────────────────────────────────────

  private removeEditorMetadata(scene: ChronoScene): ChronoScene {
    return {
      ...scene,
      layers: scene.layers.map(l => {
        const {
          locked: _l, hidden: _h, solo: _s, pinned: _p, colorLabel: _c, internalGrid: _g, inputExpressions: _inputs,
          ...keep
        } = l
        return keep as Layer
      }),
    }
  }

  // ── Pass 2: keyframe normalisation ───────────────────────────────────────

  private normalizeKeyframes(scene: ChronoScene): ChronoScene {
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

  private removeRedundantKeyframes(scene: ChronoScene): ChronoScene {
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
