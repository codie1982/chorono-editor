import type { Layer } from '../types'
import { geometryModifierRegistry } from './builtins'

/** Editable source references include disabled steps, so orphan cleanup never
 * deletes an asset needed when a modifier is enabled again. Registry field
 * metadata is authoritative; arbitrary settings strings are not asset IDs.
 * Returns unique IDs and owns no decoded media or geometry resources. */
export function modifierAssetIds(layer: Layer): readonly string[] {
  const stack = layer.modifierStack
  if (!stack) return []
  const ids = new Set<string>()
  if (stack.source.kind === 'mesh2d') {
    const mesh = stack.source.mesh
    if (mesh.appearance?.kind === 'texture' && mesh.appearance.textureAssetId) ids.add(mesh.appearance.textureAssetId)
    if (mesh.deformation?.assetId) ids.add(mesh.deformation.assetId)
  }
  for (const record of stack.modifiers) {
    for (const field of geometryModifierRegistry.get(record.type).descriptor.fields) {
      const value = record.settings[field.key]
      if (field.kind === 'asset' && typeof value === 'string' && value) ids.add(value)
    }
  }
  return Array.from(ids)
}
