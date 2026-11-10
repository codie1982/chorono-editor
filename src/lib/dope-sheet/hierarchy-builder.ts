import type { ChronoScene, Timeline, Track } from '@/lib/types'
import type { TrackNode } from '@/components/dope-sheet/types'
import { buildTimelineLayerRows } from '@/lib/timeline/hierarchy/timelineLayerRows'

/** Display groups retain existing property names and target identities. */
function groupLabel(path: string): string {
  if (path === 'opacity' || path.startsWith('transform.')) return 'Transform'
  if (path.startsWith('style.')) return 'Style'
  if (path.startsWith('shapeParams.')) return 'Shape'
  if (path.startsWith('text.')) return 'Text'
  if (path.startsWith('modifiers.')) return 'Modifiers'
  return 'Other'
}

/** Shared layer projection with Dope Sheet property groups as a presentation
 * adapter. Timeline eligibility, solo, search and the union of selected source
 * subtrees match the main Timeline. Ancestors remain structural only. Iterative
 * parent-first construction supports deeply nested and out-of-order source;
 * no scene, track, key or metadata is changed. Node IDs preserve old collapse
 * and summary-key contracts. Collapse is applied later by the row flattener.
 */
export function buildHierarchy(scene: ChronoScene, timeline: Timeline | null,
  filterAnimatedOnly: boolean, filterSelectedObjectOnly: boolean, filterText: string,
  selectedLayerId: string | null, selectedLayerIds?: ReadonlySet<string>): TrackNode[] {
  if (!timeline) return []
  const root: TrackNode = { id: 'scene', name: 'Scene', type: 'group', depth: 0,
    children: [], expanded: true, hasKeys: false, isParent: true }
  const nodes: TrackNode[] = [root], parents: TrackNode[] = [root]
  const query = filterText.trim().toLowerCase()
  const rows = buildTimelineLayerRows(scene.layers, timeline, { selectedOnly: filterSelectedObjectOnly,
    selectedId: selectedLayerId, selectedIds: selectedLayerIds, animatedOnly: filterAnimatedOnly, filter: filterText }).rows
  for (const row of rows) {
    const { layer, depth } = row
    parents.length = depth + 1
    const parent = parents[depth], node: TrackNode = { id: `layer:${layer.id}`, name: layer.name,
      type: layer.type === 'group' ? 'group' : 'object', depth: depth + 1, layerId: layer.id,
      parentId: parent.id, trackTarget: `layers.${layer.id}`, children: [], expanded: true, hasKeys: false, isParent: true }
    parent.children.push(node.id); nodes.push(node); parents.push(node)
    const groups = new Map<string, Track[]>()
    const nameMatches = !query || layer.name.toLowerCase().includes(query) || layer.type.toLowerCase().includes(query)
    for (const track of row.tracks) {
      const path = track.target.slice(`layers.${layer.id}.`.length)
      if (filterAnimatedOnly && !track.keyframes.length || !nameMatches && !path.toLowerCase().includes(query)) continue
      const label = groupLabel(path), entries = groups.get(label) ?? []
      entries.push(track); groups.set(label, entries)
    }
    for (const [name, tracks] of Array.from(groups)) {
      const group: TrackNode = { id: `group:${layer.id}:${name}`, name, type: 'group', depth: depth + 2,
        parentId: node.id, children: [], expanded: true, hasKeys: false, isParent: true }
      nodes.push(group); node.children.push(group.id)
      for (const track of tracks) {
        const path = track.target.slice(`layers.${layer.id}.`.length), hasKeys = track.keyframes.length > 0
        const property: TrackNode = { id: `prop:${track.target}`, name: path.replace(/^(transform|style|shapeParams|text|modifiers)\./, ''),
          type: 'property', depth: depth + 3, parentId: group.id, trackTarget: track.target, children: [], expanded: true, hasKeys, isParent: false }
        nodes.push(property); group.children.push(property.id)
        group.hasKeys ||= hasKeys
      }
      node.hasKeys ||= group.hasKeys
    }
  }
  const byId = new Map(nodes.map(node => [node.id, node]))
  for (let i = nodes.length - 1; i > 0; i--) {
    const node = nodes[i], parent = byId.get(node.parentId!)
    if (parent && node.hasKeys) parent.hasKeys = true
  }
  return nodes
}
