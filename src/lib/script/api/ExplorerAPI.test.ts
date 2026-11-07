import { describe, expect, it } from 'vitest'
import type { ChronoScene, Layer } from '../../types'
import type { EditorCommand } from '../../editor/commands-keyframe'
import { emptyScene, newRectLayer, newTimeline } from '../../defaults'
import { ExplorerAPI } from './ExplorerAPI'
import { resolveLayerWorldMatrix } from '../../geometry/resolveLayerWorldMatrix'

function shape(id: string, patch: Partial<Layer> = {}): Layer { return { ...newRectLayer(), id, name: id, ...patch } }
function group(id: string, patch: Partial<Layer> = {}): Layer {
  return shape(id, { type: 'group', shape: undefined, style: undefined, size: undefined,
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 }, ...patch })
}
function harness(layers: Layer[], timelines: ChronoScene['timelines'] = []) {
  let scene = { ...emptyScene(), layers, timelines }
  const commands: EditorCommand[] = []
  const explorer = new ExplorerAPI({ resolveTimelineId: () => timelines[0]?.id, host: {
    getScene: () => scene, applyCommand: command => { scene = command.execute(scene); commands.push(command) },
  } })
  return { explorer, commands, get scene() { return scene }, undo() { const command = commands[commands.length - 1]; scene = command.undo(scene); return command },
    redo(command: EditorCommand) { scene = command.execute(scene) } }
}
function expectWorld(actual: number[], expected: number[]) { expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, 7)) }

