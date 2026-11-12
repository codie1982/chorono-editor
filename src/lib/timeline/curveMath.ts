// ── Curve Editor math ───────────────────────────────────────────────────────
// Pure helpers used by <CurveEditor /> to draw multiple animated tracks as
// overlaid curves on a shared X (time) and Y (value) plot. Mirrors the
// 3ds Max / After Effects "graph editor" mental model:
//
//   X axis  →  time (ms)
//   Y axis  →  property value
//   colour  →  property identity (X red, Y green, scale lime, etc.)
//
// All functions are O(track keyframes) and side-effect free so they're safe
// to call from React render without memo overhead.

import type { Track } from '../types'
import { createNumericTrackSampler } from '../evaluator'

// ── Track colour palette ────────────────────────────────────────────────────
// 3ds Max convention: position X = red, position Y = green, position Z = blue.
// We adopt the same colouring so muscle memory carries over. Everything else
// gets a sensible distinct hue.
const COLOR_MAP: Record<string, string> = {
  'transform.x':            '#ef4444',  // red
  'transform.y':            '#22c55e',  // green
  'transform.scaleX':       '#f97316',  // orange
  'transform.scaleY':       '#84cc16',  // lime
  'transform.rotationDeg':  '#eab308',  // yellow
  'opacity':                '#e5e7eb',  // near-white
  'effects.blur':           '#06b6d4',  // cyan
  'effects.brightness':     '#a855f7',  // purple
  'effects.contrast':       '#ec4899',  // pink
  'effects.saturate':       '#14b8a6',  // teal
  'style.fill.opacity':     '#60a5fa',  // blue
  'style.stroke.width':     '#fb923c',  // amber
  'style.stroke.opacity':   '#fda4af',  // rose
  'style.cornerRadius':     '#c084fc',  // violet
  'text.fontSize':          '#fbbf24',  // gold
  'text.letterSpacing':     '#fcd34d',  // pale gold
  'motionPath.offset':      '#94a3b8',  // slate
}
const FALLBACK_COLORS = ['#38bdf8', '#a3e635', '#f472b6', '#fb7185', '#facc15']

export function pickTrackColor(trackTarget: string, idx: number): string {
  // Strip 'layers.<id>.' prefix to get the property path
  const propPath = trackTarget.replace(/^layers\.[^.]+\./, '')
  return COLOR_MAP[propPath] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length]
}

// ── Value range ─────────────────────────────────────────────────────────────

export interface ValueRange { min: number; max: number }

/** Union of value ranges across multiple tracks — used so all curves share
 *  the same Y scale and you can compare amplitudes by eye. */
export function unionValueRange(tracks: Track[]): ValueRange | null {
  let min = Infinity
  let max = -Infinity
  for (const tr of tracks) {
    for (const kf of tr.keyframes) {
      if (typeof kf.value !== 'number') continue
      if (kf.value < min) min = kf.value
      if (kf.value > max) max = kf.value
    }
  }
  if (min === Infinity) return null
  // Pad ±5% so the extremes don't kiss the chart edge; if perfectly flat,
  // widen by ±1 so the line has somewhere to draw.
  if (min === max) return { min: min - 1, max: max + 1 }
  const pad = (max - min) * 0.05
  return { min: min - pad, max: max + pad }
}

// ── Coordinate mapping ──────────────────────────────────────────────────────

export interface CurveViewport {
  startMs:  number
  endMs:    number
  range:    ValueRange
  widthPx:  number
  heightPx: number
}

export function msToX(vp: CurveViewport, timeMs: number): number {
  const span = Math.max(1, vp.endMs - vp.startMs)
  return ((timeMs - vp.startMs) / span) * vp.widthPx
}

export function xToMs(vp: CurveViewport, x: number): number {
  const span = Math.max(1, vp.endMs - vp.startMs)
  return vp.startMs + (x / vp.widthPx) * span
}

export function valueToY(vp: CurveViewport, v: number): number {
  const span = Math.max(0.0001, vp.range.max - vp.range.min)
  const norm = (v - vp.range.min) / span
  // SVG Y axis inverted — high values at the top
  return vp.heightPx - norm * vp.heightPx
}

export function yToValue(vp: CurveViewport, y: number): number {
  const span = Math.max(0.0001, vp.range.max - vp.range.min)
  const norm = (vp.heightPx - y) / vp.heightPx
  return vp.range.min + norm * span
}

// ── Curve path sampling ─────────────────────────────────────────────────────

/**
 * Sample a track's interpolated value at ~one sample per 2 px and emit an
 * SVG path `d`. We *sample* rather than draw cubic-bezier segments so the
 * line reflects the track's actual easing (incl. customBezier) — a single
 * source of truth between evaluator and the on-screen curve.
 */
