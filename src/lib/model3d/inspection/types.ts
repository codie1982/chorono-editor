import type { Model3DData, Model3DResource } from '../types'
import type { ModelVector } from '../content/types'
import type { PolyProjection, PolySelectionMode } from '../modeling/poly/editSelection'
export interface ModelSelection { instanceId: string; nodeId: string }
/** Detached inspection camera. Roll is clockwise in screen space and defaults
 * to zero for old source; projection and orthographic height are view-local. */
export interface ModelViewCamera { yaw: number; pitch: number; roll?: number; distance: number; targetX: number; targetY: number; targetZ: number; fov: number; projection: 'perspective' | 'orthographic'; orthoHeight: number }
/** Editor-only inspection state. Selection/isolation are view-local; helpers
 * never enter portable source, Undo history or raster output. */
export interface ModelInspection { camera: ModelViewCamera; selection?: ModelSelection; selections?: readonly ModelSelection[]; isolated?: readonly ModelSelection[]; showGrid?: boolean; grid?: import('../measurement/modelMeasurement').ModelMeasurementSettings; clipNear?: number; clipFar?: number }
export type ModelResourceLookup = (assetId: string) => Model3DResource | undefined
export interface ModelGizmo { origin: { x: number; y: number }; axes: Record<'x' | 'y' | 'z', { x: number; y: number }>; unitsPerHandle: Record<'x' | 'y' | 'z', number>; localUnitsPerPresentation: number
  /** Projected selected-object radius in CSS pixels for editor-only rings. */
  screenRadius: number }
/** Y-up world-axis bounds: width X, length Z, height Y. Values are physical
 * metres only for authored primitives or calibrated imported instances. */
export interface ModelWorldBounds { width: number; length: number; height: number; center: ModelVector }
export interface ModelWorldMeasurement { selected: ModelWorldBounds; instance?: ModelWorldBounds }
/** No browser or Three ownership escapes this interface. Coordinates for pick
 * and gizmo use CSS box pixels, y down; model positions use glTF local units. */
export interface ModelInspector {
  pick(data: Model3DData, x: number, y: number, width: number, height: number, view: ModelInspection, resources?: ModelResourceLookup): ModelSelection | null
  selectRegion(data: Model3DData, region: import('../../selection/selectionGesture').SelectionRegion,
    containment: import('../../selection/canvasShapes').SelectionContainMode, width: number, height: number,
    view: ModelInspection, resources?: ModelResourceLookup): ModelSelection[]
  gizmo(data: Model3DData, width: number, height: number, view: ModelInspection, resources?: ModelResourceLookup): ModelGizmo | null
  measure(data: Model3DData, selection: ModelSelection, view: ModelInspection, resources?: ModelResourceLookup): ModelWorldMeasurement | null
  frame(data: Model3DData, view: ModelInspection, resources?: ModelResourceLookup): { target: ModelVector; distance: number; orthoHeight: number } | null
  /** Optional authored-mesh edit capability; imported assets do not provide it. */
  poly?: {
    project(data: Model3DData, objectId: string, width: number, height: number, view: ModelInspection, resources?: ModelResourceLookup): PolyProjection | null
    pick(data: Model3DData, objectId: string, mode: PolySelectionMode, x: number, y: number, width: number, height: number, view: ModelInspection, resources?: ModelResourceLookup): string | null
  }
}
