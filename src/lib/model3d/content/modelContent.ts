import type { Model3DData } from '../types'
import type { ModelContent, ModelContentInstance, ModelInventory } from './types'
import { MODEL_CONTENT_PATHS } from '../animation/modelBaseChannels'
import { measureJson } from '../../format/json'
import { validPbrSurface } from '../material/pbrSurface'
const safe = /^[a-zA-Z][a-zA-Z0-9_]{0,79}$/
const finite = (v: unknown, lo = -1e6, hi = 1e6): boolean => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi
const vector = (v: any, scale = false): boolean => !!v && ['x', 'y', 'z'].every(k => finite(v[k], scale ? .001 : -1e6, scale ? 1000 : 1e6))
const color = (v: unknown): boolean => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)
/** Create an owned baseline from immutable import inventory. Stable IDs are glTF
 * indices, scoped to the SHA-256 of the exact imported bytes, never node names. */
export function contentInstance(assetId: string, inventory: ModelInventory, name = 'Model'): ModelContentInstance {
  return { assetId, revision: inventory.revision, name, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1,
    nodes: Object.fromEntries(inventory.nodes.map(n => [n.id, { position: { ...n.position }, rotation: { ...n.rotation }, scale: { ...n.scale }, visible: n.visible }])),
    materials: structuredClone(inventory.materials) }
}
/** Explicit v3 promotion is a detail edit, not an automatic import migration. */
export function withModelContent(data: Model3DData, inventory: ModelInventory): Model3DData {
  if (data.content) return data
  return { ...data, version: 3, content: { version: 1, instances: { primary: contentInstance(data.assetId, inventory) },
    view: { projection: 'perspective', orthoHeight: 2.8 }, light: { position: { x: 3, y: 5, z: 4 }, color: '#ffffff', shadows: false },
    environment: { color: '#ffffff', intensity: 1, exposure: 1 }, turntable: { enabled: false, speed: 30 }, explode: 0, parameters: {} } }
}
/** One authoritative asset dependency list for media demand, save and indexing. */
export function modelAssetIds(data?: Model3DData): string[] {
  return data ? Array.from(new Set([data.assetId, ...Object.values(data.content?.instances ?? {}).map(i => i.assetId)])).filter(Boolean) : []
}
/** Validate versioned bounded source at import/commit. Exact node/clip/material
 * existence is checked against decoded revision inventory before any draw. */
