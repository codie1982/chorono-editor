import { afterEach, describe, expect, it, vi } from 'vitest'
import { EffectRegistry, effectRegistry, type EffectDefinition } from './index'
import { CanvasSurfaceScope } from '@/lib/render/resources/CanvasSurfaceScope'
import { CanvasSurfacePool } from '@/lib/render/resources/CanvasSurfacePool'
import { gpuImageEffects } from '@/lib/render/gpu/effects/GPUImageEffects'
import { surfaceStub as canvasStub } from '@/lib/render/resources/__tests__/surfaceStub'
const pools: CanvasSurfacePool[] = []
/** Isolates timer/lease ownership in each test without allocating pixel arrays. */
function fixture(maxBytes = 256, draw = () => {}) {
  const pool = new CanvasSurfacePool({ maxBytes, createCanvas: (w, h) => canvasStub(w, h, draw) })
  pools.push(pool)
  return { pool, scope: new CanvasSurfaceScope(pool), input: canvasStub(2, 2) }
}
const effects: EffectDefinition[] = ['blur','glow','shadow','innerGlow','innerShadow','tint','vignette']
  .map(type => ({ id: type, type, enabled: true, params: { radius: 3, blur: 3 } }))
afterEach(() => { pools.splice(0).forEach(pool => pool.dispose()); vi.restoreAllMocks() })

describe('built-in effect surface contracts', () => {
  it.each(effects)('$type keeps only its output leased (CSS fallback)', effect => {
    vi.spyOn(gpuImageEffects, 'blur').mockReturnValue(null)
    const { pool, scope, input } = fixture()
    const output = effectRegistry.get(effect.type)!.apply(input, effect, scope)
    expect(scope.owns(output)).toBe(true)
    expect(pool.getSnapshot().activeSurfaces).toBe(1)
    expect(input.width).toBe(2)
    scope.dispose()
    expect(pool.getSnapshot().activeSurfaces).toBe(0)
  })

  it.each(effects)('$type returns all scratch when a native draw throws', effect => {
    vi.spyOn(gpuImageEffects, 'blur').mockReturnValue(null)
    const { pool, scope, input } = fixture(256, () => { throw new Error('native draw failed') })
    expect(() => effectRegistry.get(effect.type)!.apply(input, effect, scope)).toThrow('native draw failed')
    expect(pool.getSnapshot().activeSurfaces).toBe(0)
    expect(input.width).toBe(2)
    scope.dispose()
  })

  it.each(effects.filter(e => !['tint','vignette'].includes(e.type)))('$type copies borrowed GPU output without releasing it', effect => {
    const gpu = canvasStub(2, 2)
    vi.spyOn(gpuImageEffects, 'blur').mockReturnValue(gpu)
    const { pool, scope, input } = fixture()
    const result = effectRegistry.get(effect.type)!.apply(input, effect, scope)
    expect(result).not.toBe(gpu)
    scope.dispose()
    expect(gpu.width).toBe(2)
    expect(pool.getSnapshot().activeSurfaces).toBe(0)
  })

  it('reuses bounded intermediates for long chains across 100 frames, skipping disabled/unknown passes', () => {
    vi.spyOn(gpuImageEffects, 'blur').mockReturnValue(null)
    const { pool, scope, input } = fixture(64)
    const chain = Array.from({ length: 10 }, () => effects).flat()
    chain.push({ id:'skip',type:'unknown',enabled:true,params:{} },{ ...effects[0],enabled:false })
    for (let i = 0; i < 100; i++) {
      const result = effectRegistry.applyChain(input, chain, scope)
      expect(pool.getSnapshot().activeSurfaces).toBe(1)
      scope.release(result)
    }
    expect(pool.getSnapshot()).toMatchObject({ allocations: 3, activeSurfaces: 0, budgetDenials: 0 })
    expect(pool.getSnapshot().reuses).toBeGreaterThan(1000)
    scope.dispose()
  })

  it('preserves the input for a zero-radius blur without acquiring scratch', () => {
    const { pool, scope, input } = fixture()
    expect(effectRegistry.get('blur')!.apply(input, { ...effects[0],params:{radius:0} },scope)).toBe(input)
    expect(pool.getSnapshot().allocations).toBe(0)
    scope.dispose()
  })

  it('rejects managed output escaping the allocator, cleans intermediates, and preserves borrowed input', () => {
    const registry = new EffectRegistry(), { pool, scope, input } = fixture()
    const foreign = canvasStub(2, 2)
    registry.register({ type:'managed',apply: (_input,_effect,s) => s!.create(2,2) })
    registry.register({ type:'foreign',apply: () => foreign })
    expect(() => registry.applyChain(input, ['managed','foreign'].map(type=>({id:type,type,enabled:true,params:{}})),scope))
      .toThrow(/supplied surface allocator/)
    expect(foreign.width).toBe(0)
    expect(input.width).toBe(2)
    expect(pool.getSnapshot().activeSurfaces).toBe(0)
    scope.dispose()
  })

  it('standalone chains release consumed results on success and error but retain caller input/final output', () => {
    const registry = new EffectRegistry(), created: HTMLCanvasElement[] = [], input = canvasStub(2,2)
    registry.register({ type:'copy',apply: () => { const c=canvasStub(2,2);created.push(c);return c } })
    registry.register({ type:'fail',apply: () => { throw new Error('effect failed') } })
    const copy = { id:'a',type:'copy',enabled:true,params:{} }
    const result = registry.applyChain(input,[copy,copy])
    expect([created[0].width,result.width,input.width]).toEqual([0,2,2])
    expect(()=>registry.applyChain(input,[copy,{...copy,type:'fail'}])).toThrow('effect failed')
    expect(created[2].width).toBe(0)
    expect(input.width).toBe(2)
  })
})
