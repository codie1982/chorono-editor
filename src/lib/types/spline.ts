// ── Spline Object System Types (granular model) ───────────────────────────────
//
// Data model for `type: 'spline'` layers. Unlike basic shapes, splines are
// point-based editable paths. The model is fully NORMALIZED — points, handles,
// segments and contours are stored as id-keyed records so the editor can hold
// stable selection state and undo individual elements.
//
//   SplineLayer
//     └─ SplinePathData
//           ├─ subShapes  — logical primitives (Rectangle, Circle, glyph…)
//           ├─ points     — on-curve anchors (id-keyed)
//           ├─ handles    — bezier control handles (id-keyed, ref a point)
//           ├─ segments   — connections between points (id-keyed)
//           ├─ contours   — ordered point/segment loops (id-keyed)
//           └─ fillRule   — nonzero | evenodd
//
// Handles are CANONICAL for cubic curves: a cubic segment A→B uses A's 'out'
// handle as control1 and B's 'in' handle as control2. Segment.control1/2 are
// only used for quadratic segments.
//
// Option B: existing `type: 'shape'` layers are UNCHANGED. Splines are a
// separate family bridged by the "Convert to Spline" command.

// ── Enums ─────────────────────────────────────────────────────────────────────

export type SplinePointType =
  | 'corner'        // no handles — sharp
  | 'smooth'        // handles collinear, lengths independent
  | 'bezier'        // handles collinear AND equal length (mirror)
  | 'bezierCorner'  // handles fully independent

export type SplineSegmentType =
  | 'line'
  | 'quadratic'
  | 'cubic'

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
  | 'textOutline'
  | 'spiral'
  | 'helix'
  | 'egg'
  | 'freehand'
  | 'custom'

export type SplineCombineMode =
  | 'add'
  | 'subtract'
  | 'intersect'
  | 'exclude'
  | 'none'

// ── Granular elements ─────────────────────────────────────────────────────────

export interface SplinePoint {
  id:    string
  x:     number
  y:     number
  type:  SplinePointType
  locked?: boolean
}

export interface SplineHandle {
  id:      string
  pointId: string
  kind:    'in' | 'out'
  x:       number
  y:       number
  locked:  boolean
}

export interface SplineSegment {
  id:          string
  fromPointId: string
  toPointId:   string
  type:        SplineSegmentType
  /** Quadratic control point (cubic derives controls from point handles). */
  control1?:   { x: number; y: number }
  control2?:   { x: number; y: number }
}

export interface SplineContour {
  id:         string
  closed:     boolean
  pointIds:   string[]
  segmentIds: string[]
}

// ── Generator params (typed per primitive) ────────────────────────────────────

export interface LineSplineParams    { x1: number; y1: number; x2: number; y2: number }
export interface RectSplineParams     { width: number; height: number; cornerRadius?: number; cornerMode?: 'sharp' | 'chamfered' | 'rounded' }
export interface CircleSplineParams   { radius: number }
export interface EllipseSplineParams  { radiusX: number; radiusY: number }
export interface ArcSplineParams      { radius: number; startAngle: number; endAngle: number }
export interface DonutSplineParams    { outerRadius: number; innerRadius: number }
export interface NGonSplineParams     { sides: number; radius: number; roundness?: number }
export interface StarSplineParams     { points: number; outerRadius: number; innerRadius: number; roundness?: number }
export interface SpiralSplineParams   { turns: number; startRadius: number; endRadius: number; pointsPerTurn?: number }
export interface HelixSplineParams    { turns: number; startRadius: number; endRadius: number; pointsPerTurn?: number }
export interface EggSplineParams      { width: number; height: number; factor: number }

export type SplineGeneratorParams =
  | LineSplineParams | RectSplineParams | CircleSplineParams | EllipseSplineParams
  | ArcSplineParams | DonutSplineParams | NGonSplineParams | StarSplineParams
  | SpiralSplineParams | HelixSplineParams | EggSplineParams

// ── SubShape ──────────────────────────────────────────────────────────────────

export interface SplineSubShape {
  id:   string
  name: string
  kind: SplinePrimitiveKind
  source: 'generated' | 'drawn' | 'convertedText' | 'imported' | 'edited'
  contourIds: string[]
  combineMode: SplineCombineMode
  /** Original creation params; frozen metadata once the sub-shape is edited. */
  generatorParams?: SplineGeneratorParams
  /** false = parametric (params drive geometry). true = points are canonical. */
  editable: boolean
}

// ── Root ──────────────────────────────────────────────────────────────────────

export interface SplinePathData {
  subShapes: Record<string, SplineSubShape>
  points:    Record<string, SplinePoint>
  handles:   Record<string, SplineHandle>
  segments:  Record<string, SplineSegment>
  contours:  Record<string, SplineContour>
  fillRule:  'nonzero' | 'evenodd'
}
