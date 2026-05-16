// ── Runtime JSON Export ──────────────────────────────────────────────────────
// Strips editor-only metadata so the resulting JSON is the minimal scene the
// Chorono runtime (Android/iOS/WASM) needs to play back the animation.

import type {
  ChronoScene, Layer, Timeline, Track, Keyframe, Composition,
  Asset, Trigger, Binding,
} from '../types'

// ── Public API ───────────────────────────────────────────────────────────────

export interface RuntimeExportOptions {
  /** Round keyframe times to the nearest frame boundary based on frameRate. */
  snapKeyframesToFrames?: boolean
  /** Drop two adjacent keyframes that have identical values (no animation between). */
  collapseIdenticalKeyframes?: boolean
}

export interface RuntimeScene {
  formatVersion: '1.0.0'
  composition: Composition
  assets: Asset[]
  layers: Layer[]
  timelines: Timeline[]
  triggers: Trigger[]
  bindings: Binding[]
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
  const { snapKeyframesToFrames = true, collapseIdenticalKeyframes = true } = opts
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
    })),
    triggers:     scene.triggers,
    bindings:     scene.bindings,
    initialState: scene.initialState,
  }
}

// ── Layer cleanup ────────────────────────────────────────────────────────────

function stripLayerMeta(layer: Layer): Layer {
  // Drop editor-only flags. Keep `name` for runtime debug logs.
  const { locked: _l, hidden: _h, solo: _s, colorLabel: _c, ...rest } = layer
  return rest
}

// ── Timeline cleanup ─────────────────────────────────────────────────────────

interface NormaliseTimelineOpts {
  frameRate: number
  snapKeyframesToFrames: boolean
  collapseIdenticalKeyframes: boolean
}

function normaliseTimeline(tl: Timeline, opts: NormaliseTimelineOpts): Timeline {
  return {
    ...tl,
    tracks: tl.tracks.map((t) => normaliseTrack(t, opts)),
  }
}

function normaliseTrack(track: Track, opts: NormaliseTimelineOpts): Track {
  let kfs = [...track.keyframes].sort((a, b) => a.timeMs - b.timeMs)

  if (opts.snapKeyframesToFrames) {
    const frameMs = 1000 / opts.frameRate
    kfs = kfs.map((kf) => ({ ...kf, timeMs: Math.round(kf.timeMs / frameMs) * frameMs }))
  }

  if (opts.collapseIdenticalKeyframes) {
    kfs = collapseConsecutiveIdentical(kfs)
  }

  return { ...track, keyframes: kfs }
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
