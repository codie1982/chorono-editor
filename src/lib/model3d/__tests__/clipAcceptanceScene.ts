import type { ChronoScene, Layer, Track } from '../../types'
import type { ModelContentClip } from '../animation/ModelContentAnimation'
import { emptyScene, newRectLayer } from '../../defaults'
import { newModelLayer } from '../source/modelDefaults'
import { cloneSingleLayer } from '../../clone/CloneSingleLayer'
import { binaryGlbBytes } from './fixtures'

/** Deterministic T2 source fixture, shared by value/broker and native pixel
 * acceptance. Three owners share one real embedded GLB: an original, an
 * independent copy with a different active clip, and a thin live instance.
 * All times are composition/local milliseconds; imported node transforms are
 * deliberately non-identity. No user scene, generated render or runtime object.
 */
export function clipAcceptanceScene(): ChronoScene {
  const scene = emptyScene(), original = newModelLayer('original', 'shared-model', 'Original · looping')
  original.size = { width: 150, height: 150 }
  original.transform = { ...original.transform, x: 20, y: 20 }
  original.model3d = { ...original.model3d!, version: 2, camera: { ...original.model3d!.camera, yaw: 0, pitch: 8 },
    animation: { version: 1, activeClipId: 'turn', clips: [clip('turn', 0, 60, true), clip('reverse', 60, 0, false)] } }
  const copy = cloneSingleLayer(original, { nameOverride: 'Copy · held ending' }).clonedLayer
  copy.id = 'copy'; copy.startMs = 250; copy.size = { width: 130, height: 160 }
  copy.transform = { ...copy.transform, x: 285, y: 20 }; copy.opacity = .8
  copy.model3d!.animation!.activeClipId = 'reverse'
  copy.model3d!.camera = { ...copy.model3d!.camera, fov: 38, targetX: .2, targetY: .1 }
  copy.model3d!.lighting = { ambient: .4, key: 1 }
  const instance = cloneSingleLayer(original, { mode: 'instance', nameOverride: 'Live instance · delayed' }).clonedLayer
  instance.id = 'instance'; instance.startMs = 400; instance.parentId = 'parent'
  instance.transform = { ...instance.transform, x: 0, y: 0, scaleX: .8, scaleY: .8, rotationDeg: 8 }
  const parent: Layer = { ...newRectLayer(), id: 'parent', name: 'Manual parent', type: 'group', transform: { ...original.transform, x: 270, y: 180, rotationDeg: -12 } }
  delete parent.style; delete parent.size
  const manual = { ...newRectLayer(), id: 'manual', name: 'Manual 2D sentinel', size: { width: 90, height: 35 },
    transform: { ...original.transform, x: 35, y: 245 }, style: { fill: { type: 'solid' as const, color: '#38bdf8' } } }
  const bytes = new Uint8Array(binaryGlbBytes())
  return { ...scene, composition: { ...scene.composition, id: 'model-clip-t2', width: 480, height: 320, durationMs: 2400, frameRate: 30, backgroundColor: '#152337' },
    assets: [{ id: 'shared-model', name: 'Triangle with imported parent.glb', type: 'model3d',
      url: 'data:model/gltf-binary;base64,' + btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join('')) }],
    layers: [original, copy, parent, instance, manual],
    timelines: [{ id: 'outer', durationMs: 2000, autoplay: true, loop: false, layerIds: ['original', 'copy', 'parent', 'instance', 'manual'], tracks: [
      scalar('layers.original.transform.x', 20, 100, 2000), scalar('layers.original.transform.rotationDeg', 0, 12, 2000),
      scalar('layers.original.size.width', 150, 170, 2000), scalar('layers.parent.transform.x', 270, 250, 2000),
      scalar('layers.manual.opacity', 1, .6, 2000),
    ] }] }
}

/** Real authored numeric clip, alternative clip IDs are owner-local. */
function clip(id: string, start: number, end: number, loop: boolean): ModelContentClip {
  const scale = scalar('layers.content.model3d.scale', .85, 1.1, 1000, id)
  scale.keyframes[0].easing = { type: 'customBezier', bezier: { cx1: .42, cy1: 0, cx2: .58, cy2: 1 } }
  scale.keyframes[0].tangentMode = 'broken'
  const pitch = scalar('layers.content.model3d.camera.pitch', 8, 25, 1000, id)
  pitch.keyframes[0].easing = { type: 'hold' }; pitch.keyframes[0].tangentMode = 'broken'
  return { id, name: id === 'turn' ? 'Turn · loop' : 'Reverse · hold', durationMs: 1000, autoplay: false, loop, layerIds: ['content'],
    tracks: [scalar('layers.content.model3d.rotation.y', start, end, 1000, id),
      scalar('layers.content.model3d.camera.yaw', start / 3 - 10, end / 3 - 10, 1000, id), scale, pitch] }
}

/** Stable independent key IDs preserve easing/tangent metadata across paths. */
function scalar(target: string, from: number, to: number, durationMs: number, prefix = 'outer'): Track {
  return { target, keyframes: [{ id: `${prefix}:${target}:a`, timeMs: 0, value: from, easing: { type: 'linear' }, tangentMode: 'linear' },
    { id: `${prefix}:${target}:b`, timeMs: durationMs, value: to, easing: { type: 'linear' }, tangentMode: 'linear' }] }
}
