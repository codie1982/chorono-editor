import { describe, expect, it } from 'vitest'
import { emptyScene, newTimeline } from '../../defaults'
import { newModelLayer, validateModel } from '../source/modelDefaults'
import { addPrimitive } from '../modeling/poly/primitiveSource'
import type { ModelInventory } from '../content/types'
import { ModelClipDraft } from '../../editor/detail/ModelClipDraft'
import { contentTimelineContext } from '../../timeline/authoring/TimelineAuthoringContext'
import { makeKeyframeLayerSnapshotCmd } from '../../editor/commands-keyframe'
import { prepareRenderFrame } from '../../render/prepareRenderFrame'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'
import { modelChannels } from './modelChannels'
import { primitiveRenderPath } from './modelPrimitiveChannels'
import '../../registry/bootstrap'

const inventory: ModelInventory = { revision: '0'.repeat(64), nodes: [], clips: [], materials: {}, textures: [], textureColorSpaces: [] }
const source = () => {
  const layer = newModelLayer('model', 'asset')
  layer.model3d = addPrimitive(layer.model3d!, inventory, 'box', 'boxA')
  return { ...emptyScene(), layers: [layer] }
}
const path = 'model3d.modeling.objectsById.boxA.position.z'
const key = (id: string, timeMs: number, value: number | string) => ({ id, timeMs, value, easing: { type: 'linear' as const } })

describe('private 3D primitive channels', () => {
  it('resolves a stable ID after reorder and rejects a missing primitive', () => {
    const model = source().layers[0].model3d!
    const two = addPrimitive(model, inventory, 'plane', 'planeB')
    expect(primitiveRenderPath(two, path)).toBe('model3d.modeling.objects.0.position.z')
    const reordered = { ...two, modeling: { ...two.modeling!, objects: [...two.modeling!.objects].reverse() } }
    expect(primitiveRenderPath(reordered, path)).toBe('model3d.modeling.objects.1.position.z')
    expect(() => primitiveRenderPath({ ...two, modeling: { ...two.modeling!, objects: two.modeling!.objects.slice(1) } }, path)).toThrow(/missing/)
  })
  it('keys a stable primitive ID and keeps outer 2D animation in its own timeline', () => {
    const scene = source(), draft = new ModelClipDraft(scene, scene.layers[0])
    const clip = { ...newTimeline(), id: 'inside', name: 'Inside', durationMs: 1000, loop: false, autoplay: false,
      layerIds: ['model'], tracks: [] }
    const local = { ...draft.initial, timelines: [clip], initialState: { activeClipId: clip.id } }
    const context = contentTimelineContext(local, 'model', clip.id)
    const object = draft.layer.model3d!.modeling!.objects[0]
    const edited = { ...draft.layer, model3d: { ...draft.layer.model3d!, modeling: { ...draft.layer.model3d!.modeling!,
      objects: [{ ...object, position: { ...object.position, z: 2 } }] } } }
    const keyed = makeKeyframeLayerSnapshotCmd(clip.id, edited, 500, [path], context).execute(local)
    expect(keyed.timelines[0].tracks[0].target).toBe(`layers.model.${path}`)
    expect(keyed.timelines[0].tracks[0].keyframes[0].value).toBe(2)
    const saved = draft.model(keyed)
    expect(saved.animation?.version).toBe(2)
    expect(saved.modeling?.objects[0].position.z).toBe(0)
    validateModel(saved)
    const outer = { ...newTimeline(), id: 'outer', durationMs: 1000, tracks: [{ target: 'layers.model.transform.x', keyframes: [key('x0', 0, 0), key('x1', 1000, 100)] }] }
    const reopened = parseSceneJson(JSON.stringify({ ...scene, layers: [{ ...scene.layers[0], model3d: saved }], timelines: [outer] }), true)
    const frame = prepareRenderFrame(reopened, 500).scene.layers[0]
    expect(frame.transform.x).toBe(50)
    expect(frame.model3d?.modeling?.objects[0].position.z).toBe(2)
    expect(reopened.timelines[0].tracks).toHaveLength(1)
    expect(modelChannels(saved)).toContain(path)
  })

  it('samples dimension and color keys without changing logical object identity', () => {
    const scene = source(), model = scene.layers[0].model3d!
    model.animation = { version: 2, activeClipId: 'shape', clips: [{ ...newTimeline(), id: 'shape', name: 'Shape', durationMs: 1000,
      loop: false, autoplay: false, layerIds: ['content'], tracks: [
        { target: 'layers.content.model3d.modeling.objectsById.boxA.geometry.width', keyframes: [key('w0', 0, 1), key('w1', 1000, 2)] },
        { target: 'layers.content.model3d.modeling.objectsById.boxA.color', keyframes: [key('c0', 0, '#ff0000'), key('c1', 1000, '#0000ff')] },
      ] }] }
    validateModel(model)
    const frame = prepareRenderFrame(scene, 500).scene.layers[0].model3d!.modeling!.objects[0]
    expect(frame.id).toBe('boxA')
    expect(frame.geometry).toMatchObject({ kind: 'box', width: 1.5 })
    expect(frame.color).toBe('#800080')
    expect(scene.layers[0].model3d?.modeling?.objects[0].geometry).toMatchObject({ width: 1 })
  })
})
