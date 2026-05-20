// ── Spline Object System Types ────────────────────────────────────────────────
//
// Defines the data model for `type: 'spline'` layers.
//
// Architecture:
//   SplineLayer
//     └─ SplinePathData
//           ├─ subShapes  — logical primitives (Rectangle, Circle, Star…)
//           ├─ contours   — BezierPath per contour (reuses existing anchor format)
//           └─ fillRule   — nonzero | evenodd (controls hole rendering)
//
// All spline primitives share the same Layer.type === 'spline'.
// The primitive kind lives inside SplineSubShape.kind.
//
// Design decision: Option B — existing `type: 'shape'` layers are UNCHANGED.
// Spline layers are a separate family bridged by the "Convert to Spline" command.

import type { BezierPath } from './path'

// ── Primitive kind ────────────────────────────────────────────────────────────

export type SplinePrimitiveKind =
  | 'line'
  | 'rectangle'
  | 'roundedRectangle'
  | 'circle'
  | 'ellipse'
  | 'arc'
  | 'donut'
  | 'ngon'
  | 'star'
  | 'textOutline'   // MVP-2 (BL-62)
  | 'helix'         // MVP-2
  | 'egg'           // MVP-2
  | 'freehand'      // MVP-2 (BL-66)
  | 'custom'        // drawn or imported path

// ── Combine mode ─────────────────────────────────────────────────────────────

/** How a SubShape's area combines with previously-rendered subShapes in the layer. */
export type SplineCombineMode =
  | 'add'       // union (default)
  | 'subtract'  // difference — creates holes (best used with evenodd fill rule)
  | 'intersect' // intersection — Level 2: requires path-boolean library
  | 'exclude'   // XOR          — Level 2: requires path-boolean library
  | 'none'      // standalone contour, no combine operation

// ── Generator param interfaces (one per primitive kind) ───────────────────────

export interface LineSplineParams {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface RectSplineParams {
  width:        number
  height:       number
  cornerRadius?: number
  /** '4-point' = sharp corners, '8-point' = chamfered, 'cubic-rounded' = smooth curves. Default '4-point'. */
  cornerMode?:  '4-point' | '8-point' | 'cubic-rounded'
}

export interface CircleSplineParams {
  radius: number
}

export interface EllipseSplineParams {
  radiusX: number
  radiusY: number
}

export interface ArcSplineParams {
  radius:     number
  startAngle: number  // degrees, 0 = 12 o'clock
  endAngle:   number  // degrees
}

export interface DonutSplineParams {
  outerRadius: number
  innerRadius: number
}

export interface NGonSplineParams {
  sides:      number  // 3–12
  radius:     number
  roundness?: number  // 0–1
}

export interface StarSplineParams {
  points:      number  // 3–12
  outerRadius: number
  innerRadius: number
  roundness?:  number  // 0–1
}

export interface HelixSplineParams {
  turns:       number
  startRadius: number
  endRadius:   number
  tightness?:  number  // radius interpolation exponent
}

export interface EggSplineParams {
  width:  number
  height: number
  factor: number  // asymmetry 0–1
}

export type SplineGeneratorParams =
  | LineSplineParams
  | RectSplineParams
  | CircleSplineParams
  | EllipseSplineParams
  | ArcSplineParams
  | DonutSplineParams
  | NGonSplineParams
  | StarSplineParams
  | HelixSplineParams
  | EggSplineParams

// ── SubShape ──────────────────────────────────────────────────────────────────

/**
 * One logical spline primitive inside a SplineLayer.
 *
 * Examples:
 *   - A rectangle inside a compound spline → kind:'rectangle', contourIds:['c_0']
 *   - A donut → kind:'donut', contourIds:['c_outer','c_inner']  (evenodd fill)
 *   - A text glyph 'O' → kind:'textOutline', contourIds:['c_outer','c_hole']
 *
 * `order` controls combine-mode rendering sequence (lower = drawn first).
 */
export interface SplineSubShape {
  id:   string
  name: string

  kind: SplinePrimitiveKind

  /** Render order for combine operations — lower = drawn first. */
  order: number

  /** IDs of BezierPath contours in SplinePathData.contours that belong to this sub-shape. */
  contourIds: string[]

  combineMode: SplineCombineMode

  /** How this sub-shape was created. */
  source: 'generated' | 'drawn' | 'convertedText' | 'imported' | 'edited'

  /**
   * Original creation parameters.
   * Set when source === 'generated', frozen when converted to editable.
   * Kept as metadata after conversion (for inspector display, undo, etc).
   */
  generatorParams?: SplineGeneratorParams

  /**
   * When false: parametric — generator params drive the contours at re-evaluation.
   * When true: editable — contours are owned directly; generatorParams are frozen metadata.
   */
  editable: boolean
}

// ── SplinePathData ────────────────────────────────────────────────────────────

/**
 * Complete spline data stored on a `type: 'spline'` layer.
 *
 * subShapes  — ordered by `SplineSubShape.order`, processed for combine mode
 * contours   — each is a BezierPath (reuses PathAnchor / handle format)
 * fillRule   — 'evenodd' makes inner contours (holes) transparent automatically
 */
export interface SplinePathData {
  subShapes: Record<string, SplineSubShape>
  contours:  Record<string, BezierPath>
  fillRule:  'nonzero' | 'evenodd'
}
