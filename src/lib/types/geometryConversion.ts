import type { Layer } from './core'
import type { SplinePathData } from './spline'

/** Source-local, serializable geometry snapshot. No asset/runtime ownership or
 * external layer references: copies/instances remain self-contained. Matrix
 * maps this input into the result layer's unchanged local coordinate space. */
export interface ConversionSource {
  readonly type: 'shape' | 'spline'
  readonly name: string
  readonly shape?: Layer['shape']
  readonly shapeKind?: Layer['shapeKind']
  readonly shapeParams?: Layer['shapeParams']
  readonly size?: Layer['size']
  readonly cornerRadius?: number
  readonly spline?: SplinePathData
  readonly matrix: readonly [number, number, number, number, number, number]
}

/** Ordered representation stages. Spline controls are authored edit data when
 * present, never a per-frame geometry cache. Mesh sampling uses local pixels. */
export type GeometryConversionStage =
  | { readonly id: string; readonly kind: 'convertSpline'; readonly edited?: SplinePathData }
  | { readonly id: string; readonly kind: 'convertMesh2d'; readonly tolerancePx: number }

/** V1 static geometry recipe on an ordinary spline/mesh layer. Original shape
 * inputs remain serializable and rebuildable; transform/paint stay on the layer.
 * Independent geometry drivers must be explicitly baked before conversion. */
export interface GeometryConversionData {
  readonly version: 1
  readonly sources: readonly ConversionSource[]
  readonly stages: readonly GeometryConversionStage[]
  readonly unionTolerancePx: number
}
