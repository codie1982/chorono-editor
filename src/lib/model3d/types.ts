/** Serializable first-slice 3D source. Angles are degrees; authored scene
 * placement/camera distances and primitive geometry use metres. An imported
 * bounding sphere is normalized to radius one until instance calibration.
 * The adapter retains original node transforms in a non-destructive framing group.
 * Native Three/WebGL objects never enter source, history or portable JSON. */
export interface Model3DData {
  /** v2 adds private clips; v3 adds revision-bound content; v4 adds authored primitives. */
  version: 1 | 2 | 3 | 4
  content?: import('./content/types').ModelContent
  modeling?: import('./modeling/poly/primitiveSource').ModelModelingSource
  /** Optional on older v4 files; first settings edit writes canonical metres. */
  measurement?: import('./measurement/modelMeasurement').ModelMeasurementSettings
  /** Optional local companion render preset. Old scenes retain the defaults. */
  render?: import('./renderSettings/modelRenderSettings').ModelRenderSettings
  /** Authored cameras and lights; absent in older files. */
  sceneObjects?: import('./source/modelSceneObjects').ModelSceneObjects
  assetId: string
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number }
  scale: number
  /** Optional clockwise view roll; omitted legacy JSON is equivalent to 0°. */
  camera: { yaw: number; pitch: number; roll?: number; distance: number; targetX: number; targetY: number; targetZ: number; fov: number }
  lighting: { ambient: number; key: number }
  animation?: import('./animation/ModelContentAnimation').ModelContentAnimation
}
/** Borrowed prepared source; valid only while the media consumer holds its lease.
 * draw is synchronous and uses a shared bounded backend, never a playback clock. */
export interface Model3DResource {
  readonly bytes: number
  readonly inventory?: import('./content/types').ModelInventory
  /** Loader-confirmed explicit empty scene marker; no geometry is inferred
   * from an import that merely happens to have no inventory nodes. */
  readonly isExplicitEmptyScene?: boolean
  readonly inspector?: import('./inspection/types').ModelInspector
  draw(context: CanvasRenderingContext2D, data: Model3DData, width: number, height: number, resources?: import('./inspection/types').ModelResourceLookup, inspection?: import('./inspection/types').ModelInspection): void
  /** Freeze the current authored output pose as a portable GLB for the local
   * Chorono Render CLI. The caller keeps all source leases until it resolves. */
  exportGlb?(data: Model3DData, width: number, height: number, resources?: import('./inspection/types').ModelResourceLookup): Promise<Uint8Array>
  dispose(): void
}
