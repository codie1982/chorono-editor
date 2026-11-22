import type { Layer } from '../../types'
import type { Model3DData } from '../types'
import type { PropertyGroup, PropertySchema } from '../../registry/PropertySchema'
/** Apply thin-instance input values to a detached parameter definition map.
 * Geometry/clip/source identity still inherits from the source. Missing IDs,
 * changed types and out-of-range values fail explicitly after source edits. */
export function applyModelInstanceInputs(data: Model3DData | undefined, values?: Readonly<Record<string, number | boolean>>, frame = false): Model3DData | undefined {
  if (!values || !Object.keys(values).length) return data
  if (!data?.content) throw new Error('3D instance inputs require a content definition.')
  const parameters = { ...data.content.parameters }
  for (const [id, value] of Object.entries(values)) {
    const p = parameters[id]
    if (!p || typeof value !== p.type || typeof value === 'number' && (!Number.isFinite(value) || !frame && (value < p.min || value > p.max))) throw new Error('3D instance input no longer matches its source definition.')
    parameters[id] = { ...p, value: frame && typeof value === 'number' ? Math.max(p.min, Math.min(p.max, value)) : value }
  }
  return { ...data, content: { ...data.content, parameters } }
}
/** Narrow public input contract for raw thin instances; no node or native
 * source ownership is granted to general Properties/expression commands. */
export function isModelInstanceInput(layer: Layer, path: string): boolean {
  const match = path.match(/^model3dInputValues\.([A-Za-z][A-Za-z0-9_]*)$/)
  return !!layer.instanceOf && !!match && Object.prototype.hasOwnProperty.call(layer.model3dInputValues ?? {}, match[1])
}
/** Schema-driven UI/expression fields. Optional resolved data supplies human
 * names/bounds in the main inspector; raw validation remains typed and finite. */
export function modelInstanceInputGroup(layer: Layer, data = layer.model3d): PropertyGroup {
  return { title: '3D instance inputs', schemas: Object.entries(layer.model3dInputValues ?? {}).map(([id, value]): PropertySchema => {
    const p = data?.content?.parameters[id]
    return { id: `modelInstance.${id}`, path: `model3dInputValues.${id}`, label: p?.name ?? id, group: '3D', valueType: typeof value === 'boolean' ? 'boolean' : 'number', animatable: true, defaultValue: value, min: p?.min, max: p?.max, step: .1 }
  }) }
}
