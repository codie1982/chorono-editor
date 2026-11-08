import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newTimeline } from '../defaults'
import type { ChronoScene, Layer, Track } from '../types'
import { makeCloneForestCmd, prepareCloneForest } from './commands-clone-forest'
import { evaluateTimelines } from '../evaluator'
import { resolveLayerWorldMatrix } from '../geometry/resolveLayerWorldMatrix'
import { resolveInstanceLayer } from '../clone/InstanceResolver'
import { acquirePortableScene } from '../export/portable/PortableSceneOutput'
import { OutputResources } from '../export/resources'
import { parseSceneJson } from '../format/scene/SceneJsonConverter'

/** Small native source with a non-group parent subtree, sparse x/y keys and a
 * second unrelated clock. IDs/metadata are fixed so comparisons catch accidental
 * record loss rather than depending on global allocation counters. */
function fixture(): ChronoScene {
  const parent = { ...newRectLayer(), id: 'parent', type: 'group' as const }
  const root = { ...newRectLayer(), id: 'root', name: 'Hero', parentId: parent.id }
  const child = { ...newRectLayer(), id: 'child', parentId: root.id }
  const peer = { ...newRectLayer(), id: 'peer', parentId: parent.id }
  const timeline = { ...newTimeline(), id: 'motion', loop: false, durationMs: 1000, layerIds: [root.id, child.id], tracks: [
    track(root.id, 'transform.x', 'x0', 0, 100), track(root.id, 'transform.y', 'y0', 0, 50),
    track(child.id, 'opacity', 'opacity', 0, 0.5),
  ] }
  timeline.tracks[0].keyframes.push({ id: 'x1000', timeMs: 1000, value: 200, easing: { type: 'easeOut' }, tangentMode: 'broken' })
  const second = { ...newTimeline(), id: 'second', loop: false, durationMs: 1000, layerIds: [root.id], tracks: [track(root.id, 'transform.rotationDeg', 'rotation', 500, 30)] }
  return { ...emptyScene(), layers: [parent, root, child, peer], timelines: [timeline, second] }
}

/** Native scalar track fixture; the key ID is not replaced by test helpers. */
function track(id: string, property: string, keyId: string, timeMs: number, value: number): Track {
  return { target: `layers.${id}.${property}`, keyframes: [{ id: keyId, timeMs, value, easing: { type: 'linear' } }] }
}

/** Project a layer's current anchor using the actual evaluator and affine chain. */
function point(scene: ChronoScene, id: string, timeMs: number) {
  const layer = scene.layers.find(item => item.id === id)!
  return resolveLayerWorldMatrix(layer, scene, timeMs, evaluateTimelines(scene.timelines, timeMs)).applyToPoint({ x: layer.transform.anchorX, y: layer.transform.anchorY })
}