export function assertModelContent(c: ModelContent): void {
  measureJson(c, { maxBytes: 4 * 1024 ** 2, maxChars: 4 * 1024 ** 2, maxNodes: 150000 })
  const entries = Object.entries(c?.instances ?? {})
  if (c?.version !== 1 || !entries.length || entries.length > 8 || !c.instances.primary) throw new Error('3D content requires 1..8 instances including primary.')
  for (const [id, i] of entries) {
    if (!safe.test(id) || !i || typeof i.assetId !== 'string' || !i.assetId || !/^[a-f0-9]{64}$/.test(i.revision) || typeof i.name !== 'string' || i.name.length > 120
      || i.visible !== undefined && typeof i.visible !== 'boolean'
      || i.frozen !== undefined && typeof i.frozen !== 'boolean'
      || i.renderable !== undefined && typeof i.renderable !== 'boolean'
      || !vector(i.position) || !vector(i.rotation) || !finite(i.scale, .001, 1000)) throw new Error('Invalid 3D instance identity or transform.')
    if (i.calibration && (Object.keys(i.calibration).sort().join(',') !== 'metersPerNormalizedUnit,revision'
      || i.calibration.revision !== i.revision || !finite(i.calibration.metersPerNormalizedUnit, 1e-6, 1e6))) throw new Error('Invalid 3D instance calibration.')
    if (!i.nodes || Object.keys(i.nodes).length > 4096 || !i.materials || Object.keys(i.materials).length > 2048) throw new Error('Oversized 3D node/material source.')
    for (const [node, pose] of Object.entries(i.nodes)) if (!/^n\d+$/.test(node) || !vector(pose.position) || !vector(pose.rotation) || !vector(pose.scale) || typeof pose.visible !== 'boolean'
      || pose.name !== undefined && (typeof pose.name !== 'string' || !pose.name.trim() || pose.name.length > 80)
      || pose.frozen !== undefined && typeof pose.frozen !== 'boolean' || pose.renderable !== undefined && typeof pose.renderable !== 'boolean') throw new Error('Invalid 3D node transform.')
    for (const [material, m] of Object.entries(i.materials)) if (!/^m\d+$/.test(material) || !validPbrSurface(m)
      || !['map', 'normalMap', 'roughnessMap', 'metalnessMap'].every(k => Number.isInteger(m[k as keyof typeof m]) && finite(m[k as keyof typeof m], -1, 2047))
      || !['aoMap', 'emissiveMap'].every(k => m[k as 'aoMap' | 'emissiveMap'] === undefined || Number.isInteger(m[k as 'aoMap' | 'emissiveMap']) && finite(m[k as 'aoMap' | 'emissiveMap'], -1, 2047))) throw new Error('Invalid 3D material override.')
    const n = i.native
    if (n && (!/^c\d+$/.test(n.clipId) || !finite(n.inMs, 0) || !finite(n.outMs, 0) || n.outMs <= n.inMs || !finite(n.speed, .01, 100) || typeof n.loop !== 'boolean'
      || !Array.isArray(n.channels) || n.channels.length > 8192 || n.channels.some(c => !/^n\d+$/.test(c.nodeId) || !['position', 'rotation', 'scale', 'weights'].includes(c.field)) || !['play', 'scrub'].includes(n.mode) || !finite(n.timeMs, 0, n.outMs))) throw new Error('Invalid native 3D clip range/playback.')
  }
  if (!['perspective', 'orthographic'].includes(c.view?.projection) || !finite(c.view.orthoHeight, .01, 10000) || !vector(c.light?.position) || !color(c.light.color) || typeof c.light.shadows !== 'boolean'
    || !color(c.environment?.color) || !finite(c.environment.intensity, 0, 20) || !finite(c.environment.exposure, .01, 20) || typeof c.turntable?.enabled !== 'boolean' || !finite(c.turntable.speed, -3600, 3600)
    || !finite(c.explode, 0, 10) || !c.parameters || Object.keys(c.parameters).length > 32 || c.timeMs !== undefined && !finite(c.timeMs, 0, 86400000)) throw new Error('Invalid 3D scene controls.')
  const targets = new Set<string>()
  for (const [id, p] of Object.entries(c.parameters)) {
    if (!safe.test(id) || !p.name || p.name.length > 80 || !['number', 'boolean'].includes(p.type) || !finite(p.min) || !finite(p.max) || p.min > p.max || targets.has(p.target)
      || ![...MODEL_CONTENT_PATHS, ...modelContentPaths(c)].includes(p.target) || p.target.includes('.parameters.')) throw new Error('Invalid exposed 3D parameter target.')
    if (p.type === 'number' ? !finite(p.value, p.min, p.max) : typeof p.value !== 'boolean') throw new Error('Invalid exposed 3D parameter value.')
    // Boolean controls intentionally target visibility only; no implicit coercion.
    if ((p.type === 'boolean') !== p.target.endsWith('.visible')) throw new Error('Exposed parameter type does not match its target.')
    if (c.turntable.enabled && p.target === 'model3d.rotation.y') throw new Error('Turntable and an exposed input cannot own Y rotation together.')
    const nativeTarget = p.target.match(/^model3d\.content\.instances\.([^.]+)\.native\.timeMs$/)
    if (nativeTarget && c.instances[nativeTarget[1]].native?.mode === 'play') throw new Error('Use authored pose time before exposing native clip time.')
    targets.add(p.target)
  }
}
/** Exact existing numeric/boolean content leaves; arbitrary structural, asset,
 * material and identity paths are never admitted by a wildcard key permission. */
export function modelContentPaths(c?: ModelContent): string[] {
  if (!c) return []
  const paths = ['model3d.content.explode', 'model3d.content.view.orthoHeight']
  for (const [id, i] of Object.entries(c.instances)) {
    const root = `model3d.content.instances.${id}`
    for (const field of ['position', 'rotation']) for (const axis of ['x', 'y', 'z']) paths.push(`${root}.${field}.${axis}`)
    paths.push(`${root}.scale`)
    for (const node of Object.keys(i.nodes)) {
      for (const field of ['position', 'rotation', 'scale']) for (const axis of ['x', 'y', 'z']) paths.push(`${root}.nodes.${node}.${field}.${axis}`)
      paths.push(`${root}.nodes.${node}.visible`)
    }
    if (i.native) paths.push(`${root}.native.timeMs`)
  }
  return paths
}
