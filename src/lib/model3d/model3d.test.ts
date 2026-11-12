import { describe, expect, it } from 'vitest'
import { modelDefaults, newModelLayer, validateModel } from './source/modelDefaults'
import { cameraGesture } from './source/cameraGesture'
import { readModelDocument } from './source/readModelDocument'
import { modelBytes, triangleDocument, glbBytes } from './__tests__/fixtures'
import { emptyScene } from '../defaults'
import { resolveLayerWorldBounds } from '../geometry/resolveLayerWorldBounds'
import { cloneSingleLayer } from '../clone/CloneSingleLayer'
import { resolveInstanceLayer } from '../clone/InstanceResolver'
import { AssetIndex } from '../asset/AssetIndex'
import { exportToRuntime } from '../export/runtimeExport'
import { RuntimeValidator } from '../export/RuntimeValidator'
import { FileTypeDetector } from '../import/FileTypeDetector'
import { evaluateSceneFrame } from '../runtime/evaluateSceneFrame'
import { parseSceneJson } from '../format/scene/SceneJsonConverter'
import { cameraIsDriven } from './source/cameraDrivers'
import type { ChronoScene } from '../types'
import '../registry/bootstrap'

describe('boxed 3D source admission', () => {
  it('accepts equivalent self-contained glTF and aligned GLB 2 without mutating input', () => {
    const bytes = glbBytes(), before = bytes.slice(0)
    expect(readModelDocument(bytes).json).toEqual(readModelDocument(modelBytes()).json)
    expect(bytes).toEqual(before)
  })
  it.each(['https://remote/model.bin', '../model.bin', 'file:///tmp/a.bin'])('refuses external dependency %s before loader/network work', uri => {
    const json = triangleDocument(); json.buffers[0].uri = uri
    expect(() => readModelDocument(modelBytes(json))).toThrow('embedded resources')
  })
  it('rejects malformed headers, excessive accessors, unsupported codecs and graph cycles', () => {
    const bad = glbBytes(); new DataView(bad).setUint32(8, 1, true)
    expect(() => readModelDocument(bad)).toThrow('container')
    const huge = triangleDocument(); huge.accessors[0].count = 10_000_000
    expect(() => readModelDocument(modelBytes(huge))).toThrow('workload')
    const codec = triangleDocument(); codec.extensionsRequired = ['KHR_draco_mesh_compression']
    expect(() => readModelDocument(modelBytes(codec))).toThrow('extension')
    const cycle = triangleDocument(); cycle.nodes[0].children = [0]
    expect(() => readModelDocument(modelBytes(cycle))).toThrow('Cyclic')
  })
  it('rejects truncated buffer views before decoding', () => {
    const json = triangleDocument(); json.bufferViews[0].byteLength = 10000
    expect(() => readModelDocument(modelBytes(json))).toThrow('buffer view')
  })
  it('validates fresh defaults and rejects incomplete/nonfinite/singular camera data', () => {
    const data = modelDefaults('asset'); expect(() => validateModel(data)).not.toThrow()
    for (const camera of [{ ...data.camera, pitch: 90 }, { ...data.camera, distance: 0 }, { ...data.camera, fov: NaN }]) expect(() => validateModel({ ...data, camera })).toThrow()
    expect(() => validateModel({ ...data, position: {} as any })).toThrow()
  })
})

