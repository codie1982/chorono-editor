import { describe, expect, it } from 'vitest'
import { emptyScene, newRectLayer } from '@/lib/defaults'
import { LayerIndex } from '@/lib/scene/LayerIndex'
import type { Layer } from '@/lib/types'
import type { LayerRendererPlugin } from '@/lib/registry/LayerRendererRegistry'
import { PaintFrame } from './PaintFrame'
import { nativePaintBounds } from './nativePaintBounds'
import { visibleCanvasArea } from './visibleCanvasArea'
import { PaintWorkMonitor } from '@/lib/resources/performance/PaintWorkMonitor'

const box = { x: 0, y: 0, width: 100, height: 100 }
const native: LayerRendererPlugin = { id: 'native', supports: () => true, render() {},
  paint: { alphaSafe: true, localBounds: nativePaintBounds } }
const group: LayerRendererPlugin = { ...native, paint: { alphaSafe: true, sceneChildren: true } }
function context(e = 0, alpha = 1, matrix = {}) {
  return { globalAlpha: alpha, lineWidth: 1, miterLimit: 10,
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e, f: 0, ...matrix }) } as unknown as CanvasRenderingContext2D
}
function frame(layers: Layer[], selected: string[] = [], find = (layer: Layer) => layer.type === 'group' ? group : native) {
  return new PaintFrame(layers.length, new LayerIndex(layers), find, box, selected,
    effect => ['blur','shadow'].includes(effect.type))
}

it('converts actual CSS pan/zoom and clipping into backing pixels, including fully clipped/invalid layout', () => {
  expect(visibleCanvasArea({ left: -200, top: -100, width: 800, height: 400 },
    { left: 0, top: 0, width: 400, height: 200 }, 1600, 800)).toEqual({ x: 400, y: 200, width: 800, height: 400 })
  expect(visibleCanvasArea({ left: 500, top: 0, width: 100, height: 100 },
    { left: 0, top: 0, width: 100, height: 100 }, 100, 100)?.width).toBe(0)
  expect(visibleCanvasArea({ left: 0, top: 0, width: 0, height: 100 },
    { left: 0, top: 0, width: 100, height: 100 }, 100, 100)).toBeUndefined()
})

it('keeps transformed/stroked edge paint and rejects only certified offscreen paint', () => {
  const layer = newRectLayer(); layer.size = { width: 20, height: 20 }
  const p = frame([layer])
  expect(p.reject(layer, context(120), true)).toBe(true)
  layer.style!.stroke = { color: '#fff', width: 4, alignment: 'outside' }
  expect(p.reject(layer, context(120), true)).toBe(false)
  expect(p.reject(layer, context(200, 1, { a: -1, e: 110 }), true)).toBe(false)
  expect(p.reject(layer, context(200, 1, { a: 0, d: 0 }), true)).toBe(false)
  expect(p.reject(layer, context(200, 1, { a: NaN }), true)).toBe(false)
})

it('treats selected ancestors, expanding/temporal effects and destination operations conservatively', () => {
  const a = newRectLayer(), child = newRectLayer(); a.type = 'group'; child.parentId = a.id
  expect(frame([a, child], [child.id]).reject(a, context(0, 0), true)).toBe(false)
  for (const change of [{ blendMode: 'destination-in' },
    { effectsChain: [{ id: 'fx', type: 'custom', enabled: true, params: {} }] },
    { motionBlur: { enabled: true, baked: false } }]) {
    const layer = { ...child, ...change } as Layer
    expect(frame([layer]).reject(layer, context(200, 0), true)).toBe(false)
  }
  const custom = { ...native, paint: undefined }
  expect(frame([child], [], () => custom).reject(child, context(200, 0), true)).toBe(false)
})

it('culls certified empty effect/mask subtrees but preserves expanding paint at nonzero alpha',()=>{
  const a=newRectLayer(),b=newRectLayer();a.type='group';b.parentId=a.id
  a.effectsChain=[{id:'fx',type:'shadow',enabled:true,params:{blur:30,offsetX:100}}]
  b.effects={blur:20};a.masks=[{id:'mask',maskLayerId:'external',mode:'subtract',inverted:true,feather:9}]
  expect(frame([a,b]).reject(a,context(0,0),true)).toBe(true)
  expect(frame([a,b]).reject(a,context(200,1),true)).toBe(false)
  a.effectsChain.push({id:'unknown',type:'custom',enabled:true,params:{}})
  expect(frame([a,b]).reject(a,context(0,0),true)).toBe(false)
})

it('requires explicit effect certification and preserves temporal/selected/destination dependencies',()=>{
  const layer=newRectLayer();layer.effectsChain=[{id:'fx',type:'shadow',enabled:true,params:{}}]
  const noCertification=new PaintFrame(1,new LayerIndex([layer]),()=>native,box,[])
  expect(noCertification.reject(layer,context(0,0),true)).toBe(false)
  expect(frame([layer],[layer.id]).reject(layer,context(0,0),true)).toBe(false)
  layer.motionBlur={enabled:true,baked:false,trailCount:3,frameInterval:30,maxOpacity:0.6,velocityThreshold:0}
  expect(frame([layer]).reject(layer,context(0,0),true)).toBe(false)
  layer.motionBlur.baked=true;layer.blendMode='destination-in'
  expect(frame([layer]).reject(layer,context(0,0),true)).toBe(false)
})

it('skips safe transparent subtrees, counts unique layers and lets visible repeater/source dispatch win', () => {
  const a = newRectLayer(), b = newRectLayer(); a.type = 'group'; b.parentId = a.id
  const p = frame([a, b]); p.visit()
  expect(p.reject(a, context(0, 0), true)).toBe(true)
  expect(p.snapshot(true)).toMatchObject({ total: 2, culled: 2, processed: 0, visits: 1, culledVisits: 1 })
  p.visit(); p.dispatch(b); p.visit(); p.dispatch(b)
  expect(p.snapshot(true)).toMatchObject({ processed: 1, culled: 1, unvisited: 0, visits: 3 })
  b.blendMode = 'copy'
  expect(frame([a, b]).reject(a, context(0, 0), true)).toBe(false)
})

it('rebuilds decisions after in-place edits and never retains stale panel samples across projects', () => {
  const layer = newRectLayer(); layer.opacity = 0
  expect(frame([layer]).reject(layer, context(0, 0), true)).toBe(true)
  layer.opacity = 1
  expect(frame([layer]).reject(layer, context(), true)).toBe(false)
  const monitor = new PaintWorkMonitor(), scene = emptyScene(), next = { ...scene }
  expect(monitor.getSnapshot(scene)).toBeNull()
  const statistics = frame([layer]).snapshot(false)
  monitor.record(scene, statistics); statistics.processed = 999
  expect(monitor.getSnapshot(scene)?.processed).toBe(0)
  expect(monitor.getSnapshot(scene)?.completed).toBe(false)
  expect(monitor.getSnapshot(next)).toBeNull()
})

describe('native bounds opt-out', () => {
  it('preserves text ink, natural-size images, arrow heads and particle output with unknown extents', () => {
    for (const type of ['text', 'particleEmitter', 'pathStroke', 'image', 'shape']) {
      const layer = { ...newRectLayer(), type, shapeKind: 'arrow', image: { objectFit: 'none' } } as Layer
      expect(nativePaintBounds(layer, context())).toBeNull()
    }
  })
})
