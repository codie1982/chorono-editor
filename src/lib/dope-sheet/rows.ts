import type { Track, Timeline } from '@/lib/types'
import type { DopeSheetRow, TrackNode } from '@/components/dope-sheet/types'

/** Both columns consume this exact sequence, including structural summary rows. */
export function flattenDopeSheetRows(nodes: TrackNode[], timeline: Timeline, collapsed: Set<string>): DopeSheetRow[] {
  const byId = new Map(nodes.map(node => [node.id, node]))
  const byTarget = new Map(timeline.tracks.map(track => [track.target, track]))
  const cache = new Map<string, Track[]>()
  function tracksFor(node: TrackNode, ancestors = new Set<string>()): Track[] {
    if (cache.has(node.id)) return cache.get(node.id)!
    if (ancestors.has(node.id)) return []
    const chain = new Set(ancestors).add(node.id)
    const tracks = new Map<string, Track>()
    if (node.type === 'property' && node.trackTarget) {
      const track = byTarget.get(node.trackTarget)
      if (track) tracks.set(track.target, track)
    }
    for (const id of node.children) {
      const child = byId.get(id)
      if (child) for (const track of tracksFor(child, chain)) tracks.set(track.target, track)
    }
    const result = Array.from(tracks.values())
    cache.set(node.id, result)
    return result
  }
  const rows: DopeSheetRow[] = []
  const visited = new Set<string>()
  function visit(node: TrackNode) {
    if (visited.has(node.id)) return
    visited.add(node.id)
    rows.push({ node, tracks: tracksFor(node) })
    if (!collapsed.has(node.id)) for (const id of node.children) {
      const child = byId.get(id)
      if (child) visit(child)
    }
  }
  const root = nodes.find(node => node.id === 'scene')
  if (root) visit(root)
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
