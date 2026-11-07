import type { ChronoScene, Timeline, Track, Layer } from '@/lib/types'
import type { TrackNode } from '@/components/dope-sheet/types'

/** Map a property path to its display group (Transform, Style, etc.) */
function groupLabel(propPath: string): string {
  if (propPath === 'opacity' || propPath.startsWith('transform.')) return 'Transform'
  if (propPath.startsWith('style.')) return 'Style'
  if (propPath.startsWith('shapeParams.')) return 'Shape'
  if (propPath.startsWith('text.')) return 'Text'
  if (propPath.startsWith('modifiers.')) return 'Modifiers'
  return 'Other'
}

/** Strip the group prefix so the leaf row shows a short property name. */
function displayPropName(propPath: string): string {
  return propPath.replace(/^(transform|style|shapeParams|text|modifiers)\./, '')
}

/**
 * Build a flat list of TrackNode (with parent→child id links) from the
 * selected timeline. Render walks from the root via children pointers, so
 * the array order does not matter — only that every node is present and
 * each layer appears exactly once.
 *
 * Property groups are derived from the layer's actual tracks (not a hard-
 * coded list), so Style / Shape / Text / Modifier tracks all appear.
 */
export function buildHierarchy(
  scene: ChronoScene,
  timeline: Timeline | null,
  filterAnimatedOnly: boolean,
  filterSelectedObjectOnly: boolean,
  filterText: string,
  selectedLayerId: string | null,
): TrackNode[] {
  if (!timeline) return []

  const nodes: TrackNode[] = []
  const filter = filterText.trim().toLowerCase()
  const layers = scene.layers ?? []

  // Group this timeline's tracks by owning layer id.
  const tracksByLayer = new Map<string, Track[]>()
  for (const t of timeline.tracks ?? []) {
    const m = t.target.match(/^layers\.([^.]+)\./)
    if (!m) continue
    const arr = tracksByLayer.get(m[1]) ?? []
    arr.push(t)
    tracksByLayer.set(m[1], arr)
  }

  const root: TrackNode = {
    id: 'scene', name: 'Scene', type: 'group', depth: 0,
    children: [], expanded: true, hasKeys: false, isParent: true,
  }
  nodes.push(root)

  // Keep ancestors as structural rows so a selected nested object is reachable.
  const allowedBySelection: Set<string> | null = (() => {
    if (!filterSelectedObjectOnly) return null
    const allowed = new Set<string>()
    const collect = (id: string) => {
      if (allowed.has(id)) return
      allowed.add(id)
      for (const l of layers) if (l.parentId === id) collect(l.id)
    }
    if (selectedLayerId) collect(selectedLayerId)
    return allowed
  })()
  const ancestors = new Set<string>()
  if (allowedBySelection && selectedLayerId) {
    let parentId = layers.find(layer => layer.id === selectedLayerId)?.parentId
    while (parentId && !ancestors.has(parentId)) {
      ancestors.add(parentId)
      parentId = layers.find(layer => layer.id === parentId)?.parentId
    }
  }
  const visited = new Set<string>()

  // Build a layer subtree; returns the node id, or null if filtered out.
  function buildLayer(layer: Layer, depth: number): string | null {
    if (visited.has(layer.id)) return null
    visited.add(layer.id)
    if (allowedBySelection && !allowedBySelection.has(layer.id) && !ancestors.has(layer.id)) return null

    const layerTracks = allowedBySelection && !allowedBySelection.has(layer.id) ? [] : tracksByLayer.get(layer.id) ?? []
    const layerHasKeys = layerTracks.some(t => (t.keyframes?.length ?? 0) > 0)
    const nameMatches = !filter || layer.name.toLowerCase().includes(filter)

    const layerNode: TrackNode = {
      id: `layer:${layer.id}`,
      name: layer.name,
      type: layer.type === 'group' ? 'group' : 'object',
      depth,
      trackTarget: `layers.${layer.id}`,
      layerId: layer.id,
      children: [],
      expanded: true,
      hasKeys: layerHasKeys,
      isParent: true,
    }

    // Group tracks by property group.
    const byGroup = new Map<string, Track[]>()
    for (const t of layerTracks) {
      const propPath = t.target.slice(`layers.${layer.id}.`.length)
      const g = groupLabel(propPath)
      const arr = byGroup.get(g) ?? []
      arr.push(t)
      byGroup.set(g, arr)
    }

    const groupIds: string[] = []
    for (const [groupName, gTracks] of Array.from(byGroup.entries())) {
      const groupNode: TrackNode = {
        id: `group:${layer.id}:${groupName}`,
        name: groupName,
        type: 'group',
        depth: depth + 1,
        children: [],
        expanded: true,
        hasKeys: false,
        isParent: true,
      }

      let groupHasKeys = false
      for (const t of gTracks) {
        const propHasKeys = (t.keyframes?.length ?? 0) > 0
        if (filterAnimatedOnly && !propHasKeys) continue
        const propPath = t.target.slice(`layers.${layer.id}.`.length)
        if (filter && !propPath.toLowerCase().includes(filter) && !nameMatches) continue

        const propNode: TrackNode = {
          id: `prop:${t.target}`,
          name: displayPropName(propPath),
          type: 'property',
          depth: depth + 2,
          trackTarget: t.target,
          children: [],
          expanded: true,
          hasKeys: propHasKeys,
          isParent: false,
        }
        nodes.push(propNode)
        groupNode.children.push(propNode.id)
        if (propHasKeys) groupHasKeys = true
      }

      if (groupNode.children.length === 0) continue
      groupNode.hasKeys = groupHasKeys
      nodes.push(groupNode)
      groupIds.push(groupNode.id)
    }

    // Recurse into child layers (group containers or parented layers).
    const childIds: string[] = []
    for (const child of layers) {
      if (child.parentId !== layer.id) continue
      const id = buildLayer(child, depth + 1)
      if (id) childIds.push(id)
    }

    layerNode.children = [...groupIds, ...childIds]
    layerNode.hasKeys = layerHasKeys || childIds.some(id => nodes.find(node => node.id === id)?.hasKeys)

    // Drop a layer that has nothing left to show after filtering.
    if (filterAnimatedOnly && !layerHasKeys && childIds.length === 0) return null
    if (filter && !nameMatches && layerNode.children.length === 0) return null

    nodes.push(layerNode)
    return layerNode.id
  }

  // Root-level layers (no parent). Children are reached via recursion only,
  // so each layer is built exactly once.
  for (const layer of layers) {
    if (layer.parentId) continue
    const id = buildLayer(layer, 1)
    if (id) root.children.push(id)
  }

  root.hasKeys = root.children.some(id => nodes.find(node => node.id === id)?.hasKeys)

  return nodes
}
