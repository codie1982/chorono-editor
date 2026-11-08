import { describe, expect, it, vi } from 'vitest'
import { ResourceBudget } from '../ResourceBudget'
import { CanvasSurfacePool } from '@/lib/render/resources/CanvasSurfacePool'
import { OffscreenCanvasCache } from '@/lib/render/OffscreenCanvasCache'

/** Native-allocation boundary stub. Captures actual backing dimensions without
 * faking budget decisions; the tested production owners perform all admission. */
function allocator() {
  const canvases: HTMLCanvasElement[] = []
  const createCanvas = vi.fn((width: number, height: number) => {
    const canvas = { width, height, getContext: () => ({}), addEventListener() {}, removeEventListener() {} } as unknown as HTMLCanvasElement
    canvases.push(canvas); return canvas
  })
  return { createCanvas, canvases }
}

describe('render owners share admission', () => {
  it('reclaims idle scratch for a preview and then reclaims that preview for scratch', () => {
    const budget = new ResourceBudget({ maxBytes: 700 }), a = allocator()
    const pool = new CanvasSurfacePool({ maxBytes: 1000, budget, createCanvas: a.createCanvas })
    const cache = new OffscreenCanvasCache({ maxBytes: 1000, budget, createCanvas: a.createCanvas })
    const scratch = pool.acquire(10, 10)
    scratch.release()
    const proxy = cache.getOrCreate('a', 'v', 10, 10, () => {})!
    expect(a.canvases[0].width).toBe(0)
    expect(pool.getSnapshot().residentBytes).toBe(0)
    expect(budget.getSnapshot()).toMatchObject({ chargedBytes: 404, reclaimableBytes: 404, entries: 1 })
    const next = pool.acquire(10, 10)
    expect(proxy.canvas.width).toBe(0); expect(cache.size()).toBe(0)
    expect(budget.getSnapshot()).toMatchObject({ chargedBytes: 400, protectedBytes: 400 })
    next.release(); pool.dispose(); cache.clear()
    expect(budget.getSnapshot()).toMatchObject({ chargedBytes: 0, entries: 0 })
  })

  it('refuses allocation before native canvas creation when another owner is pinned', () => {
    const budget = new ResourceBudget({ maxBytes: 700 }), a = allocator()
    const pool = new CanvasSurfacePool({ maxBytes: 1000, budget, createCanvas: a.createCanvas })
    const cache = new OffscreenCanvasCache({ maxBytes: 1000, budget, createCanvas: a.createCanvas })
    const active = pool.acquire(10, 10)
    expect(cache.getOrCreate('a', 'v', 10, 10, () => {})).toBeNull()
    expect(a.createCanvas).toHaveBeenCalledTimes(1)
    expect(active.canvas.width).toBe(10)
    active.release(); pool.dispose()
    const proxy = cache.acquire('a', 'v', 10, 10, () => {})!
    const other = new CanvasSurfacePool({ maxBytes: 1000, budget, createCanvas: a.createCanvas })
    expect(() => other.acquire(10, 10)).toThrow('Shared resource budget')
    expect(a.createCanvas).toHaveBeenCalledTimes(2)
    expect(proxy.canvas.width).toBe(10)
    proxy.release(); cache.clear(); other.dispose()
    expect(budget.getSnapshot().chargedBytes).toBe(0)
  })

  it('pins multiple borrowers through invalidation and clears only after the last release', () => {
    const budget = new ResourceBudget({ maxBytes: 1000 }), a = allocator()
    const cache = new OffscreenCanvasCache({ maxBytes: 500, maxEntries: 1, budget, createCanvas: a.createCanvas })
    const first = cache.acquire('a', 'v', 10, 10, () => {})!
    const second = cache.acquire('a', 'v', 10, 10, () => { throw new Error('must hit') })!
    cache.clear()
    expect(cache.getSnapshot()).toMatchObject({ entries: 0, retiredEntries: 1, residentBytes: 404, pinnedBytes: 404 })
    budget.reclaimIdle(); expect(first.canvas.width).toBe(10)
    expect(cache.getOrCreate('b', 'v', 1, 1, () => {})).toBeNull()
    first.release(); first.release(); expect(second.canvas.height).toBe(10)
    expect(budget.getSnapshot().protectedBytes).toBe(404)
    second.release(); expect(second.canvas.width).toBe(0)
    expect(cache.getSnapshot()).toMatchObject({ residentBytes: 0, retiredEntries: 0, pinnedBytes: 0 })
    expect(budget.getSnapshot().chargedBytes).toBe(0)
  })

  it('protects pending paint, unwinds exceptions and preserves borrowed legacy storage', () => {
    const budget = new ResourceBudget({ maxBytes: 700 }), a = allocator()
    const cache = new OffscreenCanvasCache({ maxBytes: 1000, budget, createCanvas: a.createCanvas })
    expect(() => cache.getOrCreate('a', 'v', 10, 10, () => {
      expect(budget.getSnapshot()).toMatchObject({ reservedBytes: 404, protectedBytes: 404 })
      expect(budget.reserve('image', 400)).toBeNull()
      throw new Error('paint failed')
    })).toThrow('paint failed')
    expect(a.canvases[0].width).toBe(0)
    expect(budget.getSnapshot()).toMatchObject({ chargedBytes: 0, entries: 0 })
    const borrowed = a.createCanvas(10, 10)
    cache.set('legacy', 1, borrowed); cache.clear()
    expect(borrowed.width).toBe(10)
    expect(budget.getSnapshot().chargedBytes).toBe(0)
  })

  it('keeps scratch reservations correct across ROI resize, failed growth and disposal', () => {
    const budget = new ResourceBudget({ maxBytes: 600 }), a = allocator()
    const pool = new CanvasSurfacePool({ maxBytes: 1000, budget, createCanvas: a.createCanvas })
    const first = pool.acquire(10, 10); first.release()
    const smaller = pool.acquire(5, 10)
    expect(smaller.canvas).toBe(first.canvas)
    expect(budget.getSnapshot()).toMatchObject({ chargedBytes: 200, protectedBytes: 200 })
    smaller.release()
    expect(() => pool.acquire(20, 10)).toThrow('Shared resource budget')
    expect(a.createCanvas).toHaveBeenCalledTimes(1)
    expect(first.canvas.width).toBe(0)
    expect(pool.getSnapshot().residentBytes).toBe(0)
    expect(budget.getSnapshot().chargedBytes).toBe(0)
    const active = pool.acquire(10, 10); pool.dispose()
    expect(active.canvas.width).toBe(10)
    expect(budget.getSnapshot().protectedBytes).toBe(400)
    active.release(); expect(budget.getSnapshot().chargedBytes).toBe(0)
  })

  it('unwinds a reentrant owner shutdown before returning a new lease', () => {
    const budget = new ResourceBudget({ maxBytes: 1000 }), a = allocator()
    let pool: CanvasSurfacePool
    pool = new CanvasSurfacePool({ maxBytes: 1000, budget, createCanvas: (width, height) => {
      const canvas = a.createCanvas(width, height); pool.dispose(); return canvas
    } })
    expect(() => pool.acquire(10, 10)).toThrow('disposed')
    expect(a.canvases[0].width).toBe(0)
    expect(budget.getSnapshot()).toMatchObject({ chargedBytes: 0, entries: 0 })
  })
})
