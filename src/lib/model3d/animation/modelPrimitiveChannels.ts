import type { Layer } from '../../types'
import type { Model3DData } from '../types'
import type { PrimitiveObject } from '../modeling/poly/primitiveSource'
import { readPropertyPath } from '../../scene/properties/readPropertyPath'

const root = 'model3d.modeling.objectsById.'
const leaf = /^(position|rotation)\.(x|y|z)$|^scale$|^visible$|^color$|^geometry\.(width|height|depth|radius)$/

/** Stable-ID channel paths for authored primitives. IDs, rather than array
 * positions, survive Scene Explorer reorder and portable save/load. Geometry
 * dimensions change positions without changing the primitive topology. */
export function primitiveChannelPaths(data?: Model3DData): string[] {
  return (data?.modeling?.objects ?? []).flatMap(object => {
    const prefix = `${root}${object.id}.`
    return [
      ...['position', 'rotation'].flatMap(field => ['x', 'y', 'z'].map(axis => `${prefix}${field}.${axis}`)),
      `${prefix}scale`, `${prefix}visible`, `${prefix}color`,
      ...Object.keys(object.geometry).filter(key => key !== 'kind').map(key => `${prefix}geometry.${key}`),
    ]
  })
}

/** Resolve only declared primitive leaves. An absent visibility flag in an
 * older v4 source means visible; no source migration is performed by reading. */
export function readPrimitiveChannel(layer: Layer, path: string): unknown {
  const address = primitiveAddress(layer.model3d, path)
  if (!address) return undefined
  const value = readPropertyPath(address.object, address.leaf)
  return address.leaf === 'visible' && value === undefined ? true : value
}

/** Translate an authored ID path into the current array position only for a
 * single immutable render projection. Missing IDs fail rather than retarget. */
export function primitiveRenderPath(data: Model3DData, path: string): string {
  if (!path.startsWith(root)) return path
  const address = primitiveAddress(data, path)
  if (!address) throw new Error(`The animated 3D primitive target is missing: ${path}`)
  return `model3d.modeling.objects.${address.index}.${address.leaf}`
}

/** Restore an authored primitive leaf without writing a virtual objectsById
 * property into portable source. The returned layer owns new array/object copies. */
export function writePrimitiveChannel(layer: Layer, path: string, value: unknown): Layer {
  const address = primitiveAddress(layer.model3d, path)
  if (!address || !layer.model3d?.modeling) throw new Error(`The animated 3D primitive target is missing: ${path}`)
  const object = address.object, [parent, child] = address.leaf.split('.')
  const updated = child ? { ...object, [parent]: { ...(object[parent as 'position' | 'rotation' | 'geometry'] as object), [child]: value } }
    : { ...object, [parent]: value }
  const objects = layer.model3d.modeling.objects.map((item, index) => index === address.index ? updated as PrimitiveObject : item)
  return { ...layer, model3d: { ...layer.model3d, modeling: { ...layer.model3d.modeling, objects } } }
}

export function isPrimitiveChannel(path: string): boolean { return path.startsWith(root) }
export function primitiveChannelRequiresV2(path: string): boolean { return isPrimitiveChannel(path) }

function primitiveAddress(data: Model3DData | undefined, path: string): { object: PrimitiveObject; index: number; leaf: string } | null {
  if (!path.startsWith(root)) return null
  const rest = path.slice(root.length), dot = rest.indexOf('.')
  if (dot < 1) return null
  const id = rest.slice(0, dot), property = rest.slice(dot + 1)
  if (!leaf.test(property)) return null
  const index = data?.modeling?.objects.findIndex(object => object.id === id) ?? -1
  const object = index >= 0 ? data!.modeling!.objects[index] : undefined
  if (!object || property !== 'visible' && readPropertyPath(object, property) === undefined) return null
  return { object, index, leaf: property }
}
