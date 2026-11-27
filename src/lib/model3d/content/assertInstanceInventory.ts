import type { ModelContentInstance, ModelInventory } from './types'
/** Validate revision-scoped references and competing node/native authors before
 * publication or drawing. Missing IDs never fall back to name matching. Imported
 * TRS channels reserve the whole vector/quaternion, avoiding partial pose fights. */
export function assertInstanceInventory(instance: ModelContentInstance, inventory: ModelInventory): void {
  if (instance.revision !== inventory.revision) throw new Error('3D asset revision changed. Reimport explicitly before editing its nodes.')
  if (instance.calibration && instance.calibration.revision !== inventory.revision) throw new Error('3D calibration belongs to another asset revision.')
  const nodes = new Map(inventory.nodes.map(n => [n.id, n])), clip = instance.native && inventory.clips.find(c => c.id === instance.native!.clipId)
  if (instance.native && (!clip || instance.native.outMs > clip.durationMs + .001 || JSON.stringify(instance.native.channels) !== JSON.stringify(clip.channels))) throw new Error('Native 3D clip or range is missing from this asset revision.')
  for (const [id, pose] of Object.entries(instance.nodes)) {
    const rest = nodes.get(id)
    if (!rest) throw new Error('A 3D node reference is missing from this asset revision.')
    for (const channel of clip?.channels ?? []) if (channel.nodeId === id && ['position', 'rotation', 'scale'].includes(channel.field)) {
      const field = channel.field as 'position' | 'rotation' | 'scale'
      if (['x', 'y', 'z'].some(k => pose[field][k as 'x' | 'y' | 'z'] !== rest[field][k as 'x' | 'y' | 'z'])) throw new Error('This node channel belongs to a native clip. Disable the native clip before authoring its pose.')
    }
  }
  for (const [id, m] of Object.entries(instance.materials)) {
    if (!inventory.materials[id]) throw new Error('A 3D material reference is missing or is not editable PBR.')
    for (const slot of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'] as const) if ((m[slot] ?? -1) >= 0) {
      const index = m[slot]!
      if (!inventory.textures[index]) throw new Error('Embedded 3D texture index is missing.')
      if (inventory.textureColorSpaces[index] !== (slot === 'map' || slot === 'emissiveMap' ? 'srgb' : 'linear')) throw new Error('Texture color space does not match this material slot.')
    }
  }
}
