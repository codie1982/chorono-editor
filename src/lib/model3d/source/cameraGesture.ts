import type { Model3DData } from '../types'
import { panCamera, rollCamera, zoomCamera } from '../inspection/cameraNavigation'
/** Orbit a detached camera in CSS pixels while preserving projection/framing
 * fields supplied by an inspection caller. Pitch includes exact pole views. */
export function orbitCamera<T extends { yaw: number; pitch: number }>(camera: T, dx: number, dy: number): T {
  return { ...camera, yaw: camera.yaw + dx * .4, pitch: Math.max(-90, Math.min(90, camera.pitch + dy * .4)) }
}
/** Pure camera gesture in CSS pixels. Orbit and tilt are degrees; tilt changes
 * only pitch. Pan and dolly use model
 * presentation units. Returns detached source, never changes 2D transforms.
 * Roll uses horizontal CSS-pixel movement. Small movement is handled by the
 * shared pointer session's drag threshold. */
export function cameraGesture(source: Model3DData, dx: number, dy: number, mode: 'orbit' | 'tilt' | 'pan' | 'dolly' | 'roll'): Model3DData {
  const camera = mode === 'orbit' ? orbitCamera(source.camera, dx, dy) : { ...source.camera }
  if (mode === 'tilt') camera.pitch = Math.max(-90, Math.min(90, camera.pitch + dy * .4))
  return { ...source, camera: mode === 'dolly' ? zoomCamera(camera, Math.exp(-dy * .008))
    : mode === 'pan' ? panCamera(camera, dx, dy) : mode === 'roll' ? rollCamera(camera, dx * .4) : camera }
}
