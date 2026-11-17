import type { Layer } from '../../types'
import { DEFAULT_TRANSFORM } from '../../defaults'
import type { Model3DData } from '../types'
import { assertModelContent } from '../content/modelContent'
import { assertModelContentAnimation } from '../animation/ModelContentAnimation'
import { assertModelingSource } from '../modeling/poly/primitiveSource'
import { assertModelMeasurement } from '../measurement/modelMeasurement'
import { assertModelRenderSettings } from '../renderSettings/modelRenderSettings'
import { assertSceneObjects } from './modelSceneObjects'
/** Source box dimensions in composition pixels, independently of GPU surface resolution. */
export const MAX_MODEL_BOX_SIDE = 4096
/** Fresh owned source defaults; camera points at the imported framing center. */
export function modelDefaults(assetId = ''): Model3DData {
  return { version: 1, assetId, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1,
    camera: { yaw: 30, pitch: 15, roll: 0, distance: 3.5, targetX: 0, targetY: 0, targetZ: 0, fov: 45 }, lighting: { ambient: 1.5, key: 3 } }
}
/** Build an ordinary rectangular 2D layer containing a separate 3D payload.
 * Identity is caller-owned; 2D affine units remain composition pixels. */
export function newModelLayer(id: string, assetId = '', name = '3D Model'): Layer {
  return { id, name, type: 'model3d', opacity: 1, transform: { ...DEFAULT_TRANSFORM }, size: { width: 400, height: 400 }, model3d: modelDefaults(assetId) }
}
/** Refuse malformed source rather than pass NaN/infinite camera matrices to GPU.
 * The renderer supplies a stable up vector at exact top/bottom poles. Bounded
 * presentation size prevents runaway allocations. */
export function validateModel(data: Model3DData): void {
  validateModelPlacement(data)
  if (data.render) assertModelRenderSettings(data.render)
  if (data.sceneObjects) assertSceneObjects(data.sceneObjects)
  if (data.version === 3 || data.version === 4) {
    if (!data.content) throw new Error('A v3/v4 model requires versioned content.')
    assertModelContent(data.content)
    if (data.content.instances.primary.assetId !== data.assetId) throw new Error('Primary 3D asset mismatch.')
  } else if (data.content) throw new Error('3D content requires source version 3 or 4.')
  if (data.version === 4) { assertModelingSource(data.modeling!); if (data.measurement) assertModelMeasurement(data.measurement) }
  else if (data.modeling) throw new Error('3D modeling requires source version 4.')
  if (data.version !== 4 && data.measurement) throw new Error('3D measurement settings require source version 4.')
  if (data.version !== 4 && Object.values(data.content?.instances ?? {}).some(instance => instance.calibration))
    throw new Error('3D physical calibration requires source version 4.')
  if (data.version === 2 || data.version >= 3 && data.animation) {
    if (!data.animation) throw new Error('A v2 model requires its authored clip source.')
    assertModelContentAnimation(data.animation, data)
  }
}

/** Per-frame numeric boundary; private clip source is deeply validated on
 * import/commit instead of repeatedly for every GPU draw/temporal sample.
 */
export function validateModelPlacement(data: Model3DData): void {
  if (!data || ![1, 2, 3, 4].includes(data.version) || typeof data.assetId !== 'string') throw new Error('Invalid 3D model source.')
  const p = data.position, r = data.rotation, c = data.camera, light = data.lighting
  const numbers = [p?.x, p?.y, p?.z, r?.x, r?.y, r?.z, data.scale, c?.yaw, c?.pitch, c?.distance, c?.targetX, c?.targetY, c?.targetZ, c?.fov, light?.ambient, light?.key]
  if (c?.roll !== undefined) numbers.push(c.roll)
  if (numbers.some(n => typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 1e6)) throw new Error('Invalid 3D numeric settings.')
  if (data.scale <= 0 || data.camera.distance < .1 || data.camera.distance > 1000 || Math.abs(data.camera.pitch) > 90 || Math.abs(data.camera.roll ?? 0) > 180 || data.camera.fov < 5 || data.camera.fov > 150 || data.lighting.ambient < 0 || data.lighting.key < 0) throw new Error('3D settings are outside supported ranges.')
}
