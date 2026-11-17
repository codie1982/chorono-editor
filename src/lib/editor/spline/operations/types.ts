import type { SplineEditMode } from '../../../spline/selection'
import type { SplinePrimitiveKind, SplineGeneratorParams, SplinePointType } from '../../../types/spline'
import type { ShapeStyle } from '../../../types'
import type { SplineTopologyAction } from '../topologyCommand'
import type { OutlineSettings } from '../../../spline/outline'
import type { OperationSettings } from '../../boolean/operationPlan'

export interface SplineSelection { mode: SplineEditMode; ids: string[] }
/** Explicit source operations, independent from temporary panel selection,
 * cursor state, hit radius and screen coordinates. All supplied point/transform
 * positions are layer-local; solver distances/radii use composition px. */
export type SplineSourceOperation =
  | { kind: 'topology'; selection: SplineSelection; action: SplineTopologyAction }
  | { kind: 'append'; primitive: SplinePrimitiveKind; params: SplineGeneratorParams; x?: number; y?: number; name?: string }
  | { kind: 'draw'; points: { x: number; y: number }[]; startPointId?: string; endPointId?: string; autoClose?: boolean; name?: string }
  | { kind: 'transform'; selection: SplineSelection; transform: { x?: number; y?: number; rotation?: number; scaleX?: number; scaleY?: number } }
  | { kind: 'movePoint'; pointId: string; x: number; y: number }
  | { kind: 'pointType'; pointIds: string[]; pointType: SplinePointType }
  | { kind: 'edgeType'; edgeIds: string[]; edgeType: 'line' | 'cubic' }
  | { kind: 'paint'; fill?: ShapeStyle['fill']; stroke?: ShapeStyle['stroke'] }
  | { kind: 'attach'; sourceLayerId: string }
  | { kind: 'detach'; objectIds: string[] }
export type SplineOperation = SplineSourceOperation
  | { kind: 'offset'; selection: SplineSelection; settings: OutlineSettings }
  | { kind: 'chamfer'; pointIds: string[]; distancePx: number }
  | { kind: 'fillet'; pointIds: string[]; radiusPx: number }
  | { kind: 'boolean'; targets?: { layerId: string; subShapeId?: string }[]; settings: OperationSettings; ownerId?: string }
