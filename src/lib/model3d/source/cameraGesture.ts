import type { Model3DData } from '../types'
/** Pure camera gesture in CSS pixels. Orbit is degrees; pan and dolly use model
 * presentation units. Returns detached source, never changes 2D transforms.
 * Small movement is handled by the shared pointer session's drag threshold. */
export function cameraGesture(source: Model3DData, dx: number, dy: number, mode: 'orbit' | 'pan' | 'dolly'): Model3DData {
  const camera = { ...source.camera }
  if (mode === 'orbit') { camera.yaw += dx * .4; camera.pitch = Math.max(-89, Math.min(89, camera.pitch + dy * .4)) }
  if (mode === 'dolly') camera.distance = Math.max(.1, Math.min(1000, camera.distance * Math.exp(dy * .008)))
  if (mode === 'pan') {
    const yaw = camera.yaw * Math.PI / 180, pitch = camera.pitch * Math.PI / 180, step = camera.distance * .002
    camera.targetX += (-dx * Math.cos(yaw) + dy * Math.sin(pitch) * Math.sin(yaw)) * step
    camera.targetY += dy * Math.cos(pitch) * step
    camera.targetZ += (dx * Math.sin(yaw) + dy * Math.sin(pitch) * Math.cos(yaw)) * step
  }
  return { ...source, camera }
}
