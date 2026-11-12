import { describe, expect, it, vi } from 'vitest'
import '../../registry/bootstrap'
import { emptyScene, newRectLayer, newSMState, newSMTransition, newStateMachine } from '../../defaults'
import type { ChronoScene } from '../../types'
import { evaluateSceneFrame } from '../../runtime/evaluateSceneFrame'
import { ChronoPlayer } from '../../player/ChronoPlayer'
import { prepareCloneForest, makeCloneForestCmd } from '../../editor/commands-clone-forest'
import { resolveLayerWorldMatrix } from '../../geometry/resolveLayerWorldMatrix'
import { preparePropertyExpressionBake } from './preparePropertyExpressionBake'
import { makeApplyPropertyExpressionBakeCmd } from '../../editor/inputExpressions/PropertyExpressionBakeCommand'
import { exportToRuntime } from '../../export/runtimeExport'
import { exportSVG } from '../../export/vector/SVGExporter'
import { prepareRenderFrame } from '../../render/prepareRenderFrame'
import { propertyExpressionScope } from './PropertyExpressionScope'
import { resolveLayerWorldBounds } from '../../geometry/resolveLayerWorldBounds'
import { hitTestLayer } from '../../renderer'
import { materializeLayerOverrides } from '../../render/materializeOverrides'
import { drivenChannelReason } from '../../timeline/authoring/keyableChannels'

/** Shared deterministic project used by SDK, clone, frame and bake adapters. */
function fixture(): ChronoScene {
  const scene = emptyScene()
  scene.composition.durationMs = 2000
  scene.layers = ['a', 'b'].map(id => ({ ...newRectLayer(), id, name: id }))
  scene.timelines = [{ id: 'motion', durationMs: 2000, loop: false, autoplay: true, tracks: [] }]
  scene.layers[0].propertyExpressions = { version: 1, fields: {
    'size.width': { resultType: 'number', formula: '100+20*sin(timeSec*pi)', timelineId: 'motion', sources: {} },
  } }
  return scene
}

