import type { ChronoScene, Timeline, Track, Layer } from '@/lib/types'
import type { TrackNode } from '@/components/dope-sheet/types'

/**
 * Build a hierarchical tree of TrackNode from scene + timeline
 * Represents: Layer hierarchy + Property groups (Transform, Style, etc.)
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
  const nodeMap = new Map<string, TrackNode>()
  let nodeCounter = 0

  // Track which layers have keys
  const tracksByLayerId = new Map<string, Track[]>()
  const allLayerIds = new Set<string>()

  if (timeline.tracks) {
    for (const track of timeline.tracks) {
      const match = track.target.match(/^layers\.([^.]+)/)
      if (match) {
        const layerId = match[1]
        allLayerIds.add(layerId)
        if (!tracksByLayerId.has(layerId)) {
          tracksByLayerId.set(layerId, [])
        }
        tracksByLayerId.get(layerId)!.push(track)
      }
    }
  }

  // Build layer tree (depth-first)
  function buildLayerNode(layer: Layer, depth: number): TrackNode | null {
    const nodeId = `node_${nodeCounter++}`
    const hasKeys = tracksOfLayer(layer.id).length > 0

    // Apply filters
    if (filterAnimatedOnly && !hasKeys) return null
    if (filterSelectedObjectOnly && selectedLayerId && layer.id !== selectedLayerId) {
      // Include if selected layer, otherwise skip
      if (layer.id !== selectedLayerId) return null
    }
    if (filterText && !layer.name.toLowerCase().includes(filterText.toLowerCase())) {
      // Unless it has children matching filter
      // (we'll check below after building children)
    }

    const node: TrackNode = {
      id: nodeId,
      name: layer.name,
      type: layer.type === 'group' ? 'group' : 'object',
      depth,
      trackTarget: `layers.${layer.id}`,
      children: [],
      expanded: true,
      hasKeys,
      isParent: true,
    }

    // Add property groups (Transform, Style, Modifiers)
    const propGroups = buildPropertyGroups(layer, depth + 1)
    node.children = propGroups.map(n => n.id)

    // Add child layers if group
    if (layer.type === 'group' && scene.layers) {
      const childLayers = scene.layers.filter(l => l.parentId === layer.id)
      for (const child of childLayers) {
        const childNode = buildLayerNode(child, depth + 1)
        if (childNode) {
          node.children.push(childNode.id)
          nodeMap.set(childNode.id, childNode)
          nodes.push(childNode)
        }
      }
    }

    return node
  }

  // Build property group nodes (Transform, Style, Modifiers, etc.)
  function buildPropertyGroups(layer: Layer, depth: number): TrackNode[] {
    const groups: TrackNode[] = []

    // Transform group
    const transformProps = [
      `layers.${layer.id}.transform.x`,
      `layers.${layer.id}.transform.y`,
      `layers.${layer.id}.transform.scaleX`,
      `layers.${layer.id}.transform.scaleY`,
      `layers.${layer.id}.transform.rotationDeg`,
      `layers.${layer.id}.opacity`,
    ]
    const transformHasKeys = transformProps.some(
      target => timeline!.tracks?.some(t => t.target === target) ?? false
    )
    if (!filterAnimatedOnly || transformHasKeys) {
      const transformGroup = makePropertyGroup(
        `group_transform_${layer.id}`,
        'Transform',
        depth,
        transformProps,
        timeline!
      )
      groups.push(transformGroup)
      nodeMap.set(transformGroup.id, transformGroup)
      nodes.push(transformGroup)

      // Add property children
      transformProps.forEach(target => {
        const hasKey = timeline!.tracks?.some(t => t.target === target) ?? false
        if (!filterAnimatedOnly || hasKey) {
          const propName = target.split('.').pop() || 'unknown'
          const propNode = makePropertyNode(
            `prop_${target}`,
            propName,
            depth + 1,
            target,
            hasKey
          )
          transformGroup.children.push(propNode.id)
          nodeMap.set(propNode.id, propNode)
          nodes.push(propNode)
        }
      })
    }

    return groups
  }

  // Build root + layers
  const root: TrackNode = {
    id: 'node_scene',
    name: 'Scene',
    type: 'group',
    depth: 0,
    children: [],
    expanded: true,
    hasKeys: false,
    isParent: true,
  }
  nodeMap.set(root.id, root)

  // Add layer nodes
  if (scene.layers) {
    for (const layer of scene.layers) {
      if (!layer.parentId) {
        // Root-level layers only
        const layerNode = buildLayerNode(layer, 1)
        if (layerNode) {
          root.children.push(layerNode.id)
          nodeMap.set(layerNode.id, layerNode)
          nodes.push(layerNode)
        }
      }
    }
  }

  nodes.unshift(root)
  return nodes
}

function makePropertyGroup(
  id: string,
  name: string,
  depth: number,
  tracks: string[],
  timeline: Timeline,
): TrackNode {
  const hasKeys = tracks.some(t => timeline.tracks?.some(tr => tr.target === t) ?? false)
  return {
    id,
    name,
    type: 'group',
    depth,
    children: [],
    expanded: true,
    hasKeys,
    isParent: true,
  }
}

function makePropertyNode(
  id: string,
  name: string,
  depth: number,
  target: string,
  hasKeys: boolean,
): TrackNode {
  return {
    id,
    name,
    type: 'property',
    depth,
    trackTarget: target,
    children: [],
    expanded: true,
    hasKeys,
    isParent: false,
  }
}

// Helper: get all tracks for a layer
function tracksOfLayer(layerId: string): Track[] {
  // This would be passed in context, but for now return empty
  return []
}
