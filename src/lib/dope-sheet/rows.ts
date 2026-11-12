import type { Track, Timeline } from '@/lib/types'
import type { DopeSheetRow, TrackNode } from '@/components/dope-sheet/types'

/** Both columns consume this exact sequence and filtered descendant summaries.
 * Iterative postorder aggregation and preorder display avoid recursion limits
 * on deep source trees. Collapsing hides rows, not their summary keys. Inputs
 * are borrowed; target identity deduplicates summaries and cycles are bounded.
 */
export function flattenDopeSheetRows(nodes: TrackNode[], timeline: Timeline, collapsed: Set<string>): DopeSheetRow[] {
  const byId = new Map(nodes.map(node => [node.id, node]))
  const byTarget = new Map(timeline.tracks.map(track => [track.target, track]))
  const cache = new Map<string, Track[]>(), root = byId.get('scene')
  if (!root) return []
  const entered = new Set<string>(), pending = [{ node: root, exit: false }]
  while (pending.length) {
    const { node, exit } = pending.pop()!
    if (!exit) {
      if (entered.has(node.id)) continue
      entered.add(node.id); pending.push({ node, exit: true })
      for (let i = node.children.length - 1; i >= 0; i--) {
        const child = byId.get(node.children[i])
        if (child) pending.push({ node: child, exit: false })
      }
    } else {
      const tracks = new Map<string, Track>()
      const own = node.type === 'property' && node.trackTarget ? byTarget.get(node.trackTarget) : undefined
      if (own) tracks.set(own.target, own)
      for (const id of node.children) for (const track of cache.get(id) ?? []) tracks.set(track.target, track)
      cache.set(node.id, Array.from(tracks.values()))
    }
  }
  const rows: DopeSheetRow[] = [], visited = new Set<string>(), visible = [root]
  while (visible.length) {
    const node = visible.pop()!
    if (visited.has(node.id)) continue
    visited.add(node.id); rows.push({ node, tracks: cache.get(node.id) ?? [] })
    if (!collapsed.has(node.id)) for (let i = node.children.length - 1; i >= 0; i--) {
      const child = byId.get(node.children[i])
      if (child) visible.push(child)
    }
  }
  return rows
}

export function selectDopeSheetKeys(current: Set<string>, ids: string[], shift: boolean, toggle: boolean): Set<string> {
  if (!shift && !toggle) return new Set(ids)
  const next = new Set(current)
  const remove = toggle && ids.every(id => next.has(id))
  for (const id of ids) { if (remove) next.delete(id); else next.add(id) }
  return next
}

export function selectDopeSheetKey(current: Set<string>, id: string, shift: boolean, toggle: boolean): Set<string> {
  return selectDopeSheetKeys(current, [id], shift, toggle)
}

/** Co-located keys get ONE target, so hidden overlapping buttons cannot steal
 * clicks. A summary diamond selects/drags the whole time cluster. */
export function groupDopeSheetKeys(row: DopeSheetRow, previewMs: Record<string, number> = {}) {
  const unique = new Map(row.tracks.flatMap(track => track.keyframes.map(key => [key.id, key] as const)))
  const groups = new Map<number, string[]>()
  for (const key of Array.from(unique.values())) {
    const timeMs = previewMs[key.id] ?? key.timeMs
    const ids = groups.get(timeMs) ?? []
    ids.push(key.id)
    groups.set(timeMs, ids)
  }
  return Array.from(groups, ([timeMs, ids]) => ({ timeMs, ids })).sort((a, b) => a.timeMs - b.timeMs)
}

export function keysInDopeSheetBox(
  rows: DopeSheetRow[],
  box: { x1: number; y1: number; x2: number; y2: number },
  pixelsPerMs: number,
  rowHeight: number,
): Set<string> {
  const left = Math.min(box.x1, box.x2), right = Math.max(box.x1, box.x2)
  const top = Math.min(box.y1, box.y2), bottom = Math.max(box.y1, box.y2)
  const hits = new Set<string>()
  rows.forEach((row, index) => {
    const y = index * rowHeight + rowHeight / 2
    if (y < top || y > bottom) return
    for (const track of row.tracks) for (const key of track.keyframes) {
      const x = key.timeMs * pixelsPerMs
      if (x >= left && x <= right) hits.add(key.id)
    }
  })
  return hits
}

export function dopeSheetTickStep(durationMs: number): number {
  const raw = Math.max(1, durationMs) / 8
  const power = 10 ** Math.floor(Math.log10(raw))
  return ([1, 2, 2.5, 5, 10].find(multiplier => multiplier * power >= raw) ?? 10) * power
}
