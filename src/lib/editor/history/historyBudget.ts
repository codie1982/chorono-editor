import type { HistoryState } from '../history'
import { HistorySourceView } from './HistorySourceView'
import type { Asset } from '../../types'

export interface HistoryPolicy { maxSteps: number; maxBytes: number; maxNodes: number; assetBytes?: (asset: Asset) => number }
export const HISTORY_POLICY: Readonly<HistoryPolicy> = Object.freeze({ maxSteps: 50, maxBytes: 64 * 1024 ** 2, maxNodes: 300000 })
export interface HistoryBudgetResult { history: HistoryState; estimatedBytes: number; retainedSteps: number; droppedSteps: number; presentExceedsBudget: boolean }

/** Enumerate nearest Undo/Redo states in alternating order. Each retained side
 * is contiguous; exceeding a budget discards only the more distant suffix. */
export function nearestHistory(state: HistoryState): { side: 'past' | 'future'; index: number }[] {
  const result: { side: 'past' | 'future'; index: number }[] = []
  for (let i = 0; i < Math.max(state.past.length, state.future.length); i++) {
    if (i < state.past.length) result.push({ side: 'past', index: state.past.length - 1 - i })
    if (i < state.future.length) result.push({ side: 'future', index: i })
  }
  return result
}

/** Count shared immutable source objects once, excluding decoded caches. These
 * are conservative retained-JS estimates (strings 2 bytes/unit, object/entry
 * overhead), not process RAM or encoded Blob bytes. Always preserves present;
 * if present alone exceeds policy, no extra history is kept. Runs on commit or
 * restore, never on animation evaluation or a drag preview. Both sides have a
 * combined step cap. Temporary traversal is bounded by depth/node policy.
 */
export function limitHistory(state: HistoryState, policy: Readonly<HistoryPolicy> = HISTORY_POLICY, views = new HistorySourceView()): HistoryBudgetResult {
  if (![policy.maxSteps, policy.maxBytes, policy.maxNodes].every(Number.isSafeInteger) || policy.maxSteps < 0 || policy.maxBytes < 1 || policy.maxNodes < 1) throw new RangeError('Invalid history budget.')
  const seen = new WeakSet<object>(), path = new WeakSet<object>(), media = new Set<string>()
  let bytes = 0, nodes = 0
  const visit = (value: unknown, depth = 0): void => {
    if (depth > 48) throw new RangeError('History structure depth exceeded.')
    if (value === null || typeof value !== 'object') { bytes += typeof value === 'string' ? value.length * 2 + 16 : 8 }
    else {
      if (path.has(value)) throw new TypeError('History source must be acyclic.')
      if (seen.has(value)) return
      seen.add(value); path.add(value); nodes++; bytes += 64
      const keys = Object.keys(value)
      for (const key of keys) {
        const item = Object.getOwnPropertyDescriptor(value, key)
        if (!item || !('value' in item)) throw new TypeError('History source accessors are unsupported.')
        bytes += key.length * 2 + 24; visit(item.value, depth + 1)
        if (bytes > policy.maxBytes || nodes > policy.maxNodes) throw new RangeError('History memory budget exceeded.')
      }
      path.delete(value)
    }
    if (bytes > policy.maxBytes || nodes > policy.maxNodes) throw new RangeError('History memory budget exceeded.')
  }
  const total = state.past.length + state.future.length, past: number[] = [], future: number[] = []
  const visitScene = (scene: HistoryState['present']) => {
    if (policy.assetBytes) for (const asset of scene.assets) if (!media.has(asset.url)) { media.add(asset.url); bytes += policy.assetBytes(asset) }
    visit(views.get(scene))
  }
  let presentExceedsBudget = false
  try { visitScene(state.present) } catch { presentExceedsBudget = true }
  if (!presentExceedsBudget) for (const candidate of nearestHistory(state)) {
    if (past.length + future.length >= policy.maxSteps) break
    const before = bytes
    try { visitScene(state[candidate.side][candidate.index]) }
    catch { bytes = before; break }
    ;(candidate.side === 'past' ? past : future).push(candidate.index)
  }
  const keptPast = past.reverse().map(index => state.past[index]), keptFuture = future.map(index => state.future[index])
  const retainedSteps = keptPast.length + keptFuture.length
  return { history: retainedSteps === total ? state : { present: state.present, past: keptPast, future: keptFuture },
    estimatedBytes: bytes, retainedSteps, droppedSteps: total - retainedSteps, presentExceedsBudget }
}
