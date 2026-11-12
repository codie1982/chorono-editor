import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer, newTimeline } from '../defaults'
import type { ChronoScene, Layer } from '../types'
import { prepareArrayForest } from './commands-array-forest'
import { defaultGridArraySettings, defaultLinearArraySettings, defaultPathArraySettings, defaultRadialArraySettings } from '../array/ArrayTypes'
import { evaluateTimelines } from '../evaluator'
import { resolveLayerWorldMatrix } from '../geometry/resolveLayerWorldMatrix'
import { createLayerWorldBoundsResolver } from '../geometry/resolveLayerWorldBounds'
import { acquirePortableScene } from '../export/portable/PortableSceneOutput'
import { OutputResources } from '../export/resources'
import { parseSceneJson } from '../format/scene/SceneJsonConverter'

/** Native fixed-ID source with two roots, a child, two clocks and spare duration
 * for explicit timing. Tests compare canonical evaluated output, not solver math. */
function fixture(): ChronoScene {
  const rect = (id: string, x: number, y: number): Layer => ({ ...newRectLayer(), id, name: id,
    size: { width: 20, height: 10 }, transform: { x, y, anchorX: 0, anchorY: 0, scaleX: 1, scaleY: 1, rotationDeg: 0 } })
  const root = rect('hero', 10, 20), child = { ...rect('child', 3, 4), parentId: 'hero' }, peer = rect('peer', 60, 20)
  const a = { ...newTimeline(), id: 'a', loop: false, durationMs: 2000, layerIds: ['hero', 'child', 'peer'], tracks: [
    { target: 'layers.hero.transform.x', keyframes: [
      { id: 'x0', timeMs: 0, value: 10, easing: { type: 'linear' as const } },
      { id: 'x1', timeMs: 1000, value: 110, easing: { type: 'easeOut' as const }, tangentMode: 'broken' as const },
    ] },
  ] }
  const b = { ...newTimeline(), id: 'b', durationMs: 2000, loop: false, layerIds: ['child'], tracks: [
    { target: 'layers.child.opacity', keyframes: [{ id: 'alpha', timeMs: 0, value: 0.4, easing: { type: 'hold' as const } }] },
  ] }
  return { ...emptyScene(), composition: { ...emptyScene().composition, durationMs: 2000 }, layers: [root, child, peer], timelines: [a, b] }
}
/** Canonical rendered anchor at composition ms. */
function point(scene: ChronoScene, id: string, ms = 500) {
  const layer = scene.layers.find(value => value.id === id)!
  return resolveLayerWorldMatrix(layer, scene, ms, evaluateTimelines(scene.timelines, ms)).applyToPoint({ x: layer.transform.anchorX, y: layer.transform.anchorY })
}
const settings = () => ({ ...defaultLinearArraySettings(), count: 3, move: { x: 100, y: 25 } })

