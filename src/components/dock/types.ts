// ── Dock Layout Types ────────────────────────────────────────────────────────
// Tile tree model: each region is either a SPLIT (two children, h/v direction,
// pixel ratio) or a LEAF (one or more panels rendered as tabs).

export type DockDirection = 'h' | 'v'
export type DockEdge      = 'left' | 'right' | 'top' | 'bottom' | 'center'

export interface DockSplit {
  kind: 'split'
  id: string
  /** 'h' = horizontal split (children side-by-side), 'v' = vertical (stacked) */
  direction: DockDirection
  /** First-child size as a fraction [0, 1] of the parent's available space. */
  ratio: number
  children: [DockNode, DockNode]
}

export interface DockLeaf {
  kind: 'leaf'
  id: string
  /** Panel IDs rendered as tabs in this leaf. First entry = active tab. */
  panels: string[]
  /** Index into `panels` of the currently-active tab. */
  activeIndex: number
}

export type DockNode = DockSplit | DockLeaf

/** Drop target descriptor handed to the layout mutator on a successful drop. */
export interface DropTarget {
  /** Leaf id where the drop will happen */
  leafId: string
  edge: DockEdge
}

/** Drag state shared across the dock layout (for drop-zone overlays). */
export interface DockDragState {
  panelId: string
  sourceLeafId: string
  startedAt: number
}
