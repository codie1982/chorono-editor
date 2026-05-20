// ── Runtime JSON Export ──────────────────────────────────────────────────────
// Strips editor-only metadata so the resulting JSON is the minimal scene the
// Chorono runtime (Android/iOS/WASM) needs to play back the animation.

import type {
  ChronoScene, Layer, Timeline, Track, Keyframe, Composition,
  Asset, Trigger, Binding, SceneParameter,
  StateMachineDefinition, ChronoSMState,
} from '../types'
import { bakeTrack } from '../animation/baking/bake'

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

export interface RuntimeScene {
  formatVersion: '1.0.0'
  composition: Composition
  assets: Asset[]
  layers: Layer[]
  timelines: Timeline[]
  triggers: Trigger[]
  bindings: Binding[]
  /** Runtime-tunable parameters — read by the host platform via setParam(). */
  parameters: SceneParameter[]
  /** Interactive state machines (BL-09). Present only when the scene defines
   *  any; editor-only node positions are stripped. */
  stateMachines?: StateMachineDefinition[]
  initialState: Record<string, unknown>
}

/**
 * Build a runtime-only scene from an editor scene.
 *
 *  - Removes editor meta: layer.locked / hidden / solo / colorLabel / name
 *  - Drops audio assets (runtime handles audio separately, not in this format)
 *  - Drops the `_kf` prefix from keyframe IDs (kept stable but compact)
 *  - Optionally snaps keyframe times to frame boundaries
 *  - Optionally collapses redundant consecutive identical keyframes
 */
export function exportToRuntime(scene: ChronoScene, opts: RuntimeExportOptions = {}): RuntimeScene {
  const {
    snapKeyframesToFrames = true,
    collapseIdenticalKeyframes = true,
    bakeSignalSystem = true,
    bakeFps = 60,
    bakeTolerance = 0.005,
  } = opts
  const frameRate = Math.max(1, scene.composition.frameRate)

  return {
    formatVersion: scene.formatVersion,
    composition:   scene.composition,
    // Drop audio assets — runtime audio engine is out-of-band
    assets: scene.assets.filter((a) => a.type !== 'audio'),
    // Drop audio layers + strip editor meta from the rest
    layers: scene.layers
      .filter((l) => l.type !== 'audio')
      .map(stripLayerMeta),
    timelines: scene.timelines.map((tl) => normaliseTimeline(tl, {
      frameRate, snapKeyframesToFrames, collapseIdenticalKeyframes,
      bakeSignalSystem, bakeFps, bakeTolerance, durationMs: tl.durationMs,
    })),
    triggers:     scene.triggers,
    bindings:     scene.bindings,
    parameters:   scene.parameters,
    // BL-09 — carry state machines into the runtime, minus editor node coords.
    ...(scene.stateMachines && scene.stateMachines.length > 0
      ? { stateMachines: scene.stateMachines.map(stripSMEditorMeta) }
      : {}),
    initialState: scene.initialState,
  }
}

// ── State machine cleanup ──────────────────────────────────────────────────────

/** Drop editor-only node positions from each state — runtime ignores them. */
function stripSMEditorMeta(sm: StateMachineDefinition): StateMachineDefinition {
  return {
    ...sm,
    states: sm.states.map((s): ChronoSMState => {
      const { x: _x, y: _y, ...rest } = s
      return rest
    }),
  }
}

// ── Layer cleanup ────────────────────────────────────────────────────────────

function stripLayerMeta(layer: Layer): Layer {
  // Drop editor-only flags. Keep `name` for runtime debug logs.
  // BL-55 — strip `frozen` (freeze is an editor-only authoring affordance,
  // runtime should treat the layer as fully selectable + opaque).
  const {
    locked: _l, hidden: _h, solo: _s, pinned: _p, colorLabel: _c,
    frozen: _f,
    ...rest
  } = layer
  return rest
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
function usesSignalSystem(track: Track): boolean {
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
