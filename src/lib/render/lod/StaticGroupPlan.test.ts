import { expect, it } from 'vitest'
import { emptyScene, newRectLayer } from '@/lib/defaults'
import type { ChronoScene, Layer } from '@/lib/types'
import { LayerIndex } from '@/lib/scene/LayerIndex'
import { rendererRegistry } from '@/lib/registry'
import { StaticGroupPlan } from './StaticGroupPlan'
import { StaticGroupLodCache } from './StaticGroupLodCache'

function fixture() {
  const group = { ...newRectLayer(), id: 'group', type: 'group' as const }
  const children = Array.from({ length: 10 }, (_, i) => ({ ...newRectLayer(), id: `child${i}`, parentId: group.id }))
  return { group, children, scene: { ...emptyScene(), layers: [group, ...children] } }
}
const context = { lineWidth: 1, miterLimit: 10 } as CanvasRenderingContext2D
function plan(scene: ChronoScene, selected: string[] = [], overrides = new Map()) {
  return new StaticGroupPlan(scene, new LayerIndex(scene.layers), overrides, 0, selected, l => rendererRegistry.find(l))
}

it('allows static contents under a moving root, while rejecting animated or selected descendants', () => {
  const { group, children, scene } = fixture()
  scene.timelines = [{ id: 't', durationMs: 1000, autoplay: false, loop: false, tracks: [{ target: 'layers.group.transform.x', keyframes: [] }] }]
  expect(plan(scene).get(group, context)?.ids).toHaveLength(10)
  expect(plan(scene, [children[1].id]).get(group, context)).toBeNull()
  scene.timelines[0].tracks[0].target = `layers.${children[1].id}.transform.x`
  expect(plan(scene).get(group, context)).toBeNull()
})

it('exact versions change after in-place geometry edits, and unknown/bound/effected content falls back', () => {
  const { group, children, scene } = fixture()
  const first = plan(scene).get(group, context)!
  children[0].size!.width += 10
  expect(plan(scene).get(group, context)!.version).not.toBe(first.version)
  for (const change of [{ type: 'text' }, { paramBindings: { 'style.fill.color': 'theme' } },
    { effects: { blur: 3 } }, { blendMode: 'multiply' }, { hidden: true }, { instanceOf: 'source' }]) {
    const changed = { ...scene, layers: scene.layers.map(l => l.id === children[0].id ? { ...l, ...change } as Layer : l) }
    expect(plan(changed).get(group, context)).toBeNull()
  }
  expect(plan(scene, [], new Map([[`layers.${children[0].id}.opacity`, 1]])).get(group, context)).toBeNull()
})

it('clears the previous weak scene owner on immutable edits/undo or project replacement', () => {
  const cache = new StaticGroupLodCache({ maxIdleMs: 0 })
  const scene = emptyScene(); cache.beginScene(scene)
  const old = { width: 1, height: 1 } as HTMLCanvasElement
  cache.set('old', 1, old)
  cache.beginScene(scene); expect(cache.count()).toBe(1)
  cache.beginScene({ ...scene }); expect(cache.count()).toBe(0)
})

it('keeps declared live descendants dynamic even while their fallback produces no override', () => {
  const { scene, group, children } = fixture()
  children[0].propertyExpressions = { version: 1, fields: { 'size.width': { resultType: 'number', formula: '100+timeSec', timelineId: 'motion', sources: {} } } }
  expect(plan(scene).get(group, context)).toBeNull()
  children[0].propertyExpressions = undefined
  group.propertyExpressions = { version: 1, fields: { 'transform.scaleX': { resultType: 'number', formula: '1+timeSec', timelineId: 'motion', sources: {} } } }
  expect(plan(scene).allowsProjection(group, { e: 0, f: 0 })).toBe(false)
})

it('bounds exact version work and refuses cyclic or oversized runtime data', async () => {
  const { boundedContentVersion } = await import('./boundedContentVersion')
  const value = { colors: ['#fff', 'quote"\\', '🌿'], width: 30 }
  expect(boundedContentVersion(value, 4096)).toBe(JSON.stringify(value))
  expect(boundedContentVersion({ name: 'x'.repeat(10000) }, 1024)).toBeNull()
  const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic
  expect(boundedContentVersion(cyclic, 4096)).toBeNull()
})

it('falls back for animated rotation/scale and fractional moving phases, while allowing integer shifts', () => {
  const { group, scene } = fixture()
  scene.timelines = [{ id: 't', durationMs: 1000, autoplay: false, loop: false,
    tracks: [{ target: 'layers.group.transform.x', keyframes: [] }] }]
  expect(plan(scene).allowsProjection(group, { e: 10, f: 20 })).toBe(true)
  expect(plan(scene).allowsProjection(group, { e: 10.25, f: 20 })).toBe(false)
  scene.timelines[0].tracks[0].target = 'layers.group.transform.rotationDeg'
  expect(plan(scene).allowsProjection(group, { e: 10, f: 20 })).toBe(false)
})
