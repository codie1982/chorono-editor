import { AnimationClip, DoubleSide, Material, MathUtils, Mesh, MeshStandardMaterial, Object3D, Texture, SRGBColorSpace } from 'three'
import type { GLTFParser } from 'three/addons/loaders/GLTFLoader.js'
import type { ModelInventory, ModelMaterial, ModelNodeInfo } from '../content/types'
export interface ModelPreparedSource {
  root: Object3D; clips: readonly AnimationClip[]; inventory: ModelInventory
  materials: ReadonlyMap<string, Material>; textures: readonly Texture[]
}
const xyz = (v: { x: number; y: number; z: number }, degrees = false) => ({ x: degrees ? MathUtils.radToDeg(v.x) : v.x, y: degrees ? MathUtils.radToDeg(v.y) : v.y, z: degrees ? MathUtils.radToDeg(v.z) : v.z })
/** Derive a readonly inventory from loader associations, not potentially duplicate
 * display names. Imported userData IDs are overwritten in the private parsed tree.
 * The revision is SHA-256 of bounded original bytes. Geometry/textures stay owned
 * by the resource; only serializable metadata is exposed to consumers. */
export function prepareModelSource(root: Object3D, clips: readonly AnimationClip[], parser: GLTFParser | undefined, revision: string): ModelPreparedSource {
  const associations = parser?.associations, materials = new Map<string, Material>(), textures: Texture[] = [], textureIds = new Map<Texture, number>()
  for (const [object, ref] of Array.from(associations ?? [])) if (object instanceof Texture) {
    const index = (ref as { textures?: number }).textures
    if (index !== undefined) { textures[index] = object; textureIds.set(object, index) }
  }
  root.traverse(node => {
    const ref = associations?.get(node) as { nodes?: number } | undefined
    node.userData.choronoNode = ref?.nodes === undefined ? undefined : `n${ref.nodes}`
    if (node instanceof Mesh) for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      const ref = associations?.get(material) as { materials?: number } | undefined
      if (ref?.materials !== undefined) { const id = `m${ref.materials}`; material.userData.choronoMaterial = id; materials.set(id, material) }
    }
  })
  const defaults: Record<string, ModelMaterial> = {}
  for (const [id, material] of Array.from(materials)) if (material instanceof MeshStandardMaterial) defaults[id] = {
    color: `#${material.color.getHexString()}`, roughness: material.roughness, metalness: material.metalness, opacity: material.opacity,
    map: textureIds.get(material.map!) ?? -1, normalMap: textureIds.get(material.normalMap!) ?? -1,
    roughnessMap: textureIds.get(material.roughnessMap!) ?? -1, metalnessMap: textureIds.get(material.metalnessMap!) ?? -1,
    aoMap: textureIds.get(material.aoMap!) ?? -1, emissiveMap: textureIds.get(material.emissiveMap!) ?? -1,
    emissiveColor: `#${material.emissive.getHexString()}`, emissiveIntensity: material.emissiveIntensity,
    alphaMode: material.alphaTest > 0 ? 'mask' : material.transparent ? 'blend' : 'opaque',
    alphaCutoff: material.alphaTest || .5, doubleSided: material.side === DoubleSide,
    normalStrength: material.normalScale.x, aoStrength: material.aoMapIntensity,
  }
  const nodes: ModelNodeInfo[] = []
  root.traverse(node => {
    const id = node.userData.choronoNode as string | undefined
    if (!id) return
    let parent = node.parent
    while (parent && !parent.userData.choronoNode) parent = parent.parent
    const materialIds = new Set<string>()
    node.traverse(child => { if (child instanceof Mesh) for (const m of Array.isArray(child.material) ? child.material : [child.material]) if (m.userData.choronoMaterial) materialIds.add(m.userData.choronoMaterial) })
    nodes.push({ id, parentId: parent?.userData.choronoNode ?? null, name: parser?.json.nodes?.[Number(id.slice(1))]?.name || node.name || `Node ${id.slice(1)}`, kind: node.type,
      position: xyz(node.position), rotation: xyz(node.rotation, true), scale: xyz(node.scale), visible: node.visible, materialIds: Array.from(materialIds) })
  })
  nodes.forEach(n => { Object.freeze(n.position); Object.freeze(n.rotation); Object.freeze(n.scale); Object.freeze(n.materialIds); Object.freeze(n) })
  Object.values(defaults).forEach(Object.freeze)
  return { root, clips, materials, textures, inventory: { revision, nodes, materials: Object.freeze(defaults),
    textures: textures.map((t, i) => t?.name || `Texture ${i}`), textureColorSpaces: textures.map(t => t.colorSpace === SRGBColorSpace ? 'srgb' : 'linear'), clips: clips.map((clip, i) => ({ id: `c${i}`, name: clip.name || `Clip ${i + 1}`, durationMs: clip.duration * 1000, channels: (parser?.json.animations?.[i]?.channels ?? []).map((c: { target: { node: number; path: string } }) => ({ nodeId: `n${c.target.node}`, field: c.target.path === 'translation' ? 'position' : c.target.path })) })) } }
}
