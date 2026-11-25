import { describe, expect, it } from 'vitest'
import { emptyScene } from '../../defaults'
import { cloneSingleLayer } from '../../clone/CloneSingleLayer'
import { evaluateSceneFrame } from '../../runtime/evaluateSceneFrame'
import { prepareRenderFrame } from '../../render/prepareRenderFrame'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'
import { assertScene } from '../../mcp/protocol'
import { newModelLayer, validateModel } from '../source/modelDefaults'
import { cameraIsDriven } from '../source/cameraDrivers'
import { modelContentFrame } from './modelClipFrame'
import { assertModelClipOwnership } from './modelClipOwnership'
import { readModelChannelValue, sampleModelChannel } from './modelChannels'
import { modelEditBase } from '../content/modelEditBase'
import { assertModelContentAnimation, type ModelContentAnimation } from './ModelContentAnimation'
import type { ChronoScene } from '../../types'
import '../../registry/bootstrap'

/** Small numeric authored clips; no renderer, mixer or sampled frame data. */
function animation(path = 'rotation.y'): ModelContentAnimation {
  return { version: 1, activeClipId: 'turn', clips: [{ id: 'turn', name: 'Turn', durationMs: 1000, autoplay: false, loop: false,
    tracks: [{ target: `layers.content.model3d.${path}`, keyframes: [
      { id: 'a', timeMs: 0, value: 0, easing: { type: 'linear' } }, { id: 'b', timeMs: 1000, value: 90, easing: { type: 'linear' } },
    ] }] }] }
}
function scene(): ChronoScene {
  const layer = newModelLayer('model', 'asset')
  return { ...emptyScene(), layers: [{ ...layer, model3d: { ...layer.model3d!, version: 2, animation: animation() } }], timelines: [] }
}

describe('versioned private model animation admission', () => {
  it('roundtrips v2 source and rejects malformed/private foreign targets in both file and MCP admission', () => {
    const source = scene(), before = JSON.stringify(source)
    expect(parseSceneJson(before).layers[0].model3d).toEqual(source.layers[0].model3d)
    expect(() => assertScene(source)).not.toThrow()
    for (const target of ['layers.other.model3d.rotation.y', 'layers.content.transform.x', 'layers.content.model3d.assetId', 'layers.content.model3d.camera']) {
      const bad = scene(); bad.layers[0].model3d!.animation!.clips[0].tracks[0].target = target
      expect(() => parseSceneJson(JSON.stringify(bad))).toThrow()
      expect(() => assertScene(bad)).toThrow()
    }
    expect(JSON.stringify(source)).toBe(before)
  })
  it('does not reinterpret v1 opaque metadata or accept a v2 payload missing its schema', () => {
    const model = newModelLayer('old').model3d!
    expect(() => validateModel({ ...model, animation: { vendor: true } as never })).not.toThrow()
    expect(() => validateModel({ ...model, version: 2 })).toThrow('requires')
  })
  it.each(['negative time', 'outside time', 'NaN', 'duplicate identity', 'unknown active', 'foreign member', 'processor', 'event', 'invalid easing', 'excess clips', 'oversized source'])('rejects %s atomically', reason => {
    const value = animation(), track = value.clips[0].tracks[0]
    if (reason === 'negative time') track.keyframes[0].timeMs = -1
    if (reason === 'outside time') track.keyframes[1].timeMs = 1001
    if (reason === 'NaN') track.keyframes[1].value = NaN
    if (reason === 'duplicate identity') track.keyframes[1].id = 'a'
    if (reason === 'unknown active') value.activeClipId = 'missing'
    if (reason === 'foreign member') value.clips[0].layerIds = ['model']
    if (reason === 'processor') track.controller = { type: 'expression', expression: 'sin(time)' } as never
    if (reason === 'event') value.clips[0].events = [{ id: 'event' }] as never
    if (reason === 'invalid easing') track.keyframes[0].easing = { type: 'customBezier', bezier: { cx1: -1, cy1: 0, cx2: 1, cy2: 1 } }
    if (reason === 'excess clips') value.clips = Array.from({ length: 17 }, (_, i) => ({ ...value.clips[0], id: `clip-${i}` }))
    if (reason === 'oversized source') Object.assign(value, { unknown: 'x'.repeat(4 * 1024 ** 2) })
    expect(() => assertModelContentAnimation(value)).toThrow()
  })
})

