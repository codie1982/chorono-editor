import { describe, expect, it } from 'vitest'
import { emptyScene, newImageLayer, newRectLayer, newVideoLayer } from '../../defaults'
import type { Asset, Layer } from '../../types'
import { prepareRenderFrame } from '../prepareRenderFrame'
import { VisualDemandResolver } from './VisualDemandResolver'
import type { MediaFrameInput } from './types'

const asset = (id: string, type: Asset['type'] = 'image'): Asset => ({ id, name: id, type, url: id, width: 20, height: 20 })
function image(id: string, x = 0): Layer { const l = newImageLayer(id, 20, 20); l.id = id; l.transform = { ...l.transform, x, y: 0 }; return l }
function setup(layers: Layer[], assets = layers.filter(l => l.image).map(l => asset(l.image!.assetId)), overrides = new Map()) {
  const scene = { ...emptyScene(), layers, assets }
  const context = { canvas: { width: 100, height: 100 }, lineWidth: 1, miterLimit: 10,
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) } as unknown as CanvasRenderingContext2D
  const input: MediaFrameInput = { frame: prepareRenderFrame(scene, 100, overrides), context, area: { x: 0, y: 0, width: 100, height: 100 } }
  return { input, resolver: new VisualDemandResolver(), scene }
}
const ids = (input: MediaFrameInput) => new VisualDemandResolver().resolve(input).map(d => d.asset.id).sort()

describe('canonical frame media dependency demand', () => {
  it('reports missing referenced source metadata instead of claiming an empty required set is ready', () => {
    const { input, resolver } = setup([image('missing')], [])
    expect(resolver.resolve(input)).toEqual([]); expect(resolver.missing).toEqual(['missing'])
  })
  it('keeps visible/selected/prefetch-margin media and leaves distant static metadata cold', () => {
    const { input } = setup([image('in'), image('near', 150), image('far', 900)])
    expect(ids(input)).toEqual(['in'])
    expect(ids({ ...input, padding: 128 })).toEqual(['in', 'near'])
    expect(ids({ ...input, selected: new Set(['far']) })).toEqual(['far', 'in'])
  })
  it('uses materialized values, instance identity and transformed parents without mutating source', () => {
    const source = image('source', 800), instance = { ...source, id: 'copy', instanceOf: source.id, transform: { ...source.transform, x: 0 } }
    const { input, scene } = setup([source, instance], [asset('source')], new Map([[`layers.${source.id}.transform.x`, 950]]))
    const before = JSON.stringify(scene)
    expect(ids(input)).toEqual(['source']); expect(JSON.stringify(scene)).toBe(before)
    const group = { ...newRectLayer(), id: 'g', type: 'group' as const }, child = image('child'); child.parentId = group.id
    group.transform.x = 600
    expect(ids(setup([group, child]).input)).toEqual([])
  })
  it('preserves hidden/time/root-solo semantics and mask/repeater source closures outside viewport', () => {
    const host = image('host'), mask = image('mask', 900), repeat = newRectLayer()
    host.masks = [{ id: 'm', maskLayerId: mask.id, mode: 'intersect', inverted: false, feather: 0 }]
    mask.hidden = true; mask.startMs = 800
    expect(ids(setup([host, mask]).input)).toEqual(['host', 'mask'])
    const source = image('source', 900)
    const repeater: Layer = { ...repeat, type: 'repeater', repeater: { sourceLayerId: source.id, count: 2, mode: 'linear', transformStep: { x: -900, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } } }
    expect(ids(setup([source, repeater]).input)).toEqual(['source'])
    const hidden = image('hidden'); hidden.hidden = true
    const future = image('future'); future.startMs = 700
    const solo = image('solo'); solo.solo = true
    expect(ids(setup([host, hidden, future, solo]).input)).toEqual(['solo'])
  })
  it('keeps unknown effect bounds and audible offscreen video but releases muted static video', () => {
    const fx = image('fx', 900); fx.effects = { blur: 20 }
    const v = newVideoLayer('movie', 20, 20); v.transform.x = 900
    const { input } = setup([fx, v], [asset('fx'), asset('movie', 'video')])
    expect(ids(input)).toEqual(['fx', 'movie'])
    const muted = { ...v, video: { ...v.video!, muted: true } }
    expect(ids(setup([muted], [asset('movie', 'video')]).input)).toEqual([])
  })
  it('prefetches imminent and potentially moving sources conservatively without retaining every static offscreen asset', () => {
    const soon = image('soon', 900); soon.startMs = 400
    const moving = image('moving', 900), cold = image('cold', 900)
    const { input, scene } = setup([soon, moving, cold])
    scene.timelines = [{ ...scene.timelines[0], tracks: [{ target: 'layers.moving.transform.x', keyframes: [] }] }]
    const frame = prepareRenderFrame(scene, 100)
    expect(ids({ ...input, frame, prefetchMs: 500 })).toEqual(['moving', 'soon'])
    expect(new VisualDemandResolver().resolve({ ...input, frame, prefetchMs: 500 }).every(d => !d.required)).toBe(true)
  })
  it('keeps sprite-sheet dependencies and applies explicit temporal roots independently of standalone visibility', () => {
    const l: Layer = { ...image('sprite'), type: 'frameSequence', image: undefined,
      frameSequence: { assetId: 'sheet', columns: 1, rows: 1, frameCount: 1, frameWidth: 20, frameHeight: 20, fps: 30 } }
    l.hidden = true
    const { input } = setup([l], [asset('sheet', 'spriteSheet')])
    expect(ids(input)).toEqual([]); expect(ids({ ...input, rootIds: [l.id] })).toEqual(['sheet'])
  })
})