describe('V5 prepared forest arrays', () => {
  it('normalizes roots, copies every timeline/reference once per occurrence and preserves sources/undo', () => {
    const base = fixture(); base.layers[0].masks = [{ id: 'm', maskLayerId: 'peer', mode: 'add' }]
    const saved = structuredClone(base), plan = prepareArrayForest(base, { sourceIds: ['hero', 'child', 'peer'], timeMs: 500, settings: settings() })
    expect(plan.summary).toEqual({ sourceRoots: 2, sourceLayers: 3, totalOccurrences: 3, newOccurrences: 2, newLayers: 6, newKeys: 6 })
    const command = plan.buildCommand(), result = command.execute(base)
    expect(plan.buildCommand()).toBe(command); expect(command.idMaps).toHaveLength(2)
    for (const map of command.idMaps) {
      expect(result.layers.find(layer => layer.id === map.child)?.parentId).toBe(map.hero)
      expect(result.layers.find(layer => layer.id === map.hero)?.masks?.[0].maskLayerId).toBe(map.peer)
      expect(result.timelines[1].tracks.some(track => track.target === `layers.${map.child}.opacity`)).toBe(true)
    }
    expect(base).toEqual(saved); expect(command.undo(result)).toEqual(base)
    expect(command.execute(command.undo(result))).toEqual(result)
  })

  it('keeps keyed relative motion and world translation under a reflected/nonuniform parent', () => {
    const base = fixture(), parent: Layer = { ...newRectLayer(), id: 'p', type: 'group', transform: {
      x: 200, y: 100, anchorX: 0, anchorY: 0, rotationDeg: 25, scaleX: -2, scaleY: 0.7 } }
    base.layers.unshift(parent); base.layers.find(layer => layer.id === 'hero')!.parentId = 'p'
    const plan = prepareArrayForest(base, { sourceIds: ['hero', 'peer'], timeMs: 500, settings: { ...settings(), count: 2 } })
    const command = plan.buildCommand(), after = command.execute(base), map = command.idMaps[0]
    for (const id of ['hero', 'peer']) for (const ms of [0, 250, 900]) {
      const before = point(base, id, ms), copy = point(after, map[id], ms)
      expect(copy.x - before.x).toBeCloseTo(100); expect(copy.y - before.y).toBeCloseTo(25)
    }
    expect(after.layers.find(layer => layer.id === map.hero)?.parentId).toBe('p')
  })

  it('uses real parent/local axes and an explicit active/selection pivot', () => {
    const base = fixture(); base.timelines = []
    const parent: Layer = { ...newRectLayer(), id: 'p', type: 'group', transform: {
      x: 100, y: 50, anchorX: 0, anchorY: 0, rotationDeg: 90, scaleX: 1, scaleY: 1 } }
    base.layers.unshift(parent); base.layers.find(layer => layer.id === 'hero')!.parentId = 'p'
    base.layers.find(layer => layer.id === 'hero')!.transform.rotationDeg = 90
    for (const [space, dx, dy] of [['parent', 0, 100], ['local', -100, 0]] as const) {
      const plan = prepareArrayForest(base, { sourceIds: ['hero'], timeMs: 0, settings: { ...settings(), space, count: 2, move: { x: 100, y: 0 } } })
      const command = plan.buildCommand(), after = command.execute(base), original = point(base, 'hero', 0), copy = point(after, command.idMaps[0].hero, 0)
      expect(copy.x - original.x).toBeCloseTo(dx); expect(copy.y - original.y).toBeCloseTo(dy)
    }
    const common = prepareArrayForest(base, { sourceIds: ['hero', 'peer'], primaryId: 'hero', timeMs: 0, settings: settings() })
    const active = prepareArrayForest(base, { sourceIds: ['hero', 'peer'], primaryId: 'child', pivotMode: 'active', timeMs: 0, settings: settings() })
    expect(active.reference.pivotWorld).toEqual(point(base, 'hero', 0))
    expect(common.reference.pivotWorld).not.toEqual(active.reference.pivotWorld)
  })

  it('preserves keyed channels behind rotation/scale placement parents', () => {
    const base = fixture(), plan = prepareArrayForest(base, { sourceIds: ['hero', 'peer'], timeMs: 500,
      settings: { ...settings(), count: 2, rotationDeg: 90, move: { x: 0, y: 0 }, scale: { x: 2, y: 2 } } })
    const command = plan.buildCommand(), after = command.execute(base), map = command.idMaps[0], pivot = plan.reference.pivotWorld
    expect(plan.summary.newLayers).toBe(5)
    for (const id of ['hero', 'peer']) for (const ms of [0, 500, 1000]) {
      const original = point(base, id, ms), copy = point(after, map[id], ms)
      expect(copy.x).toBeCloseTo(pivot.x - 2 * (original.y - pivot.y))
      expect(copy.y).toBeCloseTo(pivot.y + 2 * (original.x - pivot.x))
    }
    const copied = after.timelines[0].tracks.find(track => track.target === `layers.${map.hero}.transform.x`)!
    expect(copied.keyframes.map(({ id, ...key }) => key)).toEqual(base.timelines[0].tracks[0].keyframes.map(({ id, ...key }) => key))
  })

  it('supports grid and radial occurrence policies without modifying the source occurrence', () => {
    const base = fixture(); base.timelines = []
    const grid = prepareArrayForest(base, { sourceIds: ['hero', 'peer'], timeMs: 0,
      settings: { ...defaultGridArraySettings(), columns: 2, rows: 2 } })
    expect(grid.summary.newOccurrences).toBe(3); expect(grid.summary.newLayers).toBe(9)
    const radial = prepareArrayForest(base, { sourceIds: ['hero'], timeMs: 0,
      settings: { ...defaultRadialArraySettings(), count: 4, center: { x: 200, y: 200 }, radius: 100 } })
    const command = radial.buildCommand(), after = command.execute(base)
    expect(point(after, command.idMaps[0].hero, 0)).toEqual({ x: 300, y: 200 })
    expect(after.layers.slice(0, base.layers.length)).toEqual(base.layers)
    const extra = prepareArrayForest(base, { sourceIds: ['hero'], timeMs: 0,
      settings: { ...settings(), count: 2, sourcePolicy: 'clone-source-too' } })
    expect(extra.summary.newOccurrences).toBe(2)
    expect(point(extra.buildCommand().execute(base), extra.buildCommand().idMaps[0].hero, 0)).toEqual(point(base, 'hero', 0))
  })

  it('places path arrays on the fully transformed provider, including parent rotation and scale', () => {
    const base = fixture(); base.timelines = []
    const p: Layer = { ...newRectLayer(), id: 'p', type: 'group', transform: {
      x: 300, y: 100, anchorX: 0, anchorY: 0, rotationDeg: 90, scaleX: 2, scaleY: 1 } }
    const path: Layer = { ...newRectLayer(), id: 'path', type: 'path', parentId: 'p', transform: {
      x: 0, y: 0, anchorX: 0, anchorY: 0, rotationDeg: 0, scaleX: 1, scaleY: 1 }, path: { closed: false, anchors: [{ x: 0, y: 0 }, { x: 100, y: 0 }] } }
    base.layers.push(p, path)
    const plan = prepareArrayForest(base, { sourceIds: ['hero'], timeMs: 0,
      settings: { ...defaultPathArraySettings('path'), count: 2, alignToTangent: false } })
    const command = plan.buildCommand(), after = command.execute(base)
    expect(point(after, command.idMaps[0].hero, 0).x).toBeCloseTo(300)
    expect(point(after, command.idMaps[0].hero, 0).y).toBeCloseTo(100)
    expect(point(after, command.idMaps[1].hero, 0).y).toBeCloseTo(300)
    const changed = { ...base, layers: base.layers.map(layer => layer.id === 'p' ? { ...layer, transform: { ...layer.transform, x: 301 } } : layer) }
    expect(() => command.execute(changed)).toThrow(/parent|changed/)
  })

  it('shifts full keys in bounds, and preview matches Apply at the shifted authoring frame', () => {
    const base = fixture(), plan = prepareArrayForest(base, { sourceIds: ['hero'], timeMs: 500,
      settings: { ...settings(), count: 2, timeOffsetMs: 250 } })
    const command = plan.buildCommand(), after = command.execute(base), id = command.idMaps[0].hero
    const keys = after.timelines[0].tracks.find(track => track.target === `layers.${id}.transform.x`)!.keyframes
    expect(keys.map(key => key.timeMs)).toEqual([250, 1250])
    expect(point(after, id).x).toBeCloseTo(point(base, 'hero', 250).x + 100)
    const bounds = createLayerWorldBoundsResolver(after, 500, evaluateTimelines(after.timelines, 500))(after.layers.find(layer => layer.id === id)!)!
    expect(plan.preview.outlines[0].points[0].x).toBeCloseTo(bounds.x)
    expect(plan.preview.outlines[0].points[0].y).toBeCloseTo(bounds.y)
    expect(() => prepareArrayForest(base, { sourceIds: ['hero'], timeMs: 500, settings: { ...settings(), count: 2, timeOffsetMs: 1500 } })).toThrow(/duration/)
  })

  it('rejects lossy shear, oversized/fractional counts and stale source atomically', () => {
    const base = fixture(), plan = prepareArrayForest(base, { sourceIds: ['hero'], timeMs: 500, settings: settings() })
    expect(() => plan.assertCurrent({ ...base, layers: base.layers.map(layer => layer.id === 'hero' ? { ...layer, name: 'manual' } : layer) })).toThrow(/changed/)
    for (const property of ['durationMs', 'width', 'height'] as const) {
      const changed = { ...base, composition: { ...base.composition, [property]: base.composition[property] + 1 } }
      expect(() => plan.assertCurrent(changed)).toThrow(/composition/)
      expect(() => plan.buildCommand().execute(changed)).toThrow(/composition/)
    }
    expect(() => prepareArrayForest(base, { sourceIds: ['hero'], timeMs: 500, settings: { ...settings(), count: 1.5 } })).toThrow(/integer/)
    expect(() => prepareArrayForest(base, { sourceIds: ['hero'], timeMs: 500, settings: { ...defaultGridArraySettings(), rows: 5000, columns: 5000 } })).toThrow(/limit/)
    const parent = { ...newRectLayer(), id: 'p', type: 'group' as const, transform: { ...newRectLayer().transform, scaleX: 2, scaleY: 1 } }
    base.layers.unshift(parent); base.layers.find(layer => layer.id === 'hero')!.parentId = 'p'
    expect(() => prepareArrayForest(base, { sourceIds: ['hero'], timeMs: 500, settings: { ...settings(), rotationDeg: 45 } })).toThrow(/shear/)
  })

  it('preflights linked-reference capability and exact nonuniform wrapper capacity', () => {
    const linked = fixture(); linked.layers[0].masks = [{ id: 'm', maskLayerId: 'child', mode: 'add' }]
    expect(() => prepareArrayForest(linked, { sourceIds: ['hero'], timeMs: 0,
      settings: { ...settings(), cloneMode: 'instance' } })).toThrow(/Linked instances/)
    const base = fixture(); base.timelines = []
    for (let i = 0; i < 4992; i++) base.layers.push({ ...newRectLayer(), id: `spare${i}` })
    const plan = prepareArrayForest(base, { sourceIds: ['hero'], timeMs: 0,
      settings: { ...settings(), sourcePolicy: 'clone-source-too', count: 2, rotationDeg: 30 } })
    expect(plan.summary.newLayers).toBe(5)
    expect(plan.buildCommand().execute(base).layers).toHaveLength(5000)
  })

  it('bounds previews without serializing drafts and round-trips the applied source', async () => {
    const base = fixture(); base.timelines = []
    const snapshot = structuredClone(base), plan = prepareArrayForest(base, { sourceIds: ['hero'], timeMs: 0, settings: { ...settings(), count: 500 } })
    expect(plan.preview.truncated).toBe(true); expect(plan.preview.outlines.length).toBeLessThanOrEqual(128)
    expect(base).toEqual(snapshot)
    const command = plan.buildCommand(), after = command.execute(base), resources = new OutputResources()
    const lease = await acquirePortableScene(after, { resources })
    try { const loaded = parseSceneJson(JSON.stringify(lease.value), true)
      expect(loaded.layers).toEqual(after.layers); expect(loaded.timelines).toEqual(after.timelines)
    } finally { lease.release(); resources.dispose() }
    expect(command.undo(after)).toEqual(base)
  })
})
