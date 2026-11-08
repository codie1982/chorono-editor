import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer } from '../defaults'
import type { ChronoScene, Layer } from '../types'
import { createLayerWorldBoundsResolver } from './resolveLayerWorldBounds'

/** Source access, not elapsed time, proves that unused scopes do no bulk work.
 * The getter borrows the original immutable layer array. */
function observedScene(scene: ChronoScene) {
  let reads = 0
  const source = { ...scene, get layers() { reads++; return scene.layers } }
  return { source, reads: () => reads }
}

describe('deferred bounds preparation', () => {
  it('does not touch layers or evaluate timelines until the first query', () => {
    const layer = newRectLayer(), observed = observedScene({ ...emptyScene(), layers: [layer] })
    let timelineReads = 0
    const scene = { ...observed.source, get layers() { return observed.source.layers },
      get timelines() { timelineReads++; return [] } }
    const initial = observed.reads()
    const resolve = createLayerWorldBoundsResolver(scene, 500, undefined, { deferPreparation: true })
    expect(observed.reads()).toBe(initial); expect(timelineReads).toBe(0)
    const box = resolve(layer), reads = observed.reads()
    expect(box).not.toBeNull(); expect(reads).toBeGreaterThan(initial); expect(timelineReads).toBe(1)
    expect(resolve(layer)).toBe(box); expect(observed.reads()).toBe(reads); expect(timelineReads).toBe(1)
  })

  it('keeps eager preparation as the default and explicit false policy', () => {
    const layer = newRectLayer(), observed = observedScene({ ...emptyScene(), layers: [layer] })
    createLayerWorldBoundsResolver(observed.source)
    expect(observed.reads()).toBeGreaterThan(0)
    const before = observed.reads()
    createLayerWorldBoundsResolver(observed.source, 0, undefined, { deferPreparation: false })
    expect(observed.reads()).toBeGreaterThan(before)
  })

  it('preserves group, instance and animated geometry with an independent next-frame scope', () => {
    const group: Layer = { ...newRectLayer(), type: 'group', id: 'parent',
      transform: { ...newRectLayer().transform, x: 100, y: 50 } }
    const shape = { ...newRectLayer(), id: 'source', parentId: group.id }
    const instance = { ...shape, id: 'instance', instanceOf: shape.id,
      transform: { ...shape.transform, x: 200 } }
    const scene = { ...emptyScene(), layers: [group, shape, instance] }
    const old = JSON.stringify(scene), overrides = new Map([
      ['layers.source.size.width', 220], ['layers.instance.transform.x', 350],
    ])
    const eager = createLayerWorldBoundsResolver(scene, 800, overrides)
    const deferred = createLayerWorldBoundsResolver(scene, 800, overrides, { deferPreparation: true })
    for (const layer of scene.layers) expect(deferred(layer)).toEqual(eager(layer))
    const previous = deferred(group)!, snapshot = { ...previous }
    const next = createLayerWorldBoundsResolver(scene, 900,
      new Map([['layers.instance.transform.x', 600]]), { deferPreparation: true })
    expect(next(group)).not.toEqual(previous)
    expect(deferred(group)).toBe(previous); expect(previous).toEqual(snapshot)
    expect(JSON.stringify(scene)).toBe(old)
  })

  it('propagates preparation failures at the documented boundary and allows a retry', () => {
    const layer = newRectLayer(), original = emptyScene()
    let unavailable = true
    const scene = { ...original, get layers() {
      if (unavailable) throw new Error('source unavailable')
      return [layer]
    } }
    expect(() => createLayerWorldBoundsResolver(scene)).toThrow('source unavailable')
    const deferred = createLayerWorldBoundsResolver(scene, 0, new Map(), { deferPreparation: true })
    expect(() => deferred(layer)).toThrow('source unavailable')
    unavailable = false
    expect(deferred(layer)).not.toBeNull()
  })

  it('retains null results for unsupported and hidden layers without rebuilding', () => {
    const layer = { ...newRectLayer(), hidden: true }, observed = observedScene({ ...emptyScene(), layers: [layer] })
    const resolve = createLayerWorldBoundsResolver(observed.source, 0, new Map(), { deferPreparation: true })
    expect(resolve(layer)).toBeNull()
    const reads = observed.reads()
    expect(resolve(layer)).toBeNull(); expect(observed.reads()).toBe(reads)
  })
})
