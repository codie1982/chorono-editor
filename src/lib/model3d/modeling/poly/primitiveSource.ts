import type { Model3DData } from '../../types'
import type { ModelInventory, ModelVector } from '../../content/types'
import { withModelContent } from '../../content/modelContent'
import { measureJson } from '../../../format/json'
import { modelMeasurement } from '../../measurement/modelMeasurement'
import { primitiveSurfaceDefaults, validPbrSurface, type PbrSurfaceOptions } from '../../material/pbrSurface'

export type PrimitiveKind = 'box' | 'sphere' | 'cylinder' | 'cone' | 'plane'
export type PrimitiveGeometry =
  | { kind: 'box'; width: number; height: number; depth: number }
  | { kind: 'plane'; width: number; depth: number }
  | { kind: 'sphere'; radius: number }
  | { kind: 'cylinder' | 'cone'; radius: number; height: number }

/** Portable polygon primitive owned by one 3D scene. Geometry parameters and
 * placement use metres; rotation uses degrees in Y-up XYZ space.
 * Runtime Three objects and generated vertex buffers never enter this record. */
export interface PrimitiveObject {
  id: string
  name: string
  /** Absent in older v4 scenes; visible by default. */
  visible?: boolean
  /** Editor selection lock and independent output visibility. */
  frozen?: boolean
  renderable?: boolean
  geometry: PrimitiveGeometry
  position: ModelVector
  rotation: ModelVector
  scale: number
  color: string
  /** Optional PBR controls. Existing color-only v4 objects use renderer defaults. */
  material?: PbrSurfaceOptions & { roughness?: number; metalness?: number; opacity?: number }
}

/** v4's first Modeling source. Only primitive objects are authored in this
 * slice; spline extrusion and editable polygon topology get explicit later
 * source revisions instead of being silently interpreted as primitives. */
export interface ModelModelingSource {
  version: 1
  objects: PrimitiveObject[]
}

export const MAX_PRIMITIVE_OBJECTS = 16
export const PRIMITIVE_SELECTION_INSTANCE = '@primitive'

