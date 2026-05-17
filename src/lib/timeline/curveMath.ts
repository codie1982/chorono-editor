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
import { evaluateTrack } from '../evaluator'

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
export function buildCurvePath(track: Track, vp: CurveViewport): string {
  if (track.keyframes.length < 2) return ''
  const stepPx = 2
  const steps = Math.max(8, Math.floor(vp.widthPx / stepPx))
  const visMs = Math.max(1, vp.endMs - vp.startMs)
  let d = ''
  for (let i = 0; i <= steps; i++) {
    const tMs = vp.startMs + (i / steps) * visMs
    const v = evaluateTrack(track, tMs)
    if (v == null) continue
    const x = msToX(vp, tMs)
    const y = valueToY(vp, v)
    d += `${d ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)} `
  }
  return d.trim()
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