describe('native 3D integration', () => {
  it('detects both model formats through the ordinary import pipeline', async () => {
    const detector = new FileTypeDetector()
    expect(await detector.detect(new File([glbBytes()], 'model.glb'))).toBe('model/gltf-binary')
    expect(await detector.detect(new File([modelBytes()], 'model.gltf', { type: 'application/json' }))).toBe('model/gltf+json')
    expect(FileTypeDetector.isSupported('model/gltf-binary')).toBe(true)
  })
  it('preserves legacy internal key evaluation and serializable source without authoring new 3D tracks', () => {
    const layer = newModelLayer('model', 'asset'), base = emptyScene()
    const scene: ChronoScene = { ...base, layers: [layer], timelines: [{ id: 'orbit', durationMs: 1000, autoplay: false, loop: false, tracks: [{ target: 'layers.model.model3d.rotation.y', keyframes: [{ id: 'a', timeMs: 0, value: 0, easing: { type: 'linear' } }, { id: 'b', timeMs: 1000, value: 90, easing: { type: 'linear' } }] }] }] }
    expect(evaluateSceneFrame(scene, 500).overrides.get('layers.model.model3d.rotation.y')).toBe(45)
    const loaded = parseSceneJson(JSON.stringify(scene), true)
    expect(loaded.layers[0].model3d).toEqual(layer.model3d)
    expect(loaded.layers[0].transform).toEqual(layer.transform)
  })
  it('protects camera keys and bindings from mouse/reset source edits', () => {
    const layer = newModelLayer('model', 'asset'), scene = { ...emptyScene(), layers: [layer] }
    expect(cameraIsDriven(scene, layer)).toBe(false)
    expect(cameraIsDriven(scene, { ...layer, paramBindings: { 'model3d.camera.yaw': 'yaw' } })).toBe(true)
    expect(cameraIsDriven(scene, { ...layer, paramBindings: { 'model3d.position.x': 'x' } })).toBe(false)
    const animated: ChronoScene = { ...scene, timelines: [{ id: 'model-motion', durationMs: 1000, autoplay: false, loop: false,
      tracks: [{ target: 'layers.model.model3d.rotation.y', keyframes: [{ id: 'rotation', timeMs: 0, value: 30, easing: { type: 'linear' } }] }] }] }
    const before = JSON.stringify(animated)
    expect(cameraIsDriven(animated, layer)).toBe(false)
    const cameraKeys: ChronoScene = { ...animated, timelines: animated.timelines.map(timeline => ({ ...timeline,
      tracks: timeline.tracks.map(track => ({ ...track, target: 'layers.model.model3d.camera.yaw' })) })) }
    expect(cameraIsDriven(cameraKeys, layer)).toBe(true)
    expect(JSON.stringify(animated)).toBe(before)
  })
})

describe('camera/2D separation and existing editing contracts', () => {
  it('orbits, pans in camera coordinates and dollies without changing source/model pose', () => {
    const data = modelDefaults('asset'), before = structuredClone(data)
    expect(cameraGesture(data, 100, 1000, 'orbit').camera.pitch).toBe(89)
    expect(cameraGesture(data, 0, 100000, 'dolly').camera.distance).toBe(1000)
    const pan = cameraGesture(data, 100, 0, 'pan')
    expect(pan.camera.targetX).not.toBe(0); expect(pan.position).toEqual(data.position); expect(data).toEqual(before)
  })
  it('preserves independent model data in copy and resolves live instance source data', () => {
    const source = newModelLayer('model', 'asset')
    const copy = cloneSingleLayer(source).clonedLayer
    copy.model3d!.camera.yaw = 99; expect(source.model3d!.camera.yaw).toBe(30)
    const instance = cloneSingleLayer(source, { mode: 'instance' }).clonedLayer
    expect(instance.model3d).toBeUndefined()
    expect(resolveInstanceLayer(instance, [source, instance])?.model3d).toEqual(source.model3d)
  })
  it('uses ordinary parent-aware rectangular 2D bounds and asset reference tracking', () => {
    const layer = newModelLayer('model', 'asset'); layer.transform.x = 12
    const scene = { ...emptyScene(), layers: [layer] }
    expect(resolveLayerWorldBounds(layer, scene)).toEqual({ x: 12, y: layer.transform.y, width: 400, height: 400 })
    const index = new AssetIndex(); index.build([layer]); expect(index.getRefCount('asset')).toBe(1)
    expect(JSON.parse(JSON.stringify(layer)).model3d).toEqual(layer.model3d)
  })
  it('refuses basic/native runtime export explicitly rather than silently dropping 3D', () => {
    const scene = { ...emptyScene(), layers: [newModelLayer('model', 'missing')] }
    expect(() => exportToRuntime(scene)).toThrow('3D')
    expect(new RuntimeValidator().validate(scene).errors.map(error => error.code)).toEqual(expect.arrayContaining(['UNSUPPORTED_3D', 'MISSING_ASSET']))
  })
})
