// ── Runtime JSON Export ──────────────────────────────────────────────────────
// Strips editor-only metadata so the resulting JSON is the minimal scene the
// Chorono runtime (Android/iOS/WASM) needs to play back the animation.

import type { ChronoScene, Timeline, Track, Keyframe } from '../types'
import type { RuntimeAnimation } from '../types/runtime'
import { withoutAuthoring } from '../editor/authoring/AuthoringConverter'
import { bakeTrack } from '../animation/baking/bake'
import { defaultRuntimeSceneCompiler } from './runtime/RuntimeSceneCompiler'

// ── Public API ───────────────────────────────────────────────────────────────

export interface RuntimeExportOptions {
  /** Round keyframe times to the nearest frame boundary based on frameRate. */
  snapKeyframesToFrames?: boolean
  /** Drop two adjacent keyframes that have identical values (no animation between). */
  collapseIdenticalKeyframes?: boolean
  /** BL-51 — bake every track that uses the signal system (modifiers,
   *  out-of-range, easeCurve, timeWarp, multiplier curve, procedural
   *  controller) into a flat linear-easing keyframe array. Result: the
   *  exported JSON is consumable by a basic interpolation-only runtime.
   *  Default: true (safe choice — runtime parity guaranteed). */
  bakeSignalSystem?: boolean
  /** BL-51 — sample rate for the bake (Hz). Higher = smoother but more
   *  keyframes after RDP. Default 60. */
  bakeFps?: number
  /** BL-51 — RDP simplification tolerance in normalised bbox units.
   *  0 = no simplify (keep all samples). Typical: 0.005-0.02.
   *  Default: 0.005 (~0.5% of value range — visually lossless). */
  bakeTolerance?: number
}

export type RuntimeScene = RuntimeAnimation

/**
 * Build a runtime-only scene from an editor scene.
 *
 *  - Uses RuntimeSceneCompiler for one player-visible/source-only field policy
 *  - Drops audio assets (runtime handles audio separately, not in this format)
 *  - Optionally snaps keyframe times to frame boundaries
 *  - Optionally collapses redundant consecutive identical keyframes
 */
export function exportToRuntime(scene: ChronoScene, opts: RuntimeExportOptions = {}): RuntimeScene {
  if (scene.layers.some(layer => Object.keys(layer.propertyExpressions?.fields ?? {}).length)) throw new Error('Basic runtime export cannot evaluate live property expressions. Bake them to keyframes first, or use the Chorono Web runtime package.')
  const {
    snapKeyframesToFrames = true,
    collapseIdenticalKeyframes = true,
    bakeSignalSystem = true,
    bakeFps = 60,
    bakeTolerance = 0.005,
  } = opts
  scene = withoutAuthoring(scene)
  const compiled = defaultRuntimeSceneCompiler.compile(scene)
  const frameRate = Math.max(1, compiled.composition.frameRate)

  return {
    ...compiled,
    timelines: compiled.timelines.map((tl) => normaliseTimeline(tl, {
      frameRate, snapKeyframesToFrames, collapseIdenticalKeyframes,
      bakeSignalSystem, bakeFps, bakeTolerance, durationMs: tl.durationMs,
    })),
  }
}

// ── Timeline cleanup ─────────────────────────────────────────────────────────

interface NormaliseTimelineOpts {
  frameRate: number
  snapKeyframesToFrames: boolean
  collapseIdenticalKeyframes: boolean
  bakeSignalSystem: boolean
  bakeFps: number
  bakeTolerance: number
  durationMs: number
}

function normaliseTimeline(tl: Timeline, opts: NormaliseTimelineOpts): Timeline {
  return {
    ...tl,
    tracks: tl.tracks.map((t) => normaliseTrack(t, opts)),
  }
}

/** True if the track uses any BL-45..BL-50 feature that the basic runtime
 *  interpolator can't replay — these tracks must be baked before export. */
export function usesSignalSystem(track: Track): boolean {
  if (track.modifiers && track.modifiers.length > 0) return true
  if (track.controller && track.controller.type !== 'keyframe') return true
  if (track.outOfRange && (track.outOfRange.before !== 'constant' || track.outOfRange.after !== 'constant')) return true
  if (track.easeCurve || track.timeWarp || track.multiplierCurve) return true
  if (track.keyframes.some((k) => k.segmentModifiers && k.segmentModifiers.length > 0)) return true
  return false
}

function normaliseTrack(track: Track, opts: NormaliseTimelineOpts): Track {
  // BL-51: bake signal-system tracks down to keyframe-only equivalents so
  // the runtime never needs the modifier / noise / spring evaluators.
  let working = track
  if (opts.bakeSignalSystem && usesSignalSystem(track)) {
    working = bakeTrack(track, {
      startMs:  0,
      endMs:    opts.durationMs,
      fps:      opts.bakeFps,
      tolerance: opts.bakeTolerance,
    })
  }
  let kfs = [...working.keyframes].sort((a, b) => a.timeMs - b.timeMs)

  if (opts.snapKeyframesToFrames) {
    const frameMs = 1000 / opts.frameRate
    kfs = kfs.map((kf) => ({ ...kf, timeMs: Math.round(kf.timeMs / frameMs) * frameMs }))
  }

  if (opts.collapseIdenticalKeyframes) {
    kfs = collapseConsecutiveIdentical(kfs)
  }

  // Use `working` so baked tracks lose their signal-system fields too.
  // (bakeTrack already returns a stripped Track; spreading `working`
  // ensures we don't accidentally bring them back.)
  return { ...working, keyframes: kfs }
}

/**
 * If three consecutive keyframes carry the same value, the middle one is
 * redundant — playback interpolates identically without it. Drops the middle.
 */
function collapseConsecutiveIdentical(kfs: Keyframe[]): Keyframe[] {
  if (kfs.length < 3) return kfs
  const out: Keyframe[] = [kfs[0]]
  for (let i = 1; i < kfs.length - 1; i++) {
    const prev = kfs[i - 1]
    const curr = kfs[i]
    const next = kfs[i + 1]
    const sameValue = prev.value === curr.value && curr.value === next.value
    if (sameValue) continue
    out.push(curr)
  }
  out.push(kfs[kfs.length - 1])
  return out
}

// ── Convenience: stringify with stable ordering ──────────────────────────────

export function exportToRuntimeJSON(scene: ChronoScene, opts?: RuntimeExportOptions): string {
  return JSON.stringify(exportToRuntime(scene, opts), null, 2)
}
