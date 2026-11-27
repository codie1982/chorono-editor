import type { ModelContent } from '../content/types'
import type { Layer } from '../../types'
import type { Model3DData } from '../types'
import { modelContentPaths } from '../content/modelContent'
import { readPropertyPath } from '../../scene/properties/readPropertyPath'
import { writePropertyPath } from '../../scene/properties/writePropertyPath'
import { parseAnimatableColor } from '../../animation/typedValues'
import { isPrimitiveChannel, primitiveChannelPaths, readPrimitiveChannel, writePrimitiveChannel } from './modelPrimitiveChannels'
/** Exact layer-relative typed paths shared by registry, clip validator and
 * isolated editor. Angles use degrees; authored positions and dimensions use
 * model metres, while imported node transforms retain local glTF units.
 * Identity, assets, topology and outer 2D transforms are not clip channels.
 */
export { MODEL_CONTENT_PATHS } from './modelBaseChannels'
import { MODEL_CONTENT_PATHS } from './modelBaseChannels'

/** Read an authored channel without migrating old JSON. Legacy cameras omit
 * roll, whose mathematical default is zero degrees. Other missing leaves stay
 * missing so removed assembly content cannot be accidentally re-created. */
export function readModelChannelValue(layer: Layer, path: string): unknown {
  if (isPrimitiveChannel(path)) return readPrimitiveChannel(layer, path)
  const value = readPropertyPath(layer, path)
  return path === 'model3d.camera.roll' && value === undefined ? 0 : value
}

/** Restore an authored fallback. Primitive ID paths are virtual and must never
 * be written as array properties into source JSON. */
export function writeModelChannelValue(layer: Layer, path: string, value: unknown): Layer {
  return isPrimitiveChannel(path) ? writePrimitiveChannel(layer, path, value) : writePropertyPath(layer, path, value)
}

/** Supported numerical interval, shared by source validation and sampled-frame
 * projection. Bounds are presentation units/degrees, never composition pixels. */
export function channelRange(path: string): readonly [number, number] {
  if (path.endsWith('.geometry.radius')) return [.001, 500]
  if (/\.geometry\.(width|height|depth)$/.test(path)) return [.001, 1000]
  if (/\.(roughness|metalness|opacity)$/.test(path)) return [0, 1]
  if (/\.lighting\.(ambient|key)$/.test(path)) return [0, 20]
  if (path.endsWith('.environment.intensity')) return [0, 20]
  if (path.endsWith('.environment.exposure')) return [.01, 20]
  if (/^model3d\.modeling\.objectsById\.[^.]+\.(position|rotation)\.[xyz]$/.test(path)) return [-1e5, 1e5]
  if (path.endsWith('.scale')) return [.001, 1000]
  if (path === 'model3d.camera.pitch') return [-90, 90]
  if (path === 'model3d.camera.roll') return [-180, 180]
  if (path === 'model3d.camera.distance') return [.1, 1000]
  if (path === 'model3d.camera.fov') return [5, 150]
  if (path.endsWith('.native.timeMs')) return [0, 86400000]
  if (path === 'model3d.content.explode') return [0, 10]
  if (path.endsWith('.orthoHeight')) return [.01, 10000]
  return [-1e6, 1e6]
}

/** Validate an authored scalar; key values are never normalized or clamped. */
export function assertModelChannelValue(path: string, value: unknown, data?: Model3DData): void {
  if (!modelChannelPaths(data).includes(path)) throw new Error('Unsupported model clip channel.')
  if (path.endsWith('.visible')) { if (typeof value !== 'boolean') throw new Error('Expected a visibility key.'); return }
  if (path.endsWith('.color')) { if (!parseAnimatableColor(value)) throw new Error('Expected a color key.'); return }
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e6) throw new Error('Expected a finite numeric model key.')
  const [min, max] = channelRange(path)
  if (value < min || value > max) throw new Error(`Key value is outside the supported range for ${path}.`)
  const nativeTime = path.match(/^model3d\.content\.instances\.([^.]+)\.native\.timeMs$/)
  if (nativeTime && value > (data?.content?.instances[nativeTime[1]]?.native?.outMs ?? -1)) throw new Error('Native pose time exceeds the selected clip range.')
}

/** Clamp only the evaluated frame, retaining authored keys/easing unchanged.
 * Overshooting easing cannot leave the supported camera interval or make scale negative.
 * Non-finite/foreign values fail before GPU work rather than inventing a pose.
 */
export function sampleModelChannel(path: string, value: unknown): number | boolean | string {
  if (path.endsWith('.visible') && typeof value === 'boolean') return value
  if (path.endsWith('.color')) {
    const color = parseAnimatableColor(value)
    if (!color) throw new Error('Invalid sampled model color.')
    return `#${[color.r, color.g, color.b].map(component => Math.round(component).toString(16).padStart(2, '0')).join('')}`
  }
  if (!(MODEL_CONTENT_PATHS.includes(path) || /^model3d\.(content|modeling|lighting)\./.test(path)) || typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid sampled model clip value.')
  const [min, max] = channelRange(path)
  return Math.max(min, Math.min(max, value))
}

/** Enumerate exact existing 3D leaves before driver ownership filtering. */
export function modelChannelPaths(data?: Model3DData): readonly string[] {
  const content = data?.content
  const paths = [...MODEL_CONTENT_PATHS, ...modelContentPaths(content), ...primitiveChannelPaths(data),
    'model3d.lighting.ambient', 'model3d.lighting.key']
  if (content) {
    paths.push(...['x', 'y', 'z'].map(axis => `model3d.content.light.position.${axis}`),
      'model3d.content.light.color', 'model3d.content.environment.color',
      'model3d.content.environment.intensity', 'model3d.content.environment.exposure')
    for (const [instanceId, instance] of Object.entries(content.instances)) for (const materialId of Object.keys(instance.materials))
      paths.push(...['color', 'roughness', 'metalness', 'opacity'].map(field => `model3d.content.instances.${instanceId}.materials.${materialId}.${field}`))
  }
  return paths
}

/** Exact keyable leaves, excluding channels driven by native clips, exposed
 * inputs or the procedural turntable. Source and renderer use the same list. */
export function modelChannels(data?: Model3DData): readonly string[] {
  const content: ModelContent | undefined = data?.content
  const driven = new Set(Object.values(content?.parameters ?? {}).map(p => p.target))
  if (content?.turntable.enabled) driven.add('model3d.rotation.y')
  return modelChannelPaths(data).filter(path => {
    if (driven.has(path)) return false
    const match = path.match(/^model3d\.content\.instances\.([^.]+)\.nodes\.(n\d+)\.(position|rotation|scale)\./)
    return !match || !content?.instances[match[1]].native?.channels.some(c => c.nodeId === match[2] && c.field === match[3])
  })
}
