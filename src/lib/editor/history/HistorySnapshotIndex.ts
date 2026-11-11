import type { ChronoScene } from '../../types'
import type { HistoryState } from '../history'
import { historyAssets } from '../session/SessionProject'

/** Adapt history snapshots to the existing scene autosave queue without putting
 * history into scene JSON. Carriers have union assets for source leases and a
 * unique identity for same-present/different-stack edits. They must be unwrapped
 * before serialization. Both maps are weak; discarded jobs/snapshots are not kept. */
export class HistorySnapshotIndex {
  private readonly carriers = new WeakMap<HistoryState, ChronoScene>()
  private readonly histories = new WeakMap<ChronoScene, HistoryState>()
  /** Return this immutable history's stable queue identity and union asset view. */
  carrier(history: HistoryState): ChronoScene {
    let carrier = this.carriers.get(history)
    if (!carrier) { carrier = { ...history.present, assets: historyAssets(history) }; this.carriers.set(history, carrier); this.histories.set(carrier, history) }
    return carrier
  }
  /** Unwrap an owned carrier; ordinary scene inputs remain source-only. */
  history(carrier: ChronoScene): HistoryState | undefined { return this.histories.get(carrier) }
}
