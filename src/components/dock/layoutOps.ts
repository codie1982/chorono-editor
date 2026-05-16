// ── Dock Layout Tree Mutations ───────────────────────────────────────────────
// All pure functions — take a tree, return a new tree. Used by useDockLayout
// to react to drag-drop and tab actions.

import type { DockNode, DockLeaf, DockSplit, DockEdge, DockDirection } from './types'

let idCounter = 0
const nextId = (prefix: string) => `${prefix}_${++idCounter}_${Date.now().toString(36)}`

// ── Lookup helpers ───────────────────────────────────────────────────────────

export function findLeaf(node: DockNode, leafId: string): DockLeaf | null {
  if (node.kind === 'leaf') return node.id === leafId ? node : null
  return findLeaf(node.children[0], leafId) ?? findLeaf(node.children[1], leafId)
}

/** Find which leaf contains the given panel id. Useful for "where does panel live". */
export function findLeafOfPanel(node: DockNode, panelId: string): DockLeaf | null {
  if (node.kind === 'leaf') return node.panels.includes(panelId) ? node : null
  return findLeafOfPanel(node.children[0], panelId) ?? findLeafOfPanel(node.children[1], panelId)
}

// ── Internal: walk + replace by id ───────────────────────────────────────────

function mapNode(node: DockNode, fn: (n: DockNode) => DockNode): DockNode {
  const mapped = fn(node)
  if (mapped.kind === 'split') {
    const a = mapNode(mapped.children[0], fn)
    const b = mapNode(mapped.children[1], fn)
    if (a === mapped.children[0] && b === mapped.children[1]) return mapped
    return { ...mapped, children: [a, b] }
  }
  return mapped
}

function replaceNode(tree: DockNode, targetId: string, replacement: DockNode): DockNode {
  if (tree.id === targetId) return replacement
  if (tree.kind === 'split') {
    const a = replaceNode(tree.children[0], targetId, replacement)
    const b = replaceNode(tree.children[1], targetId, replacement)
    if (a === tree.children[0] && b === tree.children[1]) return tree
    return { ...tree, children: [a, b] }
  }
  return tree
}

// ── Tab ops within a single leaf ─────────────────────────────────────────────

export function setActiveTab(tree: DockNode, leafId: string, panelId: string): DockNode {
  return mapNode(tree, (n) => {
    if (n.kind !== 'leaf' || n.id !== leafId) return n
    const idx = n.panels.indexOf(panelId)
    if (idx < 0) return n
    return { ...n, activeIndex: idx }
  })
}

// ── Insert / remove panels ───────────────────────────────────────────────────

/**
 * Remove a panel from its current leaf. If the leaf becomes empty, the leaf
 * is removed and its sibling promoted into the parent's slot — keeping the
 * tree compact.
 */
export function removePanel(tree: DockNode, panelId: string): DockNode {
  // Step 1: drop the panel from its leaf. When the last panel is removed the
  // leaf is left with an empty `panels` array so collapseEmptyLeaves can
  // detect and remove it in step 2.
  const stepOne = mapNode(tree, (n) => {
    if (n.kind !== 'leaf' || !n.panels.includes(panelId)) return n
    const nextPanels = n.panels.filter((p) => p !== panelId)
    return {
      ...n,
      panels: nextPanels,
      activeIndex: nextPanels.length === 0
        ? 0
        : Math.min(n.activeIndex, nextPanels.length - 1),
    }
  })
  // Step 2: collapse empty leaves
  return collapseEmptyLeaves(stepOne)
}

function collapseEmptyLeaves(node: DockNode): DockNode {
  if (node.kind === 'leaf') return node

  const a = collapseEmptyLeaves(node.children[0])
  const b = collapseEmptyLeaves(node.children[1])
  const aEmpty = a.kind === 'leaf' && a.panels.length === 0
  const bEmpty = b.kind === 'leaf' && b.panels.length === 0
  if (aEmpty && bEmpty) {
    // Both empty — return an empty leaf placeholder (parent split will collapse)
    return { kind: 'leaf', id: node.id, panels: [], activeIndex: 0 }
  }
  if (aEmpty) return b
  if (bEmpty) return a
  if (a === node.children[0] && b === node.children[1]) return node
  return { ...node, children: [a, b] }
}