const finite = (value: unknown, low: number, high: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high
const only = (value: object, keys: readonly string[]): boolean => Object.keys(value).every(key => keys.includes(key))
const vector = (value: ModelVector): boolean => !!value && only(value, ['x', 'y', 'z'])
  && ['x', 'y', 'z'].every(axis => finite(value[axis as keyof ModelVector], -1e5, 1e5))

/** Validate bounded, serializable primitive source at commit/load. Unknown
 * fields cannot become executable geometry; invalid dimensions fail before GPU
 * allocation. IDs are unique and stable across reorder, clone and Undo. */
export function assertModelingSource(source: ModelModelingSource): void {
  if (!source || source.version !== 1 || !only(source, ['version', 'objects']) || !Array.isArray(source.objects) || source.objects.length > MAX_PRIMITIVE_OBJECTS) throw new Error('Invalid 3D modeling source.')
  measureJson(source, { maxBytes: 64 * 1024, maxChars: 64 * 1024, maxNodes: 2000 })
  const ids = new Set<string>()
  for (const object of source.objects) {
    if (!object || !only(object, ['id', 'name', 'visible', 'frozen', 'renderable', 'geometry', 'position', 'rotation', 'scale', 'color', 'material'])
      || !/^[a-zA-Z][a-zA-Z0-9_]{0,79}$/.test(object.id) || ids.has(object.id)
      || object.visible !== undefined && typeof object.visible !== 'boolean'
      || object.frozen !== undefined && typeof object.frozen !== 'boolean'
      || object.renderable !== undefined && typeof object.renderable !== 'boolean'
      || typeof object.name !== 'string' || !object.name.trim() || object.name.length > 80
      || !/^#[0-9a-f]{6}$/i.test(object.color) || !finite(object.scale, .001, 1000)
      || !vector(object.position) || !vector(object.rotation)) throw new Error('Invalid 3D primitive identity or placement.')
    if (object.material && (!only(object.material, ['roughness', 'metalness', 'opacity', 'emissiveColor', 'emissiveIntensity', 'alphaMode', 'alphaCutoff', 'doubleSided', 'normalStrength', 'aoStrength'])
      || !validPbrSurface({ ...primitiveSurfaceDefaults, ...object.material, color: object.color }))) throw new Error('Invalid 3D primitive material.')
    const geometry = object.geometry
    if (!geometry || !['box', 'sphere', 'cylinder', 'cone', 'plane'].includes(geometry.kind)) throw new Error('Unknown 3D primitive geometry.')
    if (geometry.kind === 'box' ? !only(geometry, ['kind', 'width', 'height', 'depth']) || !finite(geometry.width, .001, 1000) || !finite(geometry.height, .001, 1000) || !finite(geometry.depth, .001, 1000)
      : geometry.kind === 'plane' ? !only(geometry, ['kind', 'width', 'depth']) || !finite(geometry.width, .001, 1000) || !finite(geometry.depth, .001, 1000)
      : geometry.kind === 'sphere' ? !only(geometry, ['kind', 'radius']) || !finite(geometry.radius, .001, 500)
      : !only(geometry, ['kind', 'radius', 'height']) || !finite(geometry.radius, .001, 500) || !finite(geometry.height, .001, 1000)) throw new Error('Invalid 3D primitive dimensions.')
    ids.add(object.id)
  }
}

/** Detached primitive defaults; callers provide the stable ID. */
export function newPrimitive(kind: PrimitiveKind, id: string): PrimitiveObject {
  const geometry: PrimitiveGeometry = kind === 'box' ? { kind, width: 1, height: 1, depth: 1 }
    : kind === 'plane' ? { kind, width: 1, depth: 1 }
    : kind === 'sphere' ? { kind, radius: .5 } : { kind, radius: .5, height: 1 }
  return { id, name: kind[0].toUpperCase() + kind.slice(1), visible: true, geometry,
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1, color: '#8aa9d6' }
}

/** Promote a prepared 3D scene and append one primitive without mutating its
 * existing imported models, native clips or camera. A full source validation
 * follows through the caller's draft command before publication. */
export function addPrimitive(data: Model3DData, inventory: ModelInventory, kind: PrimitiveKind, id: string): Model3DData {
  const base = withModelContent(data, inventory)
  const modeling = base.modeling ?? { version: 1 as const, objects: [] }
  if (modeling.objects.length >= MAX_PRIMITIVE_OBJECTS) throw new Error(`A 3D scene supports at most ${MAX_PRIMITIVE_OBJECTS} primitives.`)
  if (modeling.objects.some(object => object.id === id)) throw new Error('3D primitive ID already exists.')
  return { ...base, version: 4, measurement: modelMeasurement(base), modeling: { ...modeling, objects: [...modeling.objects, newPrimitive(kind, id)] } }
}

/** Remove only the selected authored primitive. Existing imported instances
 * and other primitives retain their IDs and ordering for local/main Undo. */
export function removePrimitive(data: Model3DData, id: string): Model3DData {
  if (!data.modeling?.objects.some(object => object.id === id)) return data
  return { ...data, modeling: { ...data.modeling, objects: data.modeling.objects.filter(object => object.id !== id) } }
}

/** Replace one primitive after a typed property edit; unknown IDs fail rather
 * than writing a detached object. The caller validates the complete source. */
export function updatePrimitive(data: Model3DData, id: string, update: (object: PrimitiveObject) => PrimitiveObject): Model3DData {
  if (!data.modeling?.objects.some(object => object.id === id)) throw new Error('3D primitive no longer exists.')
  return { ...data, modeling: { ...data.modeling, objects: data.modeling.objects.map(object => object.id === id ? update(object) : object) } }
}
