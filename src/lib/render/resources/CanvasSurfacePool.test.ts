import { afterEach, describe, expect, it, vi } from 'vitest'
import { CanvasSurfacePool } from './CanvasSurfacePool'

/** Models the native width setter's state reset without allocating real pixel buffers. */
function canvasStub(width: number, height: number) {
  let currentWidth = width
  const context = { globalAlpha: 1, filter: 'none', clipDepth: 0 }
  const reset = vi.fn(() => Object.assign(context, { globalAlpha: 1, filter: 'none', clipDepth: 0 }))
  const canvas = {
    get width() { return currentWidth },
    set width(value: number) { currentWidth = value; reset() },
    height, getContext: vi.fn(() => context),
  } as unknown as HTMLCanvasElement
  return { canvas, context, reset }
}

const pools: CanvasSurfacePool[] = []
/** Keeps every test's timer/backing ownership isolated from the next test. */
function pool(maxBytes = 64) {
  const createCanvas = vi.fn((width: number, height: number) => canvasStub(width, height).canvas)
  const instance = new CanvasSurfacePool({ maxBytes, createCanvas })
  pools.push(instance)
  return { instance, createCanvas }
}

afterEach(() => {
  pools.splice(0).forEach(instance => instance.dispose())
  vi.useRealTimers()
})