// ── LRU cache (BL-42) ──────────────────────────────────────────────────────
// CurveEditor re-renders every viewport pan/zoom/scrub. Each render calls
// buildCurvePath for every visible track — and the sampler does N evaluator
// calls (where N ~= viewport width / 2px). With many tracks this dominates.
//
// We exploit two facts:
//   1. Scene immutability — same `track` ref means same keyframes/easing.
//   2. Viewport changes are bursty (drag, wheel) but the value space is
//      coarse: rounding (startMs, endMs, widthPx, range.min, range.max)
//      gives a stable cache key without changing visible output (we already
//      .toFixed(1) the path coordinates).
//
// Implementation: WeakMap<Track, Map<viewportKey, path>>. The outer
// WeakMap auto-evicts when a Track is GC'd. Per-track inner map is capped
// to 12 entries (zoom levels users actually visit) with simple FIFO
// eviction — when a new entry pushes over the cap, the oldest is dropped.

const CACHE_PER_TRACK_LIMIT = 12
const pathCache = new WeakMap<Track, Map<string, string>>()

function viewportKey(vp: CurveViewport): string {
  // Round to 1ms / 1px / 0.001 value precision — finer than the visible
  // path resolution so cached output is pixel-identical.
  return [
    Math.round(vp.startMs),
    Math.round(vp.endMs),
    Math.round(vp.widthPx),
    Math.round(vp.heightPx),
    vp.range.min.toFixed(3),
    vp.range.max.toFixed(3),
  ].join(':')
}

export function buildCurvePath(track: Track, vp: CurveViewport): string {
  if (track.keyframes.length < 2 && (!track.controller || track.controller.type === 'keyframe')) return ''

  let perTrack = pathCache.get(track)
  if (!perTrack) {
    perTrack = new Map()
    pathCache.set(track, perTrack)
  }
  const key = viewportKey(vp)
  const cached = perTrack.get(key)
  if (cached !== undefined) return cached

  // Miss — sample.
  const stepPx = 2
  const steps = Math.max(8, Math.min(2048, Math.floor(vp.widthPx / stepPx)))
  const sample = createNumericTrackSampler(track)
  const visMs = Math.max(1, vp.endMs - vp.startMs)
  let d = ''
  let connected = false
  for (let i = 0; i <= steps; i++) {
    const tMs = vp.startMs + (i / steps) * visMs
    const v = sample(tMs)
    if (v == null) { connected = false; continue }
    const x = msToX(vp, tMs)
    const y = valueToY(vp, v)
    d += `${connected ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)} `
    connected = true
  }
  const out = d.trim()

  // FIFO eviction — drop the oldest if we just crossed the cap.
  if (perTrack.size >= CACHE_PER_TRACK_LIMIT) {
    const firstKey = perTrack.keys().next().value
    if (firstKey !== undefined) perTrack.delete(firstKey)
  }
  perTrack.set(key, out)
  return out
}

// ── Out-of-range path segmentation (BL-45) ─────────────────────────────────
// Same sampler as buildCurvePath, but emits THREE separate path strings split
// by where each sample falls relative to the track's keyframe range:
//
//   before  = [viewport start, first keyframe time)   → rendered dashed
//   inRange = [first keyframe time, last keyframe time] → rendered solid
//   after   = (last keyframe time, viewport end]      → rendered dashed
//
// CurveEditor consumes this to draw out-of-range extrapolation (cycle / loop
// / pingPong / linear / relativeRepeat) with a different visual style so the
// user can see at a glance which part of the curve is "real" vs "derived".
//
// Single keyframe → entire viewport is "after" (no in-range span). No keyframes
// → all-empty result.

export interface CurvePathSegments {
  before:       string
  inRange:      string
  after:        string
  /** Pixel X of the range boundary lines (null if outside viewport). */
  rangeStartX:  number | null
  rangeEndX:    number | null
}

export function buildCurvePathSegments(track: Track, vp: CurveViewport): CurvePathSegments {
  const empty: CurvePathSegments = {
    before: '', inRange: '', after: '', rangeStartX: null, rangeEndX: null,
  }
  if (track.controller && track.controller.type !== 'keyframe') return { ...empty, inRange: buildCurvePath(track, vp) }
  if (track.keyframes.length < 1) return empty

  const sortedKfs = [...track.keyframes].sort((a, b) => a.timeMs - b.timeMs)
  const rangeStart = sortedKfs[0].timeMs
  const rangeEnd   = sortedKfs[sortedKfs.length - 1].timeMs

  const stepPx = 2
  const steps = Math.max(8, Math.min(2048, Math.floor(vp.widthPx / stepPx)))
  const sample = createNumericTrackSampler(track)
  const visMs = Math.max(1, vp.endMs - vp.startMs)

  type Seg = 'before' | 'inRange' | 'after'
  const segments: Record<Seg, string> = { before: '', inRange: '', after: '' }
  let prevSeg: Seg | null = null

  for (let i = 0; i <= steps; i++) {
    const tMs = vp.startMs + (i / steps) * visMs
    const v = sample(tMs)
    if (v == null) { prevSeg = null; continue }
    const x = msToX(vp, tMs)
    const y = valueToY(vp, v)
    const coord = `${x.toFixed(1)} ${y.toFixed(1)} `

    const currentSeg: Seg =
      tMs < rangeStart ? 'before' :
      tMs > rangeEnd   ? 'after'  : 'inRange'

    if (prevSeg !== null && prevSeg !== currentSeg) {
      // Boundary crossing — extend prev segment to this point, then start the
      // new segment at the same point so the two visually connect.
      segments[prevSeg] += `L ${coord}`
      segments[currentSeg] += `M ${coord}`
    } else {
      segments[currentSeg] += `${prevSeg === currentSeg ? 'L' : 'M'} ${coord}`
    }

    prevSeg = currentSeg
  }

  const inView = (ms: number) => ms >= vp.startMs && ms <= vp.endMs

  return {
    before:       segments.before.trim(),
    inRange:      segments.inRange.trim(),
    after:        segments.after.trim(),
    rangeStartX:  inView(rangeStart) ? msToX(vp, rangeStart) : null,
    rangeEndX:    inView(rangeEnd)   ? msToX(vp, rangeEnd)   : null,
  }
}

