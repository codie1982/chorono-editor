// ── SVGAnimationBuilder ───────────────────────────────────────────────────────
//
// BL-84 (animated) — turns a layer's timeline tracks into SMIL animation
// elements (<animateTransform> / <animate>) for self-playing SVG.
//
// Transform model mirrors CanvasRenderer's order exactly:
//   translate(x+ax, y+ay) · rotate(deg) · scale(sx, sy) · translate(-ax, -ay)
// Each component is emitted as an additive="sum" <animateTransform> so they
// compose into one transform list; the trailing translate(-ax,-ay) lives on the
// content element. Rotation pivot is 0,0 because we have already translated to
// the anchor — identical to the canvas pipeline.
//
// V1 scope: translate (x/y), rotate, scale, opacity. Easing is sampled at
// keyframe times and linearly interpolated between (calcMode=linear). Colour
// and per-segment easing curves are deferred.

import type { Timeline, Track, Layer } from '@/lib/types'
import { evaluateTrack } from '@/lib/evaluator'
import { num } from './SVGStyleBuilder'

export interface LayerAnimations {
  /** Concatenated <animateTransform> elements (translate/rotate/scale). */
  transformAnims: string
  /** <animate attributeName="opacity"> element, or '' when not animated. */
  opacityAnim: string
}

function findTrack(timelines: Timeline[], target: string): Track | null {
  for (const tl of timelines) {
    for (const tr of tl.tracks) {
      if (tr.target === target && tr.keyframes.length > 0) return tr
    }
  }
  return null
}

/** Union of keyframe times across the given tracks, clamped to [0, durationMs]
 *  and always including the 0 and duration endpoints (so SMIL keyTimes span
 *  the full 0→1 range and the value holds outside the keyframed region). */
function sampleTimes(tracks: Track[], durationMs: number): number[] {
  const set = new Set<number>([0, durationMs])
  for (const t of tracks) {
    for (const k of t.keyframes) {
      if (k.timeMs >= 0 && k.timeMs <= durationMs) set.add(k.timeMs)
    }
  }
  return Array.from(set).sort((a, b) => a - b)
}

function sampleAt(track: Track | null, timeMs: number, base: number): number {
  if (!track) return base
  const v = evaluateTrack(track, timeMs)
  return v ?? base
}

function attrTimes(times: number[], durationMs: number): string {
  return times.map((t) => num(durationMs > 0 ? t / durationMs : 0, 4)).join(';')
}

function animateTransform(
  type: 'translate' | 'rotate' | 'scale',
  values: string,
  keyTimes: string | null,
  dur: string,
): string {
  const kt = keyTimes ? ` keyTimes="${keyTimes}"` : ''
  return `<animateTransform attributeName="transform" type="${type}" additive="sum" ` +
    `values="${values}"${kt} dur="${dur}" repeatCount="indefinite"/>`
}

/**
 * Collect SMIL animations for one layer. Returns null when the layer has no
 * animated transform/opacity tracks (caller then emits a static element).
 */
export function collectLayerAnimations(
  layer: Layer,
  timelines: Timeline[],
  durationMs: number,
): LayerAnimations | null {
  const id = layer.id
  const xT  = findTrack(timelines, `layers.${id}.transform.x`)
  const yT  = findTrack(timelines, `layers.${id}.transform.y`)
  const rT  = findTrack(timelines, `layers.${id}.transform.rotationDeg`)
  const sxT = findTrack(timelines, `layers.${id}.transform.scaleX`)
  const syT = findTrack(timelines, `layers.${id}.transform.scaleY`)
  const oT  = findTrack(timelines, `layers.${id}.opacity`)

  const animTranslate = !!(xT || yT)
  const animRotate    = !!rT
  const animScale     = !!(sxT || syT)
  const animOpacity   = !!oT
  if (!animTranslate && !animRotate && !animScale && !animOpacity) return null

  const t = layer.transform
  const dur = `${num(durationMs / 1000, 4)}s`
  const parts: string[] = []

  // ── translate — always emitted (carries the layer position) ─────────────────
  if (animTranslate) {
    const times = sampleTimes([xT, yT].filter(Boolean) as Track[], durationMs)
    const values = times
      .map((tm) => `${num(sampleAt(xT, tm, t.x) + t.anchorX)},${num(sampleAt(yT, tm, t.y) + t.anchorY)}`)
      .join(';')
    parts.push(animateTransform('translate', values, attrTimes(times, durationMs), dur))
  } else {
    parts.push(animateTransform('translate', `${num(t.x + t.anchorX)},${num(t.y + t.anchorY)}`, null, dur))
  }

  // ── rotate — only when non-identity or animated (pivot 0,0) ─────────────────
  if (animRotate) {
    const times = sampleTimes([rT!], durationMs)
    const values = times.map((tm) => `${num(sampleAt(rT, tm, t.rotationDeg))} 0 0`).join(';')
    parts.push(animateTransform('rotate', values, attrTimes(times, durationMs), dur))
  } else if (t.rotationDeg !== 0) {
    parts.push(animateTransform('rotate', `${num(t.rotationDeg)} 0 0`, null, dur))
  }

  // ── scale — only when non-identity or animated ──────────────────────────────
  if (animScale) {
    const times = sampleTimes([sxT, syT].filter(Boolean) as Track[], durationMs)
    const values = times
      .map((tm) => `${num(sampleAt(sxT, tm, t.scaleX))},${num(sampleAt(syT, tm, t.scaleY))}`)
      .join(';')
    parts.push(animateTransform('scale', values, attrTimes(times, durationMs), dur))
  } else if (t.scaleX !== 1 || t.scaleY !== 1) {
    parts.push(animateTransform('scale', `${num(t.scaleX)},${num(t.scaleY)}`, null, dur))
  }

  // ── opacity ─────────────────────────────────────────────────────────────────
  let opacityAnim = ''
  if (animOpacity) {
    const times = sampleTimes([oT!], durationMs)
    const values = times.map((tm) => num(Math.max(0, sampleAt(oT, tm, layer.opacity)))).join(';')
    opacityAnim =
      `<animate attributeName="opacity" values="${values}" ` +
      `keyTimes="${attrTimes(times, durationMs)}" dur="${dur}" repeatCount="indefinite"/>`
  }

  return { transformAnims: parts.join('\n'), opacityAnim }
}