describe('CanvasSurfacePool ownership and admission', () => {
  it('admits four 4K surfaces by default and rejects a fifth before allocation', () => {
    const createCanvas = vi.fn((w: number,h: number) => canvasStub(w,h).canvas)
    const instance = new CanvasSurfacePool({createCanvas})
    pools.push(instance)
    const leases=Array.from({length:4},()=>instance.acquire(3840,2160))
    expect(()=>instance.acquire(3840,2160)).toThrow(/budget exceeded/)
    expect(createCanvas).toHaveBeenCalledTimes(4)
    expect(instance.getSnapshot()).toMatchObject({maxBytes:128*1024**2,activeBytes:4*3840*2160*4})
    leases.forEach(lease=>lease.release())
  })
  it.each([
    { maxBytes: -1 }, { maxBytes: Infinity }, { maxBytes: 1.5 },
    { maxIdleMs: -1 }, { maxIdleMs: NaN }, { maxIdleMs: 2_147_483_648 },
  ])('rejects invalid budgets/overflowing timer options %j', options => {
    expect(() => new CanvasSurfacePool(options)).toThrow(RangeError)
  })

  it('allocates lazily, isolates active leases and returns detached accounting', () => {
    const { instance, createCanvas } = pool()
    expect(createCanvas).not.toHaveBeenCalled()
    const a = instance.acquire(2, 2), b = instance.acquire(2, 2)
    expect(a.canvas).not.toBe(b.canvas)
    expect(instance.getSnapshot()).toMatchObject({ activeBytes: 32, idleBytes: 0, residentBytes: 32, allocations: 2 })
    a.release(); a.release()
    expect(instance.getSnapshot()).toMatchObject({ activeBytes: 16, idleBytes: 16, activeSurfaces: 1, idleSurfaces: 1 })
    const snapshot = instance.getSnapshot()
    snapshot.residentBytes = 999
    expect(instance.getSnapshot().residentBytes).toBe(32)
    b.release()
  })

  it('resets old drawing and clipping state before reusing the exact-size surface', () => {
    const stub = canvasStub(2, 2)
    const instance = new CanvasSurfacePool({ createCanvas: () => stub.canvas })
    pools.push(instance)
    const a = instance.acquire(2, 2)
    Object.assign(stub.context, { globalAlpha: 0.2, filter: 'blur(9px)', clipDepth: 2 })
    a.release()
    const b = instance.acquire(2, 2)
    expect(b.canvas).toBe(a.canvas)
    expect(stub.reset).toHaveBeenCalledTimes(1)
    expect(stub.context).toEqual({ globalAlpha: 1, filter: 'none', clipDepth: 0 })
    expect(instance.getSnapshot()).toMatchObject({ allocations: 1, reuses: 1 })
    b.release()
  })

  it('rejects before allocation when active leases consume the budget', () => {
    const { instance, createCanvas } = pool(16)
    const active = instance.acquire(2, 2)
    expect(() => instance.acquire(2, 2)).toThrow(/budget exceeded/)
    expect(createCanvas).toHaveBeenCalledTimes(1)
    expect(active.canvas.width).toBe(2)
    expect(instance.getSnapshot()).toMatchObject({ residentBytes: 16, activeBytes: 16, budgetDenials: 1 })
    active.release()
    const reused = instance.acquire(2, 2)
    expect(reused.canvas).toBe(active.canvas)
    reused.release()
  })

  it('preserves useful idle entries for requests that cannot fit even after eviction', () => {
    const { instance, createCanvas } = pool(32)
    const a = instance.acquire(2, 2), b = instance.acquire(2, 2)
    a.release()
    expect(() => instance.acquire(2, 3)).toThrow(/budget exceeded/)
    expect(() => instance.acquire(100, 100)).toThrow(/budget exceeded/)
    expect(createCanvas).toHaveBeenCalledTimes(2)
    expect(instance.getSnapshot()).toMatchObject({ idleSurfaces: 1, evictions: 0, budgetDenials: 2 })
    b.release()
  })

  it('recycles the oldest idle canvas and evicts other backing stores to resize within budget', () => {
    const { instance } = pool(32)
    const a = instance.acquire(2, 2), b = instance.acquire(2, 2)
    a.release(); b.release()
    const larger = instance.acquire(2, 4)
    expect(larger.canvas).toBe(a.canvas)
    expect([a.canvas.width, a.canvas.height, b.canvas.width, b.canvas.height]).toEqual([2, 4, 0, 0])
    expect(instance.getSnapshot()).toMatchObject({ residentBytes: 32, peakResidentBytes: 32, evictions: 1, reuses: 1, allocations: 2 })
    larger.release()
  })

  it('does not retain one canvas for every animated ROI size', () => {
    const { instance, createCanvas } = pool(4096)
    for (let size = 1; size <= 30; size++) instance.acquire(size, size).release()
    expect(createCanvas).toHaveBeenCalledTimes(1)
    expect(instance.getSnapshot()).toMatchObject({ allocations:1,reuses:29,residentBytes:3600,idleSurfaces:1 })
  })

  it('rolls back a failed idle resize and leaves active leases untouched', () => {
    const {instance}=pool(128)
    const idle=instance.acquire(2,2),active=instance.acquire(2,2)
    idle.release()
    Object.defineProperty(idle.canvas,'height',{get:()=>2,set(value){if(value===3)throw new Error('resize failed')},configurable:true})
    expect(()=>instance.acquire(3,3)).toThrow('resize failed')
    expect(instance.getSnapshot()).toMatchObject({residentBytes:16,activeSurfaces:1,idleSurfaces:0})
    expect(active.canvas.width).toBe(2)
    active.release()
  })

  it.each([[0, 2], [-1, 2], [1.5, 2], [NaN, 2], [Infinity, 2], [Number.MAX_SAFE_INTEGER, 2]])(
    'rejects invalid/overflowing dimensions (%s, %s) without allocating', (width, height) => {
      const { instance, createCanvas } = pool()
      expect(() => instance.acquire(width, height)).toThrow(RangeError)
      expect(createCanvas).not.toHaveBeenCalled()
    },
  )

  it('rolls back admission and shrinks the canvas when its 2D context is unavailable', () => {
    const canvas = canvasStub(2, 2).canvas
    vi.mocked(canvas.getContext).mockReturnValueOnce(null)
    const instance = new CanvasSurfacePool({ maxBytes: 16, createCanvas: () => canvas })
    pools.push(instance)
    expect(() => instance.acquire(2, 2)).toThrow(/context/)
    expect(instance.getSnapshot()).toMatchObject({ residentBytes: 0, activeSurfaces: 0, idleSurfaces: 0 })
    expect([canvas.width, canvas.height]).toEqual([0, 0])
  })

  it('rolls back a failed allocation so a later request can use the same budget', () => {
    const createCanvas = vi.fn((width: number, height: number) => canvasStub(width, height).canvas)
      .mockImplementationOnce(() => { throw new Error('allocation failed') })
    const instance = new CanvasSurfacePool({ maxBytes: 16, createCanvas })
    pools.push(instance)
    expect(() => instance.acquire(2, 2)).toThrow('allocation failed')
    expect(instance.getSnapshot().residentBytes).toBe(0)
    const recovered = instance.acquire(2, 2)
    expect(instance.getSnapshot()).toMatchObject({ activeBytes: 16, allocations: 1 })
    recovered.release()
  })

  it('does not retain resized leases or double-count their release', () => {
    const { instance } = pool()
    const lease = instance.acquire(2, 2)
    lease.canvas.width = 20
    lease.release(); lease.release()
    expect(instance.getSnapshot()).toMatchObject({ residentBytes: 0, activeSurfaces: 0, idleSurfaces: 0, evictions: 1 })
  })
})