describe('private model frame evaluation and ownership', () => {
  it('samples deterministic explicit time, holds endpoints and materializes a frame without source mutation', () => {
    const source = scene(), before = JSON.stringify(source)
    const at = (time: number) => evaluateSceneFrame(source, time).overrides
    expect(at(500).get('layers.model.model3d.rotation.y')).toBe(45)
    expect(at(1000).get('layers.model.model3d.rotation.y')).toBe(90)
    expect(at(1500).get('layers.model.model3d.rotation.y')).toBe(90)
    expect(at(0).get('layers.model.model3d.rotation.y')).toBe(0)
    expect(prepareRenderFrame(source, 500, at(500)).scene.layers[0].model3d!.rotation.y).toBe(45)
    expect(JSON.stringify(source)).toBe(before)
  })
  it('uses the owner start and loop policy; inactive clips do not mix into the active clip', () => {
    const source = scene(), layer = source.layers[0], clips = layer.model3d!.animation!
    layer.startMs = 200; clips.clips[0].loop = true
    clips.clips.push({ ...clips.clips[0], id: 'other', tracks: [{ ...clips.clips[0].tracks[0], keyframes: [{ id: 'other-key', timeMs: 0, value: -45, easing: { type: 'linear' } }] }] })
    expect(evaluateSceneFrame(source, 700).overrides.get('layers.model.model3d.rotation.y')).toBe(45)
    expect(evaluateSceneFrame(source, 1700).overrides.get('layers.model.model3d.rotation.y')).toBe(45)
    const inactive = { ...source, layers: [{ ...layer, model3d: { ...layer.model3d!, animation: { ...clips, activeClipId: null } } }] }
    expect(evaluateSceneFrame(inactive, 500).overrides.size).toBe(0)
  })
  it('resolves independent copied/live instance addresses while preserving their own start clocks', () => {
    const source = scene(), copy = cloneSingleLayer(source.layers[0]).clonedLayer, instance = cloneSingleLayer(source.layers[0], { mode: 'instance' }).clonedLayer
    copy.startMs = 250; instance.startMs = 400
    const frame = evaluateSceneFrame({ ...source, layers: [...source.layers, copy, instance] }, 500).overrides
    expect(frame.get('layers.model.model3d.rotation.y')).toBe(45)
    expect(frame.get(`layers.${copy.id}.model3d.rotation.y`)).toBe(22.5)
    expect(frame.get(`layers.${instance.id}.model3d.rotation.y`)).toBe(9)
  })
  it('refuses competing external keys, expressions, bindings, wires and supplied base values without erasing them', () => {
    for (const kind of ['timeline', 'expression', 'param', 'binding', 'wire']) {
      const source = scene(), layer = source.layers[0], target = 'model3d.rotation.y'
      if (kind === 'timeline') source.timelines = [{ id: 'legacy', durationMs: 1000, autoplay: false, loop: false, tracks: [{ target: `layers.model.${target}`, keyframes: [] }] }]
      if (kind === 'expression') layer.propertyExpressions = { version: 1, fields: { [target]: { expression: 'time', enabled: true } } } as never
      if (kind === 'param') layer.paramBindings = { [target]: 'p' }
      if (kind === 'binding') source.bindings = [{ target: { type: 'layerProperty', layerId: layer.id, property: target } }] as never
      if (kind === 'wire') source.parameterWires = [{ enabled: true, target: { layerId: layer.id, propertyPath: target } }] as never
      const before = JSON.stringify(source)
      expect(() => assertModelClipOwnership(source, layer)).toThrow('preserved')
      expect(JSON.stringify(source)).toBe(before)
    }
    const base = new Map([['layers.model.model3d.rotation.y', 12]])
    expect(() => modelContentFrame(scene(), 500, base)).toThrow('conflicts')
    expect(base.get('layers.model.model3d.rotation.y')).toBe(12)
  })
  it('keeps old 2D frames and maps borrowed, and protects an authored private camera from static gestures', () => {
    const source = emptyScene(), base = new Map<string, number>()
    expect(modelContentFrame(source, 100, base)).toBe(base)
    const camera = scene(); camera.layers[0].model3d!.animation = animation('camera.yaw')
    expect(cameraIsDriven(camera, camera.layers[0])).toBe(true)
    expect(cameraIsDriven(scene(), scene().layers[0])).toBe(false)
  })
  it('bounds overshooting samples without rewriting authored endpoints/easing', () => {
    expect(sampleModelChannel('model3d.camera.pitch', 110)).toBe(90)
    expect(sampleModelChannel('model3d.scale', -5)).toBe(.001)
    const source = scene(), data = source.layers[0].model3d!.animation!
    data.clips[0].tracks[0].target = 'layers.content.model3d.scale'
    data.clips[0].tracks[0].keyframes = [
      { id: 'a', timeMs: 0, value: 1, easing: { type: 'customBezier', bezier: { cx1: .2, cy1: -4, cx2: .8, cy2: -4 } } },
      { id: 'b', timeMs: 1000, value: 2, easing: { type: 'linear' } },
    ]
    const before = JSON.stringify(source)
    expect(evaluateSceneFrame(source, 500).overrides.get('layers.model.model3d.scale')).toBe(.001)
    expect(JSON.stringify(source)).toBe(before)
  })
  it('treats absent legacy camera roll as zero while allowing a private roll key', () => {
    const source = scene(), layer = source.layers[0], old = structuredClone(layer)
    delete old.model3d!.camera.roll
    expect(() => validateModel(old.model3d!)).not.toThrow()
    expect(readModelChannelValue(old, 'model3d.camera.roll')).toBe(0)
    const next = structuredClone(old); next.model3d!.camera.roll = 45
    expect(readModelChannelValue(next, 'model3d.camera.roll')).toBe(45)
    expect(modelEditBase(next, old, old, true).model3d!.camera.roll).toBeUndefined()
    expect(() => assertModelContentAnimation(animation('camera.roll'))).not.toThrow()
    expect(sampleModelChannel('model3d.camera.roll', 200)).toBe(180)
    expect(JSON.stringify(old.model3d!.camera)).not.toContain('roll')
  })
})
