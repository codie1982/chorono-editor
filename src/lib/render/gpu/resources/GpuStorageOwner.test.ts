import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResourceBudget } from '@/lib/resources/budget'
import { GpuAdmissionError, GpuStorageOwner } from './GpuStorageOwner'

afterEach(() => vi.useRealTimers())

describe('mutable GPU workspace ownership', () => {
  it('refuses impossible admission before invoking any native allocation', async () => {
    const budget = new ResourceBudget({ maxBytes:8 }), allocate = vi.fn()
    const owner = new GpuStorageOwner(budget,vi.fn())
    expect(() => owner.prepare(9,allocate)).toThrow(GpuAdmissionError)
    expect(allocate).not.toHaveBeenCalled()
    expect(budget.getSnapshot().chargedBytes).toBe(0)
    await Promise.resolve(); owner.clear()
  })

  it('protects borrowed pixels through synchronous allocation, then reclaims under pressure', async () => {
    const budget = new ResourceBudget({ maxBytes:16 }), destroy = vi.fn(() => {
      expect(budget.getSnapshot().chargedBytes).toBe(12)
    })
    const owner = new GpuStorageOwner(budget,destroy)
    owner.prepare(12,() => {})
    expect(budget.reserve('scratch',8)).toBeNull()
    await Promise.resolve()
    expect(budget.getSnapshot().reclaimableBytes).toBe(12)
    const next = budget.reserve('scratch',8)!
    expect(destroy).toHaveBeenCalledOnce()
    expect(owner.getSnapshot().bytes).toBe(0)
    expect(budget.getSnapshot().chargedBytes).toBe(8)
    next.release()
  })

  it('accounts old + replacement peak before mutation and preserves old data on denial', async () => {
    const budget = new ResourceBudget({ maxBytes:20 }), owner = new GpuStorageOwner(budget,vi.fn())
    owner.prepare(8,() => {})
    await Promise.resolve()
    const replace = vi.fn()
    expect(() => owner.prepare(16,replace)).toThrow(GpuAdmissionError)
    expect(replace).not.toHaveBeenCalled()
    expect(owner.getSnapshot().bytes).toBe(8)
    await Promise.resolve(); owner.clear()
  })

  it('publishes a replacement only after its callback completes', async () => {
    const budget = new ResourceBudget({ maxBytes:24 }), owner = new GpuStorageOwner(budget,vi.fn())
    owner.prepare(8,() => {})
    owner.prepare(16,() => expect(budget.getSnapshot()).toMatchObject({chargedBytes:24,reservedBytes:16}))
    expect(budget.getSnapshot()).toMatchObject({chargedBytes:16,reservedBytes:0,peakBytes:24})
    await Promise.resolve(); owner.clear()
  })

  it('pins a streaming pass across jobs, pressure and grace expiry', async () => {
    vi.useFakeTimers({toFake:['setTimeout','clearTimeout','Date']})
    const budget = new ResourceBudget({maxBytes:16}), destroy = vi.fn(), owner = new GpuStorageOwner(budget,destroy)
    owner.prepare(12,() => {}); const release = owner.hold()
    await Promise.resolve(); vi.advanceTimersByTime(5000)
    expect(budget.reserve('scratch',8)).toBeNull()
    expect(destroy).not.toHaveBeenCalled()
    release(); release()
    vi.advanceTimersByTime(1999); expect(destroy).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1); expect(destroy).toHaveBeenCalledOnce()
    expect(budget.getSnapshot().chargedBytes).toBe(0)
  })

  it('keeps both estimates until partially allocated storage is actually destroyed', async () => {
    const budget = new ResourceBudget({maxBytes:24})
    const owner = new GpuStorageOwner(budget,() => expect(budget.getSnapshot().chargedBytes).toBe(24))
    owner.prepare(8,() => {})
    expect(() => owner.prepare(16,() => { throw new Error('native failure') })).toThrow('native failure')
    expect(budget.getSnapshot().chargedBytes).toBe(0)
    await Promise.resolve()
  })

  it('quarantines failed destruction and retries only on explicit clear', async () => {
    vi.useFakeTimers({toFake:['setTimeout','clearTimeout','Date']})
    const budget = new ResourceBudget({maxBytes:24}), destroy = vi.fn<() => void>(() => {throw new Error('delete failed')})
    const owner = new GpuStorageOwner(budget,destroy)
    owner.prepare(8,() => {})
    expect(() => owner.prepare(16,() => {throw new Error('upload failed')})).toThrow('upload failed')
    await Promise.resolve(); vi.advanceTimersByTime(10000)
    expect(destroy).toHaveBeenCalledOnce()
    expect(owner.getSnapshot()).toMatchObject({bytes:24,failedCleanup:true,protected:true})
    expect(budget.getSnapshot()).toMatchObject({chargedBytes:24,reclaimableBytes:0})
    expect(() => owner.prepare(8,() => {})).toThrow('cleanup must succeed')
    destroy.mockImplementation(() => {}); owner.clear()
    expect(budget.getSnapshot().chargedBytes).toBe(0)
  })

  it('invalidates stale job/pin releases after context loss and restoration', async () => {
    const budget = new ResourceBudget({maxBytes:16}), owner = new GpuStorageOwner(budget,vi.fn())
    owner.prepare(8,() => {}); const oldRelease = owner.hold()
    owner.clear(); owner.prepare(12,() => {}); const currentRelease = owner.hold()
    oldRelease(); await Promise.resolve()
    expect(budget.getSnapshot()).toMatchObject({chargedBytes:12,reclaimableBytes:0})
    currentRelease(); expect(budget.getSnapshot().reclaimableBytes).toBe(12)
    owner.clear()
  })

  it('refreshes idle grace without scheduling a polling loop or expiring active use', async () => {
    vi.useFakeTimers({toFake:['setTimeout','clearTimeout','Date']})
    const budget = new ResourceBudget({maxBytes:16}), destroy = vi.fn(), owner = new GpuStorageOwner(budget,destroy)
    owner.prepare(8,() => {}); await Promise.resolve()
    vi.advanceTimersByTime(1500); owner.prepare(8); await Promise.resolve()
    vi.advanceTimersByTime(500); expect(destroy).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1500); expect(destroy).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects invalid estimates before allocation and requires a callback for size changes', async () => {
    const owner = new GpuStorageOwner(new ResourceBudget({maxBytes:16}),vi.fn()), allocate = vi.fn()
    for (const bytes of [0,-1,NaN,Infinity,0.5,Number.MAX_SAFE_INTEGER+1]) expect(() => owner.prepare(bytes,allocate)).toThrow(RangeError)
    expect(allocate).not.toHaveBeenCalled()
    owner.prepare(8,allocate)
    expect(() => owner.prepare(12)).toThrow('update callback')
    await Promise.resolve(); owner.clear()
  })

  it('explicit unused cleanup preserves active borrows and retries quarantined storage', async () => {
    const budget = new ResourceBudget({maxBytes:16}), destroy = vi.fn(), owner = new GpuStorageOwner(budget,destroy)
    owner.prepare(8,() => {});owner.clearIdle();expect(destroy).not.toHaveBeenCalled()
    await Promise.resolve()
    destroy.mockImplementation(() => {throw new Error('cleanup failed')})
    owner.clearIdle();expect(owner.getSnapshot().failedCleanup).toBe(true)
    expect(budget.getSnapshot().chargedBytes).toBe(8)
    destroy.mockImplementation(() => {});owner.clearIdle()
    expect(budget.getSnapshot().chargedBytes).toBe(0)
  })
})