/** True if the track has any non-constant out-of-range behavior. Cheap guard
 *  so CurveEditor can fall through to the cached `buildCurvePath` path when
 *  there's nothing special to show. */
export function hasNonConstantOutOfRange(track: Track): boolean {
  const oor = track.outOfRange
  if (!oor) return false
  return (oor.before && oor.before !== 'constant') ||
         (oor.after  && oor.after  !== 'constant')
         ? true : false
}

// ── Axis tick generation ────────────────────────────────────────────────────

const NICE_TIME_STEPS_MS = [
  50, 100, 200, 500, 1000, 2000, 5000, 10000, 30000, 60000,
]

/** Pick a "nice" interval so we get ~5-10 labels across the visible range. */
export function pickTimeTickMs(rangeMs: number): number {
  const target = rangeMs / 8
  for (const s of NICE_TIME_STEPS_MS) if (s >= target) return s
  return NICE_TIME_STEPS_MS[NICE_TIME_STEPS_MS.length - 1]
}

export function pickValueTick(range: ValueRange): number {
  const span = range.max - range.min
  if (span <= 0) return 1
  // Mantissa/exponent split → round to nearest 1, 2, 5 × 10^n
  const raw = span / 6
  const exp = Math.floor(Math.log10(raw))
  const mant = raw / 10 ** exp
  const niceMant = mant < 1.5 ? 1 : mant < 3.5 ? 2 : mant < 7.5 ? 5 : 10
  return niceMant * 10 ** exp
}

/** Pretty-print a tick value with at most 2 decimals, trimming trailing 0s. */
export function formatTickValue(v: number): string {
  return Math.abs(v) >= 100 ? v.toFixed(0)
       : Math.abs(v) >= 1   ? v.toFixed(1).replace(/\.0$/, '')
       : v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

// ── Value snap ──────────────────────────────────────────────────────────────
//
// Per-property snap targets for the vertical (value) axis. Returns common
// "round" values that users almost always want to land on: 90° for rotation,
// 0/1 for opacity, integer scales, etc. Threshold is in screen px so the
// snap feels consistent regardless of how zoomed in/out the Y axis is.
//
// Returns the snapped value when a target is within `thresholdPx`, otherwise
// the raw value untouched. `target` is set to the chosen snap point (or null)
// so callers can show a visual indicator.

/** Common values for a given track target, derived from the property suffix. */
export function getValueSnapTargets(trackTarget: string): number[] {
  const prop = trackTarget.replace(/^layers\.[^.]+\./, '')
  if (prop.includes('rotation')) {
    return [0, 45, 90, 135, 180, 225, 270, 315, 360, -45, -90, -135, -180, -225, -270, -315, -360]
  }
  if (prop === 'opacity' || prop.endsWith('.opacity')) {
    return [0, 0.25, 0.5, 0.75, 1]
  }
  if (prop.includes('scale')) {
    return [0, 0.25, 0.5, 1, 1.5, 2, 3]
  }
  return []
}

export function snapValue(
  trackTarget: string,
  rawValue:    number,
  vp:          CurveViewport,
  thresholdPx: number = 8,
): { value: number; snapped: boolean; target: number | null } {
  const targets = getValueSnapTargets(trackTarget)
  if (targets.length === 0) return { value: rawValue, snapped: false, target: null }
  const pxPerValue = vp.heightPx / Math.max(0.0001, vp.range.max - vp.range.min)
  let best: { target: number; dpx: number } | null = null
  for (const t of targets) {
    const dpx = Math.abs((rawValue - t) * pxPerValue)
    if (dpx <= thresholdPx && (!best || dpx < best.dpx)) best = { target: t, dpx }
  }
  return best
    ? { value: best.target, snapped: true, target: best.target }
    : { value: rawValue, snapped: false, target: null }
}
