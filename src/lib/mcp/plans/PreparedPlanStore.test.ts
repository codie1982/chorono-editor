import { expect, it } from 'vitest'
import { emptyScene } from '../../defaults'
import { PreparedPlanStore, type PreparedPlan } from './PreparedPlanStore'

/** Retained drafts have bounded ownership; a failed admission must not evict
 * someone else's pending plan or retain PNGs/worker state. */
it('bounds shared script/spline drafts and revokes leases on explicit release', () => {
  const map = new Map<string, PreparedPlan>(), revoked: string[] = []
  const store = new PreparedPlanStore(map, id => revoked.push(id), 10000)
  const plan: PreparedPlan = { kind: 'spline', clientId: 'client', sessionId: 'editor', documentEpoch: 'document', revision: 0,
    scene: emptyScene(), expiresAt: Date.now() + 1000, logs: [], commandCount: 1 }
  store.put('one', plan)
  expect(map.get('one')!.retainedCharge).toBeGreaterThan(0)
  expect(() => store.put('large', { ...plan, result: 'x'.repeat(10000) })).toThrow('budget')
  expect(map.size).toBe(1); expect(store.get('one')!.scene).toBe(plan.scene)
  expect(store.delete('one')).toBe(true); expect(store.delete('missing')).toBe(false)
  expect(revoked).toEqual(['one', 'missing']); expect(map.size).toBe(0)
})
