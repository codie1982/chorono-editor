import { expect, it } from 'vitest'
import { ResourceBudget } from './ResourceBudget'
import { ResourceBudgetGroup } from './ResourceBudgetGroup'

it('rolls back partial admission and growth across local/shared limits', () => {
  const local = new ResourceBudget({ maxBytes: 128 }), shared = new ResourceBudget({ maxBytes: 64 })
  const group = new ResourceBudgetGroup([local, shared])
  const other = shared.reserve('scratch', 32)!
  const owned = group.reserve('audio', 16)!
  expect(owned.resize(40)).toBe(false)
  expect(owned.bytes).toBe(16)
  expect(local.getSnapshot().chargedBytes).toBe(16); expect(shared.getSnapshot().chargedBytes).toBe(48)
  expect(group.reserve('audio', 32)).toBeNull()
  expect(local.getSnapshot().chargedBytes).toBe(16)
  owned.release(); owned.release(); other.release()
  expect(local.getSnapshot().chargedBytes + shared.getSnapshot().chargedBytes).toBe(0)
})

it('protects every scope before cleanup and stays charged in all scopes if disposal fails', () => {
  const local = new ResourceBudget({ maxBytes: 128 }), shared = new ResourceBudget({ maxBytes: 128 })
  const owned = new ResourceBudgetGroup([local, shared]).reserve('audio', 16)!
  owned.commit(); owned.allowReclaim(() => { throw new Error('native cleanup failed') })
  shared.reclaimIdle()
  expect(shared.getSnapshot()).toMatchObject({ chargedBytes: 16, protectedBytes: 16, reclaimFailures: 1 })
  expect(local.getSnapshot()).toMatchObject({ chargedBytes: 16, protectedBytes: 16, reclaimableBytes: 0 })
  local.reclaimIdle(); expect(local.getSnapshot().chargedBytes).toBe(16)
  owned.release()
})

it('deduplicates identical allocators and physically reclaims once through either scope', () => {
  const local = new ResourceBudget({ maxBytes: 128 }), shared = new ResourceBudget({ maxBytes: 128 })
  const group = new ResourceBudgetGroup([local, shared, local])
  const owned = group.reserve('audio', 16)!
  let disposals = 0
  owned.commit(); owned.allowReclaim(() => { disposals++; owned.release() })
  local.reclaimIdle(); shared.reclaimIdle()
  expect(disposals).toBe(1); expect(local.getSnapshot().entries + shared.getSnapshot().entries).toBe(0)
  expect(owned.resize(4)).toBe(false)
  expect(() => new ResourceBudgetGroup([])).toThrow(RangeError)
})