// ── Drop a panel onto an edge of a target leaf ───────────────────────────────

/**
 * Drop a panel onto a target leaf at the given edge.
 *  - 'center' → add as tab to target leaf
 *  - 'left/right' → split horizontally, panel on that side
 *  - 'top/bottom' → split vertically, panel on that side
 */
export function dropPanel(
  tree: DockNode,
  panelId: string,
  targetLeafId: string,
  edge: DockEdge,
): DockNode {
  // First, remove from current location
  const cleaned = removePanel(tree, panelId)

  // Then locate the (possibly relocated/renumbered) target leaf
  const target = findLeaf(cleaned, targetLeafId)
  if (!target) {
    // Target leaf vanished due to collapse — fall back to root-level append
    return appendPanelToFirstLeaf(cleaned, panelId)
  }

  if (edge === 'center') {
    // Add as tab to existing leaf
    return mapNode(cleaned, (n) => {
      if (n.kind !== 'leaf' || n.id !== targetLeafId) return n
      return {
        ...n,
        panels: [...n.panels, panelId],
        activeIndex: n.panels.length,
      }
    })
  }

  // Edge split — wrap target in a split with a new leaf for the dropped panel
  const newLeaf: DockLeaf = {
    kind: 'leaf', id: nextId('leaf'),
    panels: [panelId], activeIndex: 0,
  }
  const direction: DockDirection = (edge === 'left' || edge === 'right') ? 'h' : 'v'
  const newFirst  = (edge === 'left' || edge === 'top')
  const children: [DockNode, DockNode] = newFirst
    ? [newLeaf, target]
    : [target, newLeaf]

  const split: DockSplit = {
    kind: 'split', id: nextId('split'),
    direction, ratio: newFirst ? 0.3 : 0.7,
    children,
  }
  return replaceNode(cleaned, targetLeafId, split)
}

function appendPanelToFirstLeaf(tree: DockNode, panelId: string): DockNode {
  let inserted = false
  return mapNode(tree, (n) => {
    if (inserted) return n
    if (n.kind !== 'leaf') return n
    inserted = true
    return { ...n, panels: [...n.panels, panelId], activeIndex: n.panels.length }
  })
}

// ── Resize a split's ratio ───────────────────────────────────────────────────

export function setSplitRatio(tree: DockNode, splitId: string, ratio: number): DockNode {
  const clamped = Math.max(0.1, Math.min(0.9, ratio))
  return mapNode(tree, (n) =>
    n.kind === 'split' && n.id === splitId ? { ...n, ratio: clamped } : n
  )
}

// ── Default layout ───────────────────────────────────────────────────────────

/** Build the editor's default layout: LayerPanel | (Canvas | Properties) / Timeline. */
export function defaultLayout(): DockNode {
  return {
    kind: 'split', id: 'root',
    direction: 'v', ratio: 0.65,
    children: [
      // Top row: layers | canvas | properties
      {
        kind: 'split', id: 'top',
        direction: 'h', ratio: 0.18,
        children: [
          { kind: 'leaf', id: 'layers-leaf',  panels: ['layers'],     activeIndex: 0 },
          {
            kind: 'split', id: 'mid',
            direction: 'h', ratio: 0.72,
            children: [
              { kind: 'leaf', id: 'canvas-leaf',     panels: ['canvas'],     activeIndex: 0 },
              { kind: 'leaf', id: 'properties-leaf', panels: ['properties'], activeIndex: 0 },
            ],
          },
        ],
      },
      // Bottom: timeline
      { kind: 'leaf', id: 'timeline-leaf', panels: ['timeline'], activeIndex: 0 },
    ],
  }
}