describe('property expression adapters', () => {
  it('keeps selection geometry, bounds and picking on the drawn size without changing authored fallback', () => {
    const scene = fixture(), layer = scene.layers[0]
    scene.layers = [layer]
    layer.transform = { ...layer.transform, x: 0, y: 0, anchorX: 0, anchorY: 0 }
    const frame = evaluateSceneFrame(scene, 500).overrides
    const displayed = materializeLayerOverrides(layer, frame)
    expect(displayed.size?.width).toBe(120)
    expect(resolveLayerWorldBounds(layer, scene, 500, frame)?.width).toBe(120)
    expect(hitTestLayer(scene, 500, 110, 30, frame)).toBe(layer.id)
    expect(hitTestLayer(scene, 500, 140, 30, frame)).toBeNull()
    expect(drivenChannelReason(scene, layer, 'size.width')).toMatch(/live expression/)
    expect(layer.size?.width).toBe(160)
  })
  it('samples a dependency scope with binding/native sources rather than reevaluating unrelated scene tracks', () => {
    const scene = fixture(), source = { ...newRectLayer(), id: 'source' }
    scene.layers.push(source, ...Array.from({ length: 100 }, (_, index) => ({ ...newRectLayer(), id: 'unused-' + index })))
    scene.layers[0].propertyExpressions!.fields['size.width'] = { resultType: 'number', formula: 'height+timeSec', timelineId: 'motion', sources: { height: { layerId: 'b', propertyPath: 'size.height', valueType: 'number' } } }
    scene.bindings = [{ id: 'binding', source: { type: 'layerProperty', layerId: 'source', property: 'size.height' }, target: { type: 'layerProperty', layerId: 'b', property: 'size.height' }, map: { inputMin: 0, inputMax: 100, outputMin: 0, outputMax: 200 } }]
    scene.timelines[0].tracks = [{ target: 'layers.source.size.height', keyframes: [{ id: 'start', timeMs: 0, value: 40, easing: { type: 'linear' } }, { id: 'end', timeMs: 2000, value: 100, easing: { type: 'linear' } }] },
      ...scene.layers.filter(layer => layer.id.startsWith('unused')).map(layer => ({ target: 'layers.' + layer.id + '.size.width', keyframes: [{ id: layer.id, timeMs: 0, value: 500, easing: { type: 'linear' as const } }] }))]
    const before = JSON.stringify(scene), scope = propertyExpressionScope(scene, { layerId: 'a', propertyPath: 'size.width', valueType: 'number' })
    expect(scope.layers.map(layer => layer.id)).toEqual(['a', 'b', 'source']); expect(scope.timelines[0].tracks).toHaveLength(1)
    for (const timeMs of [0, 250, 1000, 2000]) expect(evaluateSceneFrame(scope, timeMs).overrides.get('layers.a.size.width')).toBe(evaluateSceneFrame(scene, timeMs).overrides.get('layers.a.size.width'))
    expect(JSON.stringify(scene)).toBe(before)
  })
  it('shares SDK, prepared raster and static SVG evaluation at the same explicit time', () => {
    const scene = fixture(), player = new ChronoPlayer(scene)
    for (const timeMs of [0, 250, 500, 1000, 2000]) {
      const expected = evaluateSceneFrame(scene, timeMs).overrides.get('layers.a.size.width')
      expect(player.tick(timeMs).overrides.get('layers.a.size.width')).toBe(expected)
      expect(prepareRenderFrame(scene, timeMs).scene.layers[0].size?.width).toBe(expected)
    }
    expect(exportSVG(scene, { timeMs: 500 }).svg).toContain('L120 72')
  })
  it('respects inactive and blended state-machine ownership in the SDK', () => {
    let wallMs = 0
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => wallMs)
    try {
      const scene = fixture(), machine = newStateMachine('idle')
      scene.timelines.push({ id: 'idle', durationMs: 2000, loop: false, autoplay: false, tracks: [] })
      const active = newSMState('motion', 'active'); machine.states.push(active)
      machine.transitions = [{ ...newSMTransition(machine.initialStateId, active.id, 'go'), blendMs: 100 }]
      scene.stateMachines = [machine]
      const player = new ChronoPlayer(scene)
      expect(player.tick(500).overrides.has('layers.a.size.width')).toBe(false)
      player.dispatch('go'); wallMs = 100; player.tick(500)
      wallMs = 150; expect(player.tick(500).overrides.get('layers.a.size.width')).toBe(140)
      wallMs = 200; expect(player.tick(500).overrides.get('layers.a.size.width')).toBe(120)
    } finally { clock.mockRestore() }
  })
  it('remaps named forest sources, preserves external refs and uses a placement parent for driven transforms', () => {
    const scene = fixture()
    scene.layers[0].propertyExpressions!.fields['transform.x'] = { resultType: 'number', formula: 'input + timeSec*10', timelineId: 'motion', sources: { input: { layerId: 'b', propertyPath: 'size.width', valueType: 'number' } } }
    const command = makeCloneForestCmd(scene, { sourceIds: ['a', 'b'], offsets: { a: { x: 50, y: 20 }, b: { x: 50, y: 20 } } }), next = command.execute(scene)
    const id = command.idMaps[0].a, cloned = next.layers.find(layer => layer.id === id)!
    expect(cloned.propertyExpressions!.fields['transform.x'].sources.input.layerId).toBe(command.idMaps[0].b)
    expect(scene.layers[0].propertyExpressions!.fields['transform.x'].sources.input.layerId).toBe('b')
    const frame = evaluateSceneFrame(next, 500).overrides
    const pivot = (layerId: string) => { const layer = next.layers.find(item => item.id === layerId)!; return resolveLayerWorldMatrix(layer, next, 500, frame).applyToPoint({ x: layer.transform.anchorX, y: layer.transform.anchorY }) }
    expect(pivot(id).x - pivot('a').x).toBeCloseTo(50); expect(pivot(id).y - pivot('a').y).toBeCloseTo(20)
    const external = makeCloneForestCmd(scene, { sourceIds: ['a'] }), copied = external.execute(scene).layers.find(layer => layer.id === external.idMaps[0].a)!
    expect(copied.propertyExpressions!.fields['transform.x'].sources.input.layerId).toBe('b')
  })
  it('shifts copied clocks once and honors animation-disabled scope and instance field resolution', () => {
    const scene = fixture(), prepared = prepareCloneForest(scene, { sourceIds: ['a'] })
    const delayed = prepared.atPlacements([{ roots: { a: { x: 20, y: 0 } }, timeOffsetMs: 250 }]), next = delayed.execute(scene), id = delayed.idMaps[0].a
    expect(evaluateSceneFrame(next, 500).overrides.get('layers.' + id + '.size.width')).toBeCloseTo(100 + 20 * Math.sin(.25 * Math.PI))
    const plain = makeCloneForestCmd(scene, { sourceIds: ['a'], duplicateAnimation: false })
    expect(plain.execute(scene).layers.find(layer => layer.id === plain.idMaps[0].a)!.propertyExpressions).toBeUndefined()
    const linked = makeCloneForestCmd(scene, { sourceIds: ['a'], mode: 'instance' }), instance = linked.execute(scene)
    expect(evaluateSceneFrame(instance, 500).overrides.get('layers.' + linked.idMaps[0].a + '.size.width')).toBe(120)
  })
  it('bakes the canonical composition clock into stable native keys and removes only the converted driver', () => {
    const scene = fixture(), opts = { startMs: 0, endMs: 2000, fps: 60, tolerance: .001 }
    const prepared = preparePropertyExpressionBake(scene, 'a', 'size.width', opts), command = makeApplyPropertyExpressionBakeCmd(prepared), next = command.execute(scene)
    expect(next.layers[0].propertyExpressions).toBeUndefined(); expect(next.layers[0].size?.width).toBe(160)
    expect(next.timelines).toHaveLength(2); expect(next.timelines[0]).toBe(scene.timelines[0])
    for (const timeMs of [0, 250, 500, 1000, 1500, 2000]) expect(evaluateSceneFrame(next, timeMs).overrides.get('layers.a.size.width')).toBeCloseTo(evaluateSceneFrame(scene, timeMs).overrides.get('layers.a.size.width') as number, 1)
    expect(command.undo(next)).toBe(scene)
    expect(command.execute(scene).timelines[1].tracks[0].keyframes).toEqual(next.timelines[1].tracks[0].keyframes)
    expect(() => command.execute({ ...scene })).toThrow(/Source changed/)
    expect(exportToRuntime(next).timelines[1].tracks[0].keyframes.length).toBeGreaterThan(2)
  })
  it('refuses invalid samples, cancellation, excessive work and stateful baking atomically', () => {
    const scene = fixture(), opts = { startMs: 0, endMs: 2000, fps: 60, tolerance: .001 }
    const before = JSON.stringify(scene)
    expect(() => preparePropertyExpressionBake(scene, 'a', 'size.width', { ...opts, signal: { aborted: true } })).toThrow(/cancelled/)
    expect(() => preparePropertyExpressionBake(scene, 'a', 'size.width', { ...opts, endMs: 3000 })).toThrow(/composition/)
    const broken = structuredClone(scene); broken.layers[0].propertyExpressions!.fields['size.width'].formula = '1/(timeSec-1)'
    expect(() => preparePropertyExpressionBake(broken, 'a', 'size.width', opts)).toThrow(/failed/)
    scene.stateMachines = [newStateMachine('motion')]
    expect(() => preparePropertyExpressionBake(scene, 'a', 'size.width', opts)).toThrow(/state recording/)
    delete scene.stateMachines; expect(JSON.stringify(scene)).toBe(before)
  })
})
