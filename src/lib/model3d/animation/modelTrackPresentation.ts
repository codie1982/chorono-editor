import type { Model3DData } from '../types'

export interface ModelTrackPresentation {
  readonly group: string
  readonly section: string
  readonly label: string
  readonly color: string
  readonly unit: string
}

const axisColors: Record<string, string> = { x: '#f87171', y: '#4ade80', z: '#60a5fa' }

/** Read-only labels for the private 3D timeline. They follow current object
 * names while track targets continue to use stable IDs. Color is supplemental
 * to the visible X/Y/Z text and never the only axis indication. */
export function modelTrackPresentation(data: Model3DData | undefined, path: string): ModelTrackPresentation {
  const parts = path.split('.'), axis = parts.at(-1) ?? '', color = axisColors[axis] ?? '#67e8f9'
  const unit = path.includes('.nodes.') && /\.(position|scale)\./.test(path) ? 'glTF'
    : /\.(position|geometry)\./.test(path) || /\.camera\.(distance|target[XYZ])$/.test(path) || path.endsWith('.orthoHeight') ? 'm'
      : /\.rotation\.|\.camera\.(yaw|pitch|roll|fov)$/.test(path) ? 'deg'
        : path.endsWith('.timeMs') ? 'ms' : ''
  const finish = (group: string, section: string, label: string): ModelTrackPresentation => ({ group, section, label, color, unit })
  if (parts[1] === 'modeling' && parts[2] === 'objectsById') {
    const object = data?.modeling?.objects.find(item => item.id === parts[3])
    const section = parts[4] === 'geometry' ? 'Geometry' : title(parts[4])
    return finish(object?.name ?? `Missing object · ${parts[3]}`, section, title(parts.at(-1) ?? ''))
  }
  if (parts[1] === 'camera') return finish('Output camera', parts[2].startsWith('target') ? 'Target' : 'Camera',
    parts[2].startsWith('target') ? parts[2].slice(-1).toUpperCase() : title(parts[2]))
  if (parts[1] === 'content' && parts[2] === 'view') return finish('Output camera', 'Projection', title(parts.at(-1) ?? ''))
  if (parts[1] === 'lighting') return finish('Light & environment', 'Lighting', title(parts[2]))
  if (parts[1] === 'content' && parts[2] === 'instances') {
    const instance = data?.content?.instances[parts[3]], name = instance?.name ?? parts[3]
    if (parts[4] === 'nodes') return finish(`${name} / ${instance?.nodes[parts[5]]?.name ?? parts[5]}`, title(parts[6]), title(parts.at(-1) ?? ''))
    if (parts[4] === 'materials') return finish(`${name} / Material ${parts[5]}`, 'Material', title(parts[6]))
    return finish(name, title(parts[4]), title(parts.at(-1) ?? ''))
  }
  if (parts[1] === 'content' && (parts[2] === 'light' || parts[2] === 'environment'))
    return finish('Light & environment', title(parts[2]), title(parts.at(-1) ?? ''))
  return finish('3D scene', title(parts[1] ?? 'Scene'), title(parts.at(-1) ?? ''))
}

function title(value: string): string { return value.length === 1 ? value.toUpperCase() : value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, first => first.toUpperCase()) }
