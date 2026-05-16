// ── SVG Import Types ──────────────────────────────────────────────────────────
//
// Types shared between the SvgImporter pipeline and the rest of the editor.
// Layer creation is delegated to existing Chorono types — we just describe
// the import process: options, warnings, the per-walk context.

import type { Layer } from './core'
import type { Matrix2D } from '@/lib/geometry/Matrix2D'

// ── Options & Result ──────────────────────────────────────────────────────────

export interface SvgImportOptions {
  /**
   * Position offset applied to every imported layer (composition coords).
   * Useful when dropping a file at the cursor location.
   */
  offsetX?: number
  offsetY?: number

  /**
   * Uniform scale applied to the whole imported group. Default 1.
   * Useful when the SVG viewBox is larger than the composition.
   */
  scale?: number

  /**
   * If true, single-path SVGs are imported as ONE PathLayer instead of being
   * wrapped in a Group. Default true.
   */
  flattenSingle?: boolean

  /**
   * Maximum number of layers to import. Stops walking once reached and emits
   * a 'LIMIT_REACHED' warning. Default Infinity.
   */
  maxLayers?: number
}

export interface SvgImportResult {
  layers:   Layer[]
  /** SVG's intrinsic width (px). Falls back to viewBox.width. */
  width:    number
  /** SVG's intrinsic height (px). Falls back to viewBox.height. */
  height:   number
  viewBox?: SvgViewBox
  warnings: SvgImportWarning[]
}

export interface SvgViewBox {
  x:      number
  y:      number
  width:  number
  height: number
}

// ── Warnings ──────────────────────────────────────────────────────────────────

/**
 * Non-fatal issues encountered during import. SVG import NEVER fails silently —
 * every unsupported feature emits a warning so the user knows what was lost.
 */
export type SvgImportWarningCode =
  | 'UNSUPPORTED_ELEMENT'   // <text>, <filter>, <use>, <symbol>, etc.
  | 'UNSUPPORTED_STYLE'     // unsupported paint server, filter, etc.
  | 'UNSUPPORTED_FILTER'    // SVG filter primitives
  | 'UNSUPPORTED_TRANSFORM' // unusual transform function (matrix3d, skewX with bad args)
  | 'GRADIENT_FALLBACK'     // gradient downgraded to solid fill
  | 'TEXT_IGNORED'          // <text> nodes ignored in V1
  | 'MASK_FALLBACK'         // <mask>/<clipPath> simplified or ignored
  | 'INVALID_PATH_DATA'     // unparseable `d` attribute
  | 'LIMIT_REACHED'         // maxLayers cap hit
  | 'EMPTY_DOCUMENT'        // SVG had no renderable children

export interface SvgImportWarning {
  code:     SvgImportWarningCode
  message:  string
  /** Tag name of the offending element when applicable. */
  nodeName?: string
}

// ── Import Context ────────────────────────────────────────────────────────────

/**
 * Carried down through the SVG tree walk. Each `<g>` pushes a new context
 * with the composed transform; leaf converters read it to compute final
 * layer coordinates.
 *
 * Pure data — no DOM references. Push/pop is handled by SvgNodeConverter.
 */
export interface SvgImportContext {
  /** Composed transform from root to current node. */
  transform: Matrix2D
  /** Inherited fill colour (CSS-style cascade). */
  fill?: string
  /** Inherited stroke colour. */
  stroke?: string
  /** Inherited stroke width (px in user space). */
  strokeWidth?: number
  /** Inherited opacity (0–1) — multiplicative through the tree. */
  opacity: number
  /** Counter used to enforce maxLayers. */
  layerCount: number
  /** Mutable warning sink — accumulated during walk. */
  warnings: SvgImportWarning[]
}