describe('Explorer domain scripting API', () => {
  it('reads a detached hierarchy, inherited flags, link/effect data, bounds and selected-timeline tracks', () => {
    const parent = group('g', { locked: true, hidden: true })
    const child = shape('child', { parentId: 'g', effectsChain: [{ id: 'blur', type: 'blur', enabled: true, params: { radius: 4 } }],
      masks: [{ id: 'm', maskLayerId: 'mask', mode: 'add' }] })
    const a = { ...newTimeline(), id: 'a', tracks: [{ target: 'layers.child.transform.x', keyframes: [{ id: 'a1', timeMs: 0, value: 25, easing: { type: 'linear' as const } }] }] }
    const b = { ...newTimeline(), id: 'b', tracks: [{ target: 'layers.child.opacity', keyframes: [{ id: 'b1', timeMs: 0, value: 0.5, easing: { type: 'linear' as const } }] }] }
    // Child-before-parent ordering must not produce an incorrect depth.
    const h = harness([child, parent, shape('mask')], [a, b])
    expect(h.explorer.roots).toEqual(['g', 'mask'])
    expect(h.explorer.children('g')).toEqual(['child'])
    expect(h.explorer.ancestors('child')).toEqual(['g'])
    expect(h.explorer.descendants('g')).toEqual(['child'])
    expect(h.explorer.tree[0].children[0].depth).toBe(1)
    const node = h.explorer.node('child')
    expect(node.inherited).toEqual({ hidden: true, locked: true, frozen: false })
    expect(node.links.maskLayerIds).toEqual(['mask'])
    expect(node.tracks).toEqual([{ timelineId: 'a', target: 'layers.child.transform.x', keyframeCount: 1 }])
    expect(node.worldBounds).toBeNull() // Hidden ancestors have no rendered world bounds.
    node.data!.transform.x = 999; node.effects.chain[0].params.radius = 99
    expect(child.transform.x).not.toBe(999)
    expect(child.effectsChain![0].params.radius).toBe(4)
    expect(h.explorer.node('child', { timelineId: 'b' }).tracks[0].target).toBe('layers.child.opacity')
  })

  it('uses the UI search facets including negation, animation scope and optional ancestor inclusion', () => {
    const child = shape('Logo', { name: 'Brand Logo', parentId: 'g', hidden: true, colorLabel: '#ff0000', masks: [{ id: 'm', maskLayerId: 'mask', mode: 'add' }] })
    const a = { ...newTimeline(), id: 'a', tracks: [{ target: 'layers.Logo.opacity', keyframes: [{ id: 'k', timeMs: 0, value: 1, easing: { type: 'linear' as const } }] }] }
    const h = harness([group('g'), child, shape('mask'), shape('plain')], [a, { ...newTimeline(), id: 'b' }])
    expect(h.explorer.query('type:rect name:logo has:masks is:hidden color:#ff0000 parent:g has:keyframes').map(node => node.id)).toEqual(['Logo'])
    expect(h.explorer.query('name:logo -is:hidden')).toEqual([])
    expect(h.explorer.query('has:keyframes', { timelineId: 'b' })).toEqual([])
    expect(h.explorer.query({ search: 'name:logo', includeAncestors: true }).map(node => node.id)).toEqual(['g', 'Logo'])
    expect(h.explorer.query({ parentId: 'g', recursive: true }).map(node => node.id)).toEqual(['Logo'])
    expect(h.explorer.query('', { offset: 1, limit: 1 }).map(node => node.id)).toEqual(['Logo'])
    expect(() => h.explorer.query('', { limit: -1 })).toThrow(/offset\/limit/)
  })

  it('renames, reorders siblings and applies bulk state flags as individual reversible commands', () => {
    const h = harness([shape('a'), shape('b'), shape('c')])
    const before = h.scene
    h.explorer.rename('a', '  Alpha  ')
    expect(h.scene.layers[0].name).toBe('Alpha')
    h.undo(); expect(h.scene).toBe(before)
    h.explorer.moveAfter('a', 'c')
    expect(h.explorer.roots).toEqual(['b', 'c', 'a'])
    h.explorer.moveBefore('a', 'b')
    expect(h.explorer.roots).toEqual(['a', 'b', 'c'])
    h.explorer.reorder('a', 1)
    expect(h.explorer.roots).toEqual(['b', 'a', 'c'])
    const flagBefore = h.scene
    h.explorer.setFlags(['a', 'b'], { hidden: true, locked: true, solo: true, pinned: true })
    expect(h.scene.layers.filter(layer => layer.id !== 'c').every(layer => layer.hidden && layer.locked && layer.solo && layer.pinned)).toBe(true)
    h.undo(); expect(h.scene).toBe(flagBefore)
    expect(() => h.explorer.reorder('a', 3)).toThrow(/bounds/)
    expect(() => h.explorer.setFlags(['a'], { hidden: 'yes' } as never)).toThrow(/boolean/)
  })

  it('preserves anchored world transforms and bounds when reparenting into a rotated scaled group', () => {
    const child = shape('child', { transform: { x: 31, y: 19, scaleX: 1.2, scaleY: 0.8, rotationDeg: 17, anchorX: 22, anchorY: 9 } })
    const parent = group('g', { transform: { x: 100, y: 70, scaleX: 2, scaleY: 2, rotationDeg: 45, anchorX: 15, anchorY: -5 } })
    const h = harness([child, parent]), before = h.scene
    const world = resolveLayerWorldMatrix(child, before).toArray()
    const bounds = h.explorer.node('child').worldBounds!
    expect(h.explorer.reparent('child', 'g')).toEqual(['child'])
    expect(h.scene.layers.find(layer => layer.id === 'child')!.parentId).toBe('g')
    expectWorld(resolveLayerWorldMatrix(h.scene.layers.find(layer => layer.id === 'child')!, h.scene).toArray(), world)
    const afterBounds = h.explorer.node('child').worldBounds!
    for (const key of ['x', 'y', 'width', 'height'] as const) expect(afterBounds[key]).toBeCloseTo(bounds[key], 7)
    const command = h.undo(); expect(h.scene).toBe(before)
    h.redo(command); expectWorld(resolveLayerWorldMatrix(h.scene.layers.find(layer => layer.id === 'child')!, h.scene).toArray(), world)
  })

  it('rejects cycles, inherited locks, singular/sheared compensation and animated keep-world moves atomically', () => {
    const parent = group('g'), nested = group('nested', { parentId: 'g' }), child = shape('child')
    const h = harness([parent, nested, child]), before = h.scene
    expect(() => h.explorer.reparent('g', 'nested')).toThrow(/cycle/)
    expect(() => h.explorer.reparent('child', 'missing')).toThrow(/not found/)
    expect(() => h.explorer.reparent('child', 'child')).toThrow(/group/)
    h.explorer.setFlags('g', { locked: true })
    expect(() => h.explorer.rename('nested', 'No')).toThrow(/Unlock/)
    expect(() => h.explorer.reparent('child', 'g')).toThrow(/Unlock/)
    h.undo(); expect(h.scene).toBe(before)
    const singular = harness([shape('child'), group('zero', { transform: { ...parent.transform, scaleX: 0 } })])
    expect(() => singular.explorer.reparent('child', 'zero')).toThrow(/singular/)
    const shear = harness([shape('child', { transform: { ...child.transform, rotationDeg: 45 } }), group('stretched', { transform: { ...parent.transform, scaleX: 2 } })])
    expect(() => shear.explorer.reparent('child', 'stretched')).toThrow(/shear/)
    expect(shear.commands).toHaveLength(0)
    const animated = harness([shape('child'), group('g')], [{ ...newTimeline(), id: 'a', tracks: [{ target: 'layers.child.transform.x', keyframes: [] }] }])
    expect(() => animated.explorer.reparent('child', 'g')).toThrow(/baking/)
    animated.explorer.reparent('child', 'g', { keepWorld: false })
    expect(animated.scene.layers.find(layer => layer.id === 'child')!.transform).toEqual(child.transform)
    const bound = harness([shape('child'), group('g')])
    bound.scene.bindings = [{ id: 'bound', source: { type: 'parameter', paramId: 'position' }, target: { type: 'layerProperty', layerId: 'child', property: 'transform.x' },
      map: { inputMin: 0, inputMax: 1, outputMin: 0, outputMax: 100 } }]
    expect(() => bound.explorer.reparent('child', 'g')).toThrow(/baking/)
    expect(bound.commands).toHaveLength(0)
  })

  it('groups siblings with an identity parent, preserving world placement and exact undo', () => {
    const parent = group('parent', { transform: { x: 90, y: 40, scaleX: 2, scaleY: 2, rotationDeg: 20, anchorX: 12, anchorY: 8 } })
    const a = shape('a', { parentId: 'parent' }), b = shape('b', { parentId: 'parent', transform: { ...a.transform, x: 220 } })
    const h = harness([parent, a, b]), before = h.scene
    const worldA = resolveLayerWorldMatrix(a, before).toArray(), worldB = resolveLayerWorldMatrix(b, before).toArray()
    const id = h.explorer.group(['a', 'b'], { name: 'Pair' })
    expect(h.explorer.node(id).data).toMatchObject({ name: 'Pair', parentId: 'parent', transform: { x: 0, y: 0 } })
    expectWorld(resolveLayerWorldMatrix(h.scene.layers.find(layer => layer.id === 'a')!, h.scene).toArray(), worldA)
    expectWorld(resolveLayerWorldMatrix(h.scene.layers.find(layer => layer.id === 'b')!, h.scene).toArray(), worldB)
    h.undo(); expect(h.scene).toBe(before)
    const mixed = harness([parent, a, shape('root')])
    expect(() => mixed.explorer.group(['a', 'root'])).toThrow(/sibling/)
  })

  it('ungroups transformed anchored children without a visual jump and restores all data on undo', () => {
    const parent = group('parent', { opacity: 0.4, transform: { x: 90, y: 45, scaleX: 1.5, scaleY: 1.5, rotationDeg: 30, anchorX: 15, anchorY: 22 } })
    const child = shape('child', { parentId: 'parent', opacity: 0.8, transform: { x: 10, y: 25, scaleX: 1.2, scaleY: 0.7, rotationDeg: -10, anchorX: 12, anchorY: 9 } })
    const h = harness([parent, child], [{ ...newTimeline(), id: 'a', layerIds: ['parent', 'child'] }]), before = h.scene
    const world = resolveLayerWorldMatrix(child, before).toArray()
    expect(h.explorer.ungroup('parent')).toEqual(['child'])
    expect(h.scene.layers).toHaveLength(1)
    expect(h.scene.layers[0].parentId).toBeUndefined()
    expect(h.scene.layers[0].opacity).toBeCloseTo(0.32)
    expectWorld(resolveLayerWorldMatrix(h.scene.layers[0], h.scene).toArray(), world)
    expect(h.scene.timelines[0].layerIds).toEqual(['child'])
    const command = h.undo(); expect(h.scene).toBe(before)
    h.redo(command); expectWorld(resolveLayerWorldMatrix(h.scene.layers[0], h.scene).toArray(), world)
  })

  it('keeps child animation intact when removing an identity group and rejects lossy group effects', () => {
    const parent = group('g'), child = shape('child', { parentId: 'g' })
    const timeline = { ...newTimeline(), id: 'a', tracks: [{ target: 'layers.child.transform.x', keyframes: [{ id: 'k', timeMs: 0, value: 17, easing: { type: 'linear' as const } }] }] }
    const h = harness([parent, child], [timeline])
    h.explorer.ungroup('g')
    expect(h.scene.layers[0].transform).toEqual(child.transform)
    expect(h.scene.timelines[0].tracks[0]).toBe(timeline.tracks[0])
    const effects = harness([group('g', { effects: { blur: 4 } }), child])
    expect(() => effects.explorer.ungroup('g')).toThrow(/effects/)
    expect(effects.commands).toHaveLength(0)
  })

  it('fails safely for malformed imported cycles and never moves a locked descendant indirectly', () => {
    const malformed = harness([group('a', { parentId: 'b' }), group('b', { parentId: 'a' })])
    expect(() => malformed.explorer.tree).toThrow(/Cyclic/)
    const h = harness([group('g'), shape('child', { parentId: 'g', locked: true }), group('target')])
    expect(() => h.explorer.reparent('g', 'target')).toThrow(/Unlock/)
    expect(() => h.explorer.group(['g'])).toThrow(/Unlock/)
    expect(h.commands).toHaveLength(0)
  })
})
