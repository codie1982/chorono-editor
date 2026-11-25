import { Box3, Vector3, type Object3D } from 'three'

/** Shared finite framing for imported assets and their owned render poses.
 * Explicit empty-scene roots have a unit frame at the origin; arbitrary empty
 * or zero-area imports still fail. The source hierarchy is only queried.
 */
export function modelFraming(root: Object3D): { center: Vector3; radius: number } {
  if (root.userData.choronoEmptyScene === true && root.children.length === 0) return { center: new Vector3(), radius: 1 }
  const bounds = new Box3().setFromObject(root), radius = bounds.getSize(new Vector3()).length() / 2
  if (!Number.isFinite(radius) || radius <= 1e-10) throw new Error('3D model has no finite visible bounds.')
  return { center: bounds.getCenter(new Vector3()), radius }
}
