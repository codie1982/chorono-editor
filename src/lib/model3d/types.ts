/** Serializable first-slice 3D source. Angles are degrees; camera/placement use
 * presentation units (the imported bounding sphere has radius one). The adapter
 * retains original node transforms inside a non-destructive framing group.
 * Native Three/WebGL objects never enter source, history or portable JSON. */
export interface Model3DData {
  version: 1
  assetId: string
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number }
  scale: number
  camera: { yaw: number; pitch: number; distance: number; targetX: number; targetY: number; targetZ: number; fov: number }
  lighting: { ambient: number; key: number }
}
/** Borrowed prepared source; valid only while the media consumer holds its lease.
 * draw is synchronous and uses a shared bounded backend, never a playback clock. */
export interface Model3DResource {
  readonly bytes: number
  draw(context: CanvasRenderingContext2D, data: Model3DData, width: number, height: number): void
  dispose(): void
}
