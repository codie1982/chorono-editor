import type { Layer } from '../../types'
import type { Model3DData } from '../types'
import { MAX_MODEL_BOX_SIDE, validateModel } from './modelDefaults'

/** Editable presentation fields of a boxed model. Asset identity and source
 * version are intentionally excluded: replacing a model is an import operation. */
export type ModelPresentationPatch = {
  position?: Partial<Model3DData['position']>
  rotation?: Partial<Model3DData['rotation']>
  scale?: number
  camera?: Partial<Model3DData['camera']>
  lighting?: Partial<Model3DData['lighting']>
}

/** Merge a partial model edit into one source layer without touching its 2D
 * transform, asset identity, or omitted model settings. The optional box is in
 * composition pixels; internal position/camera values are normalized presentation
 * units and rotation/camera angles are degrees. This pure operation rejects
 * malformed values before the editor creates an Undo step. */
export function patchModelPresentation(layer: Layer, patch: ModelPresentationPatch, box?: { width?: number; height?: number }): Layer {
  if (layer.type !== 'model3d' || !layer.model3d || layer.instanceOf) throw new Error('Choose an imported source model3d layer, not an instance or another layer.')
  if (!patch || typeof patch !== 'object') throw new Error('Model settings must be an object.')
  if (!Object.keys(patch).length && !box) throw new Error('Supply model settings or box dimensions.')
  const model3d: Model3DData = {
    ...layer.model3d,
    ...(patch.position ? { position: { ...layer.model3d.position, ...patch.position } } : {}),
    ...(patch.rotation ? { rotation: { ...layer.model3d.rotation, ...patch.rotation } } : {}),
    ...(patch.scale === undefined ? {} : { scale: patch.scale }),
    ...(patch.camera ? { camera: { ...layer.model3d.camera, ...patch.camera } } : {}),
    ...(patch.lighting ? { lighting: { ...layer.model3d.lighting, ...patch.lighting } } : {}),
  }
  validateModel(model3d)
  if (box && !layer.size) throw new Error('3D layer has no outer box dimensions.')
  const size = box && layer.size ? { ...layer.size, ...box } : layer.size
  if (box && (!size || !Number.isFinite(size.width) || !Number.isFinite(size.height)
    || size.width < 1 || size.width > MAX_MODEL_BOX_SIDE || size.height < 1 || size.height > MAX_MODEL_BOX_SIDE)) {
    throw new Error(`3D layer dimensions must be 1..${MAX_MODEL_BOX_SIDE} px.`)
  }
  return { ...layer, model3d, size }
}
