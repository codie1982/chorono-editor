import { describe, expect, it } from 'vitest'
import { AudioDemandResolver } from './AudioDemandResolver'
import { emptyScene, DEFAULT_TRANSFORM } from '../defaults'
import type { Asset, ChronoScene, Layer } from '../types'

const audio = (id: string, startMs = 0, endMs = 1000, extra: Partial<Layer> = {}): Layer => ({
  id, name: id, type: 'audio', startMs, endMs, audio: { assetId: id, loop: false }, ...extra,
}) as Layer
const asset = (id: string): Asset => ({ id, name: id, url: id, type: 'audio' })
const fixture = (): ChronoScene => ({ ...emptyScene(), layers: [audio('a'), audio('b', 500, 1500), audio('c', 10000, 11000)],
  assets: ['a', 'b', 'c'].map(asset), timelines: [{ id: 't', tracks: [], durationMs: 20000, autoplay: false, loop: false }] })
const ids = (assets: Asset[]) => assets.map(item => item.id)

describe('audible source demand', () => {
  it('uses half-open authored intervals and rate-scaled 500ms lookahead, including paused preload', () => {
    const scene = fixture(), resolver = new AudioDemandResolver()
    expect(ids(resolver.resolve(scene, 0, 1))).toEqual(['a'])
    expect(ids(resolver.resolve(scene, 1, 1))).toEqual(['a', 'b'])
    expect(ids(resolver.resolve(scene, 1000, 1))).toEqual(['b'])
    expect(ids(resolver.resolve(scene, 0, 2))).toEqual(['a', 'b'])
    expect(ids(resolver.resolve(scene, 0, 0))).toEqual(['a'])
    expect(ids(resolver.resolve(scene, 10000, 1))).toEqual(['c'])
    expect(resolver.resolve(scene, NaN, 1)).toEqual([])
    scene.layers = [audio('a', 100, 100)]
    expect(resolver.resolve(scene, 0, 1)).toEqual([])
  })

  it('preserves offscreen audio, dedupes shared assets, and excludes static mute/hidden ancestry', () => {
    const scene = fixture(), resolver = new AudioDemandResolver()
    scene.layers = [audio('a', 0, 1000, { transform: { ...DEFAULT_TRANSFORM, x: 100000, y: 100000 } }), audio('copy', 0, 1000, { audio: { assetId: 'a' } }),
      audio('b', 0, 1000, { audio: { assetId: 'b', muted: true } }), audio('c', 0, 1000, { parentId: 'hidden' }),
      { id: 'hidden', type: 'group', hidden: true } as Layer]
    expect(ids(resolver.resolve(scene, 0, 1))).toEqual(['a'])
    scene.layers = scene.layers.map(layer => layer.id === 'hidden' ? { ...layer, hidden: false } : layer)
    expect(ids(resolver.resolve(scene, 0, 1))).toEqual(['a', 'c'])
  })

  it('reuses existing clone/timeline/solo semantics and notices scope contents changing in place', () => {
    const scene = fixture(), resolver = new AudioDemandResolver()
    scene.layers = [audio('a', 0, 1000, { audio: { assetId: 'a', timelineId: 't' } }), audio('b', 0, 1000)]
    scene.timelines = [...scene.timelines, { ...scene.timelines[0], id: 'clone', layerIds: ['a'] }]
    const scope = ['clone']
    expect(ids(resolver.resolve(scene, 0, 1, { timelineIds: scope }))).toEqual(['a', 'b'])
    scope[0] = 'missing'
    expect(ids(resolver.resolve(scene, 0, 1, { timelineIds: scope }))).toEqual(['b'])
    scene.layers = scene.layers.map(layer => layer.id === 'a' ? { ...layer, solo: true } : layer)
    expect(ids(resolver.resolve(scene, 0, 1))).toEqual(['a'])
  })

  it('keeps unknown/incorrect source duration conservative and replaces URL metadata without retaining old assets', () => {
    const scene = fixture(), resolver = new AudioDemandResolver()
    scene.assets = [{ ...asset('a'), durationMs: 5 }]
    expect(ids(resolver.resolve(scene, 600, 1))).toEqual(['a'])
    const replacement = { ...scene.assets[0], url: 'new' }
    scene.assets = [replacement]
    expect(resolver.resolve(scene, 600, 1)[0]).toBe(replacement)
    scene.layers = []; expect(resolver.resolve(scene, 0, 1)).toEqual([])
  })
})
