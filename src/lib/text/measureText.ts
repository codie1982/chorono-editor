// ── Text Measurement (BL-72 Phase 1) ─────────────────────────────────────────
//
// The Chorono renderer is IMMEDIATE-MODE: the canvas is fully repainted from
// scene state every frame, and the React/SVG selection overlay recomputes its
// rectangle from `selectedLayer` on every render. There is therefore no need
// for a retained-mode dirty-flag/invalidation system — bounds simply need to be
// DERIVED from the text's current style so they stay in sync automatically.
//
// The historic bug: a text layer was created WITHOUT a `size`, so the selection
// frame (which only renders when `layer.size` exists) never appeared, and the
// rulers/gizmos fell back to a hardcoded 120px width that ignored fontSize.
//
// Fix: measure the real glyph box with an offscreen `measureText` and store it
// as the layer's `size`. Every existing size-aware code path (SelectionFrame,
// hit-test via getLayerWorldBounds, resize handles, rulers, canvas outline)
// then "just works".

import type { TextStyle } from '@/lib/types/text'

export interface TextMetrics2D {
  width: number
  height: number
}

// Single reused offscreen context — measureText is cheap but allocating a
// canvas per call is not. `null` in SSR / non-DOM (Node test) environments.
let _measureCtx: CanvasRenderingContext2D | null | undefined

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (_measureCtx !== undefined) return _measureCtx
  if (typeof document === 'undefined') {
    _measureCtx = null
    return null
  }
  _measureCtx = document.createElement('canvas').getContext('2d')
  return _measureCtx
}

/** Canvas-free approximation. Used during SSR and in unit tests where jsdom
 *  does not implement the 2D context. Matches the renderer's single-line draw
 *  but tolerates explicit "\n" line breaks for forward-compatibility. */
function estimate(style: TextStyle): TextMetrics2D {
  const display = style.uppercase ? style.value.toUpperCase() : style.value
  const lines = display.split('\n')
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 0)
  const lineHeight = style.lineHeight ?? 1.2
  const letter = style.letterSpacing ?? 0
  return {
    width:  Math.max(1, Math.ceil(longest * style.fontSize * 0.55 + Math.max(0, longest - 1) * letter)),
    height: Math.max(1, Math.ceil(lines.length * style.fontSize * lineHeight)),
  }
}

/**
 * Measure the bounding box a text layer occupies in LOCAL space, given its
 * style. The box origin is the layer top-left (the renderer draws with
 * `textBaseline = 'top'` at local 0,0), so the returned width/height map
 * directly onto `layer.size`.
 *
 * Mirrors the renderer's draw logic in `renderer.ts:drawText`:
 *   - `ctx.font = "${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}"`
 *   - per-character advance + letterSpacing when letterSpacing !== 0
 *   - uppercase transform applied before measuring
 */
export function measureTextLayout(style: TextStyle): TextMetrics2D {
  const ctx = getMeasureContext()
  if (!ctx) return estimate(style)

  const {
    value, fontSize,
    fontFamily = 'sans-serif', fontWeight = 'normal', fontStyle = 'normal',
    letterSpacing = 0, lineHeight = 1.2, uppercase,
  } = style

  const display = uppercase ? value.toUpperCase() : value
  const lines = display.split('\n')
  ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`

  let maxWidth = 0
  for (const line of lines) {
    let w: number
    if (letterSpacing === 0) {
      w = ctx.measureText(line).width
    } else {
      w = 0
      for (const ch of Array.from(line)) w += ctx.measureText(ch).width + letterSpacing
      if (line.length > 0) w -= letterSpacing // no trailing gap after last glyph
    }
    if (w > maxWidth) maxWidth = w
  }

  // jsdom / broken contexts return width 0 for everything — fall back so the
  // box never collapses to a sliver.
  if (maxWidth <= 0) return estimate(style)

  return {
    width:  Math.max(1, Math.ceil(maxWidth)),
    height: Math.max(1, Math.ceil(lines.length * fontSize * lineHeight)),
  }
}

/**
 * Returns a copy of `layer` with `size` synced to its measured text box.
 * No-op (returns the SAME reference) when:
 *   - the layer is not a text layer, or
 *   - the measured box already matches the current size.
 *
 * Call this after any edit to a text layer's content or font metrics
 * (value / fontSize / fontFamily / fontWeight / fontStyle / letterSpacing /
 * lineHeight / uppercase) so the selection frame, hit area and gizmos track
 * the visible glyphs.
 */
export function syncTextLayerSize<
  T extends { type: string; text?: TextStyle; size?: { width: number; height: number } }
>(layer: T): T {
  if (layer.type !== 'text' || !layer.text) return layer
  const m = measureTextLayout(layer.text)
  if (layer.size && layer.size.width === m.width && layer.size.height === m.height) {
    return layer
  }
  return { ...layer, size: { width: m.width, height: m.height } }
}
