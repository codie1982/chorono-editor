import type { ConversionSource } from '../types/geometryConversion'
import type { SplinePathData } from '../types/spline'
import type { Mesh2DData } from '../types/mesh2d'

export type GeometryKind = 'shape' | 'spline' | 'mesh2d'
/** Serializable source-local geometry. Positions/connectivity retain their
 * existing typed contracts; no layer transforms, DOM/GPU objects or frame data. */
export type ModifierGeometry =
  | { readonly kind: 'shape'; readonly sources: readonly ConversionSource[]; readonly unionTolerancePx: number }
  | { readonly kind: 'spline'; readonly spline: SplinePathData }
  | { readonly kind: 'mesh2d'; readonly mesh: Mesh2DData }

import type { ModifierDescriptor, ModifierStackData } from './types'

/** Geometry-only integration context. Generic modifiers do not depend on Layers. */
export interface ModifierContext { readonly layerId: string }
/** Domain admission is owned here, outside the generic execution machinery. */
export interface GeometryModifierDescriptor extends ModifierDescriptor {
  readonly category: 'spline' | 'mesh'
  readonly inputs: readonly GeometryKind[]
  readonly output: GeometryKind
  /** True only when source-point editing remains unambiguous after this step. */
  readonly preservesSourceEditing?: boolean
  /** Authoring edits this step's INPUT spline, while rendering uses its output.
   * Distinct from result-point identity preservation. Admitted only for a single
   * terminal owner with a source-preserving conversion prefix. */
  readonly sourceEditing?: 'inputSpline'
  /** Existing records/programmatic callers remain supported; hidden from new UI instances. */
  readonly legacySplineTool?: boolean
}
export type GeometryModifierStackData = ModifierStackData<ModifierGeometry>
