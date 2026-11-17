import type { ChronoScene } from '../../types'
import type { AuthoringHints } from '../../types/authoring'
import { measureJson } from '../../format/json'

export interface PreparedPlan {
  kind?: 'script' | 'spline'; clientId: string; sessionId: string; documentEpoch: string; revision: number
  scene: ChronoScene; expiresAt: number; logs: string[]; commandCount: number; authoringHints?: AuthoringHints; result?: unknown
  retainedCharge?: number
}
/** Bounded owner over the broker's shared in-memory plan map. Script and native
 * spline drafts share a 64MiB estimated source budget and 50-plan count limit.
 * No PNGs/workers/DOM live here. Charge includes JSON bytes plus node overhead;
 * this is an admission estimate, not a process-RAM meter. Existing hot-reload
 * entries are measured lazily. Deletion always revokes plan-bound read leases. */
export class PreparedPlanStore {
  constructor(private readonly plans: Map<string, PreparedPlan>, private readonly revoke: (id: string) => void, private readonly maxBytes = 64 * 1024 ** 2) {}
  /** Refuse capacity before retaining a draft; source/caller retains ownership
   * on failure. Borrowed map is never silently evicted to admit another plan. */
  put(id: string, plan: PreparedPlan): void {
    const charge = (value: PreparedPlan) => {
      const measure = measureJson({ scene: value.scene, result: value.result, authoringHints: value.authoringHints, logs: value.logs }, { maxChars: 32 * 1024 ** 2, maxBytes: 48 * 1024 ** 2 })
      return measure.utf8Bytes + measure.nodes * 32
    }
    let bytes = 0
    for (const current of Array.from(this.plans.values())) bytes += current.retainedCharge ?? charge(current)
    const retainedCharge = charge(plan)
    if (this.plans.size >= 50 || bytes + retainedCharge > this.maxBytes) throw new Error('Prepared plan budget exceeded. Apply or discard an existing plan before preparing another.')
    this.plans.set(id, { ...plan, retainedCharge })
  }
  /** Read borrowed immutable draft data; client/session/kind checks are caller policy. */
  get(id: string): PreparedPlan | undefined { return this.plans.get(id) }
  /** Idempotent release also revokes any unused one-use capability. */
  delete(id: string): boolean { const removed = this.plans.delete(id); this.revoke(id); return removed }
}