describe('prepared forest clone source contract', () => {
  it('normalizes parent+child, includes non-group descendants, keeps external parent and source immutable', () => {
    const base = fixture(), before = structuredClone(base)
    const command = makeCloneForestCmd(base, { sourceIds: ['root', 'child'], offsets: { root: { x: 25, y: -8 } } })
    const scene = command.execute(base), map = command.idMaps[0]
    expect(command.sourceRootIds).toEqual(['root'])
    expect(command.result.createdLayerIds).toHaveLength(2)
    expect(scene.layers.find(layer => layer.id === map.root)?.parentId).toBe('parent')
    expect(scene.layers.find(layer => layer.id === map.child)?.parentId).toBe(map.root)
    expect(base).toEqual(before)
    expect(command.undo(scene)).toEqual(base)
    expect(command.execute(command.undo(scene))).toEqual(scene)
  })

  it('copies all relevant timelines with fresh IDs and identical times/easing/tangents', () => {
    const base = fixture(), command = makeCloneForestCmd(base, { sourceIds: ['root'] }), scene = command.execute(base)
    const map = command.idMaps[0], sourceIds = new Set(base.timelines.flatMap(timeline => timeline.tracks.flatMap(track => track.keyframes.map(key => key.id))))
    for (let i = 0; i < base.timelines.length; i++) {
      const source = base.timelines[i], after = scene.timelines[i]
      const copies = after.tracks.filter(track => track.target.includes(`layers.${map.root}.`) || track.target.includes(`layers.${map.child}.`))
      expect(copies).toHaveLength(source.tracks.length)
      for (let j = 0; j < copies.length; j++) {
        expect(copies[j].keyframes.map(({ id, ...key }) => key)).toEqual(source.tracks[j].keyframes.map(({ id, ...key }) => key))
        copies[j].keyframes.forEach(key => expect(sourceIds.has(key.id)).toBe(false))
      }
      expect(after.layerIds).toContain(map.root)
    }
  })

  it('uses a constant root parent-local offset at every interpolated frame', () => {
    const base = fixture()
    base.layers[0].transform = { ...base.layers[0].transform, rotationDeg: 27, scaleX: -1.4, scaleY: 0.7 }
    const command = makeCloneForestCmd(base, { sourceIds: ['root'], offsets: { root: { x: 30, y: -10 } } })
    const scene = command.execute(base), map = command.idMaps[0]
    const parent = resolveLayerWorldMatrix(base.layers[0], base, 0, evaluateTimelines(base.timelines, 0))
    const origin = parent.applyToPoint({ x: 0, y: 0 }), delta = parent.applyToPoint({ x: 30, y: -10 })
    for (const timeMs of [0, 250, 500, 750, 1000]) {
      const original = point(scene, 'root', timeMs), copy = point(scene, map.root, timeMs)
      expect(copy.x - original.x).toBeCloseTo(delta.x - origin.x)
      expect(copy.y - original.y).toBeCloseTo(delta.y - origin.y)
    }
  })

  it('reuses all allocated IDs across preview offsets and redo', () => {
    const base = fixture(), plan = prepareCloneForest(base, { sourceIds: ['root', 'peer'], count: 2 })
    const a = plan.atOffsets({ root: { x: 1, y: 2 } }), b = plan.atOffsets({ root: { x: 30, y: 20 } })
    expect(a.idMaps).toEqual(b.idMaps)
    expect(a.result.createdLayerIds).toEqual(b.result.createdLayerIds)
    const ids = (scene: ChronoScene) => scene.timelines.flatMap(timeline => timeline.tracks.flatMap(track => track.keyframes.map(key => key.id)))
    expect(ids(a.execute(base))).toEqual(ids(b.execute(base)))
  })

  it('remaps internal forest references across roots and preserves external/asset references', () => {
    const base = fixture(), root = base.layers[1], child = base.layers[2]
    root.masks = [{ id: 'mask', maskLayerId: 'peer', mode: 'add' }, { id: 'external', maskLayerId: 'parent', mode: 'subtract' }]
    child.followPath = { pathLayerId: 'peer', progress: 0.3 }
    root.repeater = { sourceLayerId: 'child', count: 3, mode: 'linear' }
    root.motionBlur = { enabled: true, trailCount: 2, frameInterval: 1, maxOpacity: 1, velocityThreshold: 0, baked: true, bakedGroupId: 'peer' }
    const command = makeCloneForestCmd(base, { sourceIds: ['root', 'peer'] }), scene = command.execute(base), map = command.idMaps[0]
    const copy = scene.layers.find(layer => layer.id === map.root)!
    expect(copy.masks?.map(mask => mask.maskLayerId)).toEqual([map.peer, 'parent'])
    expect(copy.repeater?.sourceLayerId).toBe(map.child)
    expect(copy.motionBlur?.bakedGroupId).toBe(map.peer)
    expect(scene.layers.find(layer => layer.id === map.child)?.followPath?.pathLayerId).toBe(map.peer)
  })

  it('honors explicit active-only and no-animation options without changing legacy defaults', () => {
    const base = fixture(), command = makeCloneForestCmd(base, { sourceIds: ['root'], timelineIds: ['motion'] }), scene = command.execute(base)
    expect(scene.timelines[1]).toBe(base.timelines[1])
    expect(command.result.createdTrackTargets).toHaveLength(3)
    const noAnimation = makeCloneForestCmd(base, { sourceIds: ['root'], duplicateAnimation: false }).execute(base)
    expect(noAnimation.timelines).toEqual(base.timelines)
  })

  it('uses a placement group for procedural root input without changing source/keys', () => {
    const base = fixture()
    base.timelines[0].tracks[0].controller = { type: 'waveform', waveform: { shape: 'sine', amplitude: 10, frequency: 1, phase: 0, offset: 100, duty: 0.5 } }
    const command = makeCloneForestCmd(base, { sourceIds: ['root'], offsets: { root: { x: 20, y: -5 } } }), scene = command.execute(base), map = command.idMaps[0]
    const wrapper = scene.layers.find(layer => layer.id === command.result.suggestedSelection[0])!
    expect(wrapper.parentId).toBe('parent')
    expect(scene.layers.find(layer => layer.id === map.root)?.parentId).toBe(wrapper.id)
    expect(base.layers[1].parentId).toBe('parent')
    for (const timeMs of [0, 100, 250, 800]) {
      const a = point(scene, 'root', timeMs), b = point(scene, map.root, timeMs)
      expect(b.x - a.x).toBeCloseTo(20); expect(b.y - a.y).toBeCloseTo(-5)
    }
    expect(command.diagnostics.join(' ')).toContain('Placement')
  })

  it('materializes an independent copy of instance appearance and guards linked source changes', () => {
    const base = fixture(), instance = { ...newRectLayer(), id: 'instance', instanceOf: 'peer' }
    delete instance.style; delete instance.size; base.layers.push(instance)
    const command = makeCloneForestCmd(base, { sourceIds: ['instance'] }), scene = command.execute(base), copy = scene.layers.find(layer => layer.id === command.idMaps[0].instance)!
    expect(copy.instanceOf).toBeUndefined(); expect(copy.style).toEqual(resolveInstanceLayer(instance, base.layers)?.style)
    expect(() => command.execute({ ...base, layers: base.layers.map(layer => layer.id === 'peer' ? { ...layer, name: 'manual' } : layer) })).toThrow(/source/)
  })

  it('rejects binding-driven sources, missing/cyclic instances, and unsupported instance reference remapping', () => {
    const base = fixture()
    base.bindings = [{ id: 'binding', source: { type: 'parameter', paramId: 'p' }, target: { type: 'layerProperty', layerId: 'root', property: 'transform.x' },
      map: { inputMin: 0, inputMax: 1, outputMin: 0, outputMax: 1 } }]
    expect(() => makeCloneForestCmd(base, { sourceIds: ['root'] })).toThrow(/binding/)
    base.bindings = []; base.layers[1].instanceOf = 'missing'
    expect(() => makeCloneForestCmd(base, { sourceIds: ['root'] })).toThrow(/instance source/)
    delete base.layers[1].instanceOf; base.layers[1].masks = [{ id: 'mask', maskLayerId: 'child', mode: 'add' }]
    expect(() => makeCloneForestCmd(base, { sourceIds: ['root'], mode: 'instance' })).toThrow(/internal/)
  })

  it('refuses translated external Follow Path instead of a wrapper that cancels displacement', () => {
    const base = fixture(); base.layers[2].followPath = { pathLayerId: 'peer', progress: 0.2 }
    const plan = prepareCloneForest(base, { sourceIds: ['root'] })
    expect(() => plan.atOffsets({ root: { x: 20, y: 0 } })).toThrow(/Follow Path/)
    expect(plan.atOffsets({}).execute(base).layers).toHaveLength(6)
  })

  it('rejects stale source, added child/timeline, UUID collision and malformed hierarchy atomically', () => {
    const base = fixture(), command = makeCloneForestCmd(base, { sourceIds: ['root'] })
    expect(() => command.execute({ ...base, layers: [...base.layers, { ...newRectLayer(), id: 'manual', parentId: 'root' }] })).toThrow(/changed/)
    expect(() => command.execute({ ...base, timelines: [...base.timelines, { ...newTimeline(), id: 'manual', tracks: [track('root', 'opacity', 'new', 0, 1)] }] })).toThrow(/changed/)
    expect(() => command.execute({ ...base, layers: [...base.layers, { ...newRectLayer(), id: command.result.createdLayerIds[0] }] })).toThrow(/IDs/)
    base.layers[1].parentId = 'child'
    expect(() => makeCloneForestCmd(base, { sourceIds: ['root'] })).toThrow(/cyclic/)
  })

  it('round trips source hierarchy, keys and evaluated motion through portable save/load', async () => {
    const base = fixture(), command = makeCloneForestCmd(base, { sourceIds: ['root'], offsets: { root: { x: 12, y: -7 } } })
    const scene = command.execute(base), resources = new OutputResources(), lease = await acquirePortableScene(scene, { resources })
    try {
      const loaded = parseSceneJson(JSON.stringify(lease.value), true), id = command.idMaps[0].root
      expect(loaded.layers.find(layer => layer.id === id)?.parentId).toBe('parent')
      for (const timeMs of [0, 250, 750, 1000]) expect(point(loaded, id, timeMs)).toEqual(point(scene, id, timeMs))
      expect(loaded.timelines.flatMap(timeline => timeline.tracks.flatMap(track => track.keyframes))).toEqual(scene.timelines.flatMap(timeline => timeline.tracks.flatMap(track => track.keyframes)))
    } finally { lease.release(); resources.dispose() }
    expect(resources.getSnapshot().residency.chargedBytes).toBe(0)
  })

  it('refuses finite-input overflow and depth overflow before creating a command', () => {
    const base = fixture()
    base.timelines[0].tracks[0].keyframes[0].value = Number.MAX_VALUE
    expect(() => makeCloneForestCmd(base, { sourceIds: ['root'], offsets: { root: { x: Number.MAX_VALUE, y: 0 } } })).toThrow(/overflow/)
    const deep = fixture(); deep.layers = []
    for (let i = 0; i < 66; i++) deep.layers.push({ ...newRectLayer(), id: `depth${i}`, ...(i ? { parentId: `depth${i - 1}` } : {}) })
    expect(() => makeCloneForestCmd(deep, { sourceIds: ['depth65'] })).toThrow(/depth/)
    deep.layers.pop(); deep.layers[64].paramBindings = { 'transform.x': 'p' }
    expect(() => makeCloneForestCmd(deep, { sourceIds: ['depth64'], offsets: { depth64: { x: 1, y: 0 } } })).toThrow(/depth/)
  })

  it('refuses a reserved key UUID introduced by an unrelated timeline after preparation', () => {
    const base = fixture(), command = makeCloneForestCmd(base, { sourceIds: ['root'], timelineIds: ['motion'] })
    const scene = command.execute(base), copied = scene.timelines[0].tracks[3].keyframes[0]
    const current = { ...base, timelines: [...base.timelines, { ...newTimeline(), id: 'unrelated', tracks: [track('peer', 'opacity', copied.id, 0, 1)] }] }
    expect(() => command.execute(current)).toThrow(/key IDs/)
  })

  it('remaps particle area references without remapping image assets or external source IDs', () => {
    const base = fixture()
    const emitter = { ...base.layers[1], particleEmitter: { emitter: { area: { pathLayerId: 'child', sourceLayerId: 'peer' } } } } as Layer
    // The remapper is a typed layer-reference adapter, independent of emitter
    // sampling/default schemas; a partial embedded emitter fixture isolates it.
    base.layers[1] = emitter
    const command = makeCloneForestCmd(base, { sourceIds: ['root'] }), scene = command.execute(base), map = command.idMaps[0]
    const area = scene.layers.find(layer => layer.id === map.root)?.particleEmitter?.emitter.area
    expect(area).toEqual({ pathLayerId: map.child, sourceLayerId: 'peer' })
  })
})
