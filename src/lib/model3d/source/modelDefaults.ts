import type { Layer } from '../../types'
import { DEFAULT_TRANSFORM } from '../../defaults'
import type { Model3DData } from '../types'
/** Fresh owned source defaults; camera points at the imported framing center. */
export function modelDefaults(assetId = ''): Model3DData {
  return { version: 1, assetId, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1,
    camera: { yaw: 30, pitch: 15, distance: 3.5, targetX: 0, targetY: 0, targetZ: 0, fov: 45 }, lighting: { ambient: 1.5, key: 3 } }
}
/** Build an ordinary rectangular 2D layer containing a separate 3D payload.
 * Identity is caller-owned; 2D affine units remain composition pixels. */
export function newModelLayer(id: string, assetId = '', name = '3D Model'): Layer {
  return { id, name, type: 'model3d', opacity: 1, transform: { ...DEFAULT_TRANSFORM }, size: { width: 400, height: 400 }, model3d: modelDefaults(assetId) }
}
/** Refuse malformed source rather than pass NaN/infinite camera matrices to GPU.
 * Pitch avoids the orbit singularity; bounded presentation size prevents runaway
 * allocations. Called for imported, scripted and evaluated frames alike. */
export function validateModel(data: Model3DData): void {
  if (!data || data.version !== 1 || typeof data.assetId !== 'string') throw new Error('Invalid 3D model source.')
  const p = data.position, r = data.rotation, c = data.camera, light = data.lighting
  const numbers = [p?.x, p?.y, p?.z, r?.x, r?.y, r?.z, data.scale, c?.yaw, c?.pitch, c?.distance, c?.targetX, c?.targetY, c?.targetZ, c?.fov, light?.ambient, light?.key]
  if (numbers.some(n => typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 1e6)) throw new Error('Invalid 3D numeric settings.')
  if (data.scale <= 0 || data.camera.distance < .1 || data.camera.distance > 1000 || Math.abs(data.camera.pitch) > 89 || data.camera.fov < 5 || data.camera.fov > 150 || data.lighting.ambient < 0 || data.lighting.key < 0) throw new Error('3D settings are outside supported ranges.')
}
