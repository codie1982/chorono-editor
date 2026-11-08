import { describe, expect, it, vi } from 'vitest'
import { ResourceBudget } from './ResourceBudget'
import type { ResourceReservation } from './types'

/** Mark an already allocated test resource idle; physical disposal precedes
 * release, matching the contract of native canvas/media/GPU owners. */
function idle(ticket: ResourceReservation, disposed: string[], name: string) {
  ticket.commit(); ticket.allowReclaim(() => { disposed.push(name); ticket.release() })
}

describe('shared ResourceBudget', () => {
  it('charges pending and resident owners once under one limit, with detached diagnostics', () => {
    const budget = new ResourceBudget({ maxBytes: 100 }), disposed: string[] = []
    const scratch = budget.reserve('scratch', 40)!, image = budget.reserve('image', 30)!
    scratch.commit(); idle(image, disposed, 'image')
    const snapshot = budget.getSnapshot()
    expect(snapshot).toMatchObject({ chargedBytes: 70, reservedBytes: 0, residentBytes: 70, protectedBytes: 40, reclaimableBytes: 30, availableBytes: 30 })
    expect(snapshot.categories.image.residentBytes).toBe(30)
    snapshot.categories.scratch.residentBytes = 999
    expect(budget.getSnapshot().categories.scratch.residentBytes).toBe(40)
    const audio = budget.reserve('audio', 40)!
    expect(disposed).toEqual(['image']); expect(image.state).toBe('released')
    expect(budget.getSnapshot()).toMatchObject({ chargedBytes: 80, reservedBytes: 40, residentBytes: 40, peakBytes: 80, entries: 2, reclaims: 1 })
    audio.release(); scratch.release(); scratch.release()
    expect(budget.getSnapshot()).toMatchObject({ chargedBytes: 0, entries: 0 })
  })

  it('denies impossible protected working sets before touching useful idle resources', () => {
    const budget = new ResourceBudget({ maxBytes: 100 }), disposed: string[] = []
    const active = budget.reserve('scratch', 80)!, warm = budget.reserve('preview', 20)!
    idle(warm, disposed, 'warm')
    expect(budget.reserve('audio', 21)).toBeNull()
    expect(disposed).toEqual([])
    expect(budget.getSnapshot()).toMatchObject({ chargedBytes: 100, reservedBytes: 80, denials: 1 })
    active.release(); budget.reclaimIdle()
    expect(disposed).toEqual(['warm']); expect(budget.getSnapshot().chargedBytes).toBe(0)
  })

  it('reclaims global LRU across categories and preserves protected entries', () => {
    const budget = new ResourceBudget({ maxBytes: 100 }), disposed: string[] = []
    const a = budget.reserve('image', 30)!, b = budget.reserve('scratch', 30)!, c = budget.reserve('preview', 30)!
    idle(a, disposed, 'a'); idle(b, disposed, 'b'); idle(c, disposed, 'c')
    a.touch(); c.protect()
    const next = budget.reserve('audio', 40)!
    expect(disposed).toEqual(['b']); expect(c.state).toBe('resident')
    expect(budget.getSnapshot()).toMatchObject({ protectedBytes: 70, reclaimableBytes: 30, chargedBytes: 100 })
    next.release(); c.release(); budget.reclaimIdle()
    expect(disposed).toEqual(['b', 'a'])
  })

  it('reserves growth before allocation, excludes the resized idle resource, and rolls back failed growth', () => {
    const budget = new ResourceBudget({ maxBytes: 100 }), disposed: string[] = []
    const a = budget.reserve('preview', 40)!, b = budget.reserve('image', 40)!
    idle(a, disposed, 'a'); idle(b, disposed, 'b')
    expect(a.resize(70)).toBe(true); expect(disposed).toEqual(['b'])
    expect(a.bytes).toBe(70)
    a.protect()
    const active = budget.reserve('scratch', 20)!
    expect(a.resize(81)).toBe(false); expect(a.bytes).toBe(70)
    expect(a.resize(10)).toBe(true)
    expect(budget.getSnapshot()).toMatchObject({ chargedBytes: 30, residentBytes: 10, reservedBytes: 20 })
    a.release(); active.release()
    expect(a.resize(10)).toBe(false); a.commit(); a.protect(); a.allowReclaim(() => {})
    expect(a.state).toBe('released'); expect(budget.getSnapshot().entries).toBe(0)
  })

  it('bounds entry metadata as well as bytes, and does not reclaim impossible capacity', () => {
    const budget = new ResourceBudget({ maxBytes: 100, maxEntries: 2 }), disposed: string[] = []
    const a = budget.reserve('scratch', 1)!, b = budget.reserve('preview', 1)!
    expect(budget.reserve('audio', 1)).toBeNull()
    idle(b, disposed, 'b')
    const c = budget.reserve('audio', 1)!
    expect(disposed).toEqual(['b']); expect(budget.getSnapshot().entries).toBe(2)
    a.release(); c.release()
  })

  it('refuses reentrant admission until physical cleanup finishes', () => {
    const budget = new ResourceBudget({ maxBytes: 100 }), observations: unknown[] = []
    const resource = budget.reserve('image', 80)!
    resource.commit(); resource.allowReclaim(() => {
      observations.push(budget.getSnapshot().chargedBytes)
      observations.push(budget.reserve('gpu', 1))
      resource.release() // modeled physical disposal completed first
      observations.push(budget.reserve('gpu', 1))
    })
    const pending = budget.reserve('scratch', 30)!
    expect(observations).toEqual([80, null, null])
    expect(budget.getSnapshot()).toMatchObject({ chargedBytes: 30, denials: 2, reclaims: 1 })
    pending.release()
  })

  it('keeps failed or no-op disposers charged and protected instead of over-admitting', () => {
    const budget = new ResourceBudget({ maxBytes: 100 }), dispose = vi.fn(() => { throw new Error('dispose failed') })
    const broken = budget.reserve('gpu', 90)!
    broken.commit(); broken.allowReclaim(dispose)
    expect(budget.reserve('scratch', 20)).toBeNull()
    expect(budget.getSnapshot()).toMatchObject({ chargedBytes: 90, protectedBytes: 90, reclaimableBytes: 0, reclaimFailures: 1 })
    expect(budget.reserve('scratch', 20)).toBeNull(); expect(dispose).toHaveBeenCalledTimes(1)
    broken.release()
    const noOp = budget.reserve('image', 90)!
    noOp.commit(); noOp.allowReclaim(() => noOp.allowReclaim(() => {}))
    budget.reclaimIdle()
    expect(budget.getSnapshot()).toMatchObject({ chargedBytes: 90, protectedBytes: 90, reclaimableBytes: 0, reclaimFailures: 2 })
    noOp.release()
  })

  it('preserves exact safe-integer arithmetic at large limits and rejects invalid input', () => {
    const max = Number.MAX_SAFE_INTEGER, budget = new ResourceBudget({ maxBytes: max })
    const active = budget.reserve('scratch', max - 1)!
    expect(budget.reserve('gpu', 2)).toBeNull()
    expect(budget.reserve('gpu', 1)).not.toBeNull()
    expect(budget.getSnapshot().chargedBytes).toBe(max)
    active.release()
    for (const bytes of [0, -1, .5, Infinity, NaN, max + 1]) expect(() => budget.reserve('image', bytes)).toThrow(RangeError)
    expect(() => new ResourceBudget({ maxBytes: -1 })).toThrow(RangeError)
    expect(() => new ResourceBudget({ maxBytes: 1, maxEntries: 0 })).toThrow(RangeError)
    expect(new ResourceBudget({ maxBytes: 0 }).reserve('scratch', 1)).toBeNull()
    const pending = budget.reserve('image', 1)!
    expect(() => pending.allowReclaim(() => {})).toThrow('Pending')
    pending.release()
  })
})
