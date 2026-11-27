import type { Layer } from '../../types'
import { uid } from '../../spline/util/uid'

/** Continue the enabled tail Edit Mesh or reserve a new id. The stack changes
 * only when the caller commits a successful geometry edit. */
export function meshEditStageId(layer: Layer): string {
  const last = layer.modifierStack?.modifiers.at(-1)
  return last?.type === 'meshTransform' && last.enabled ? last.id : uid('mesh-edit')
}
