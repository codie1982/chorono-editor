import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MaskDefinition } from '@/lib/types'
import { newRectLayer } from '@/lib/defaults'
import { CanvasSurfacePool } from '@/lib/render/resources/CanvasSurfacePool'
import { MaskRenderer, type MaskRenderArgs } from './MaskRenderer'

interface Draw { operation: string; alpha: number; filter: string; kind: string }

/** Records compositing semantics while modelling native canvas state reset on reuse. */
function fixture(maxBytes = 128) {
  const trace: Draw[] = []
  const createCanvas = vi.fn((width: number, height: number) => {
    let currentWidth = width
    const states: Array<{ globalCompositeOperation: string; globalAlpha: number; filter: string }> = []
    const context = {
      globalCompositeOperation: 'source-over', globalAlpha: 1, filter: 'none', fillStyle: '',
      save() { states.push({ globalCompositeOperation: this.globalCompositeOperation, globalAlpha: this.globalAlpha, filter: this.filter }) },
      restore() { Object.assign(this, states.pop()) },
      drawImage() { trace.push({ operation: this.globalCompositeOperation, alpha: this.globalAlpha, filter: this.filter, kind: 'image' }) },
      fillRect() { trace.push({ operation: this.globalCompositeOperation, alpha: this.globalAlpha, filter: this.filter, kind: 'fill' }) },
    }
    return {
      get width() { return currentWidth },
      set width(value: number) {
        currentWidth = value; states.length = 0
        Object.assign(context, { globalCompositeOperation: 'source-over', globalAlpha: 1, filter: 'none', fillStyle: '' })
      },
      height, getContext: () => context,
    } as unknown as HTMLCanvasElement
  })
  const pool = new CanvasSurfacePool({ maxBytes, createCanvas })
  pools.push(pool)
  const host = newRectLayer(), maskLayer = newRectLayer()
  const mask: MaskDefinition = { id: 'mask', maskLayerId: maskLayer.id, mode: 'add', opacity: 1 }
  const destCtx = { drawImage: vi.fn(), fillRect: vi.fn() } as unknown as CanvasRenderingContext2D
  const args: MaskRenderArgs = {
    destCtx, width: 2, height: 2, hostLayer: host,
    renderHost: context => context.fillRect(0, 0, 2, 2),
    renderMask: (_layer, context) => context.fillRect(0, 0, 1, 1),
    getLayer: id => id === maskLayer.id ? maskLayer : undefined,
  }
  return { pool, renderer: new MaskRenderer(pool), args, mask, trace, createCanvas }
}

const pools: CanvasSurfacePool[] = []
afterEach(() => pools.splice(0).forEach(pool => pool.dispose()))

describe('MaskRenderer pooled temporary surfaces', () => {
  it('keeps 3000 masks and subsequent frames at two reusable surfaces', () => {
    const { renderer, pool, args, mask, createCanvas } = fixture(32)
    renderer.render(Array.from({ length: 3000 }, (_, i) => ({ ...mask, id: `mask-${i}` })), args)
    for (let frame = 0; frame < 60; frame++) renderer.render([mask], args)
    expect(createCanvas).toHaveBeenCalledTimes(2)
    expect(pool.getSnapshot()).toMatchObject({ residentBytes: 32, peakResidentBytes: 32, activeSurfaces: 0, idleSurfaces: 2 })
    expect(args.destCtx.drawImage).toHaveBeenCalledTimes(61)
  })

  it.each(['add', 'subtract', 'intersect'] as const)('preserves %s mode, opacity, feather and inversion', mode => {
    const { renderer, args, mask, trace } = fixture()
    renderer.render([{ ...mask, mode, opacity: 0.4, feather: 3, inverted: true }], args)
    expect(trace).toContainEqual({ operation: 'source-over', alpha: 1, filter: 'blur(3px)', kind: 'fill' })
    expect(trace).toContainEqual({ operation: 'difference', alpha: 1, filter: 'none', kind: 'fill' })
    expect(trace).toContainEqual({ operation: mode === 'subtract' ? 'destination-out' : 'destination-in', alpha: 0.4, filter: 'none', kind: 'image' })
    expect(args.destCtx.drawImage).toHaveBeenCalledTimes(1)
  })

  it.each(['host', 'mask', 'destination', 'lookup'] as const)('returns all leases after a %s failure', stage => {
    const { renderer, args, mask, pool } = fixture()
    const fail = () => { throw new Error('drawing failed') }
    if (stage === 'host') args.renderHost = fail
    if (stage === 'mask') args.renderMask = fail
    if (stage === 'destination') vi.mocked(args.destCtx.drawImage).mockImplementation(fail)
    if (stage === 'lookup') args.getLayer = fail
    expect(() => renderer.render([mask], args)).toThrow('drawing failed')
    expect(pool.getSnapshot()).toMatchObject({ activeBytes: 0, activeSurfaces: 0 })
    pool.clearIdle()
    expect(pool.getSnapshot().residentBytes).toBe(0)
  })

  it('cleans the host lease if the second surface cannot be admitted', () => {
    const { renderer, args, mask, pool, createCanvas } = fixture(16)
    expect(() => renderer.render([mask], args)).toThrow(/budget exceeded/)
    expect(createCanvas).toHaveBeenCalledTimes(1)
    expect(pool.getSnapshot()).toMatchObject({ activeBytes: 0, activeSurfaces: 0, budgetDenials: 1 })
    expect(args.destCtx.drawImage).not.toHaveBeenCalled()
  })

  it('uses separate leases for recursive mask renders', () => {
    const { renderer, args, mask, pool } = fixture()
    const innerArgs = { ...args }
    args.renderHost = context => renderer.render([mask], { ...innerArgs, destCtx: context })
    renderer.render([mask], args)
    expect(pool.getSnapshot()).toMatchObject({ activeSurfaces: 0, allocations: 3, peakResidentBytes: 48 })
  })

  it('bypasses allocation without masks and skips a missing mask source', () => {
    const { renderer, args, mask, pool } = fixture()
    const host = vi.spyOn(args, 'renderHost')
    renderer.render([], args)
    expect(host).toHaveBeenCalledWith(args.destCtx)
    expect(pool.getSnapshot().allocations).toBe(0)
    renderer.render([{ ...mask, maskLayerId: 'missing' }], args)
    expect(pool.getSnapshot()).toMatchObject({ allocations: 1, activeSurfaces: 0 })
  })
})
