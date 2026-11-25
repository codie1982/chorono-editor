import type { SplinePathData } from '../../types/spline'

/** Transient edit level; Object means a SubShape inside one spline layer. */
export type SplineEditMode = 'point' | 'edge' | 'object'
export type SplinePickMode = 'replace' | 'add' | 'subtract' | 'toggle'
export type SplineSelection = Readonly<Record<SplineEditMode, readonly string[]>>

/** Fresh immutable bank. IDs never enter scene JSON, history or another layer. */
export function emptySplineSelection(): SplineSelection { return { point: [], edge: [], object: [] } }

/** Stable input ordering, duplicate removal and invalid-ID pruning. The source
 * is borrowed; an unchanged bank retains identity so UI cleanup cannot loop. */
export function pruneSplineSelection(bank: SplineSelection, data?: SplinePathData): SplineSelection {
  const records = { point: data?.points, edge: data?.segments, object: data?.subShapes }
  const next = { ...bank }
  for (const mode of ['point', 'edge', 'object'] as const) {
    const unique = Array.from(new Set(bank[mode])).filter(id => records[mode] && Object.hasOwn(records[mode]!, id))
    if (unique.length !== bank[mode].length || unique.some((id, i) => id !== bank[mode][i])) next[mode] = unique
  }
  return next.point === bank.point && next.edge === bank.edge && next.object === bank.object ? bank : next
}

/** Change only the active mode's selection; modifiers never alias/mutate caller
 * arrays. Add/replace keep discovery order; toggle processes each ID once. */
export function selectSplineIds(bank: SplineSelection, mode: SplineEditMode, ids: readonly string[], policy: SplinePickMode): SplineSelection {
  const selected = new Set(policy === 'replace' ? [] : bank[mode])
  for (const id of Array.from(new Set(ids))) {
    if (policy === 'subtract' || policy === 'toggle' && selected.has(id)) selected.delete(id)
    else selected.add(id)
  }
  const next = Array.from(selected)
  return next.length === bank[mode].length && next.every((id, i) => id === bank[mode][i]) ? bank : { ...bank, [mode]: next }
}