describe('CanvasSurfacePool idle lifecycle', () => {
  it('expires idle pixels after grace without a frame/render callback', () => {
    vi.useFakeTimers()
    const { instance } = pool()
    const lease = instance.acquire(2, 2)
    lease.release()
    vi.advanceTimersByTime(1999)
    expect(instance.getSnapshot().residentBytes).toBe(16)
    vi.advanceTimersByTime(1)
    expect(instance.getSnapshot()).toMatchObject({ residentBytes: 0, idleSurfaces: 0, evictions: 1 })
    expect(lease.canvas.width).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reuses 3000 times with one cleanup timer and never expires an active lease', () => {
    vi.useFakeTimers()
    const { instance } = pool()
    for (let i = 0; i < 3000; i++) instance.acquire(2, 2).release()
    expect(instance.getSnapshot()).toMatchObject({ allocations: 1, reuses: 2999, residentBytes: 16 })
    expect(vi.getTimerCount()).toBe(1)
    const active = instance.acquire(2, 2)
    vi.advanceTimersByTime(5000)
    expect(instance.getSnapshot()).toMatchObject({ activeBytes: 16, evictions: 0 })
    active.release()
    vi.advanceTimersByTime(2000)
    expect(instance.getSnapshot().residentBytes).toBe(0)
  })

  it('clearIdle keeps borrowed pixels valid, and disposal frees them on release', () => {
    const { instance } = pool()
    const a = instance.acquire(2, 2), b = instance.acquire(2, 2)
    a.release()
    instance.clearIdle()
    expect(a.canvas.width).toBe(0)
    expect(b.canvas.width).toBe(2)
    instance.dispose()
    expect(() => instance.acquire(2, 2)).toThrow(/disposed/)
    expect(b.canvas.width).toBe(2)
    b.release()
    expect(instance.getSnapshot()).toMatchObject({ residentBytes: 0, activeSurfaces: 0, idleSurfaces: 0 })
  })

  it('exposes allocation/admission/eviction lifecycle without per-reuse events', () => {
    const { instance } = pool(16)
    const allocated = vi.fn(), denied = vi.fn(), evicted = vi.fn()
    instance.addEventListener('allocation', allocated)
    instance.addEventListener('budgetexceeded', denied)
    instance.addEventListener('eviction', evicted)
    const a = instance.acquire(2, 2)
    expect(() => instance.acquire(2, 2)).toThrow()
    a.release()
    instance.acquire(2, 2).release()
    instance.clearIdle()
    expect([allocated.mock.calls.length, denied.mock.calls.length, evicted.mock.calls.length]).toEqual([1, 1, 1])
  })
})
