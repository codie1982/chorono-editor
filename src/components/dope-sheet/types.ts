// DopeSheet component types & interfaces

export interface DopeSheetUIState {
  /** Collapsed track node ids (nodes are expanded by default) */
  collapsedNodeIds: Set<string>

  /** Selected track targets (for bulk operations) */
  selectedTrackTargets: Set<string>

  /** Hide tracks with no keyframes */
  filterAnimatedOnly: boolean

  /** Show the union of selected layer hierarchies */
  filterSelectedObjectOnly: boolean

  /** Search/filter by property path substring */
  filterText: string

  /** Clipboard for copy/paste */
  clipboardKeys: DopeSheetClipboard | null
}

export interface DopeSheetClipboard {
  /** Keyframes with track targets and timings */
  keys: Array<{
    trackTarget: string
    timeMs: number
    value: any
    easing: any
  }>

  /** Reference time for relative paste */
  baseTimeMs?: number
}

export interface TrackNode {
  id: string
  name: string
  type: 'object' | 'group' | 'property' | 'parent'
  depth: number
  parentId?: string
  children: string[]
  trackTarget?: string // e.g., "layers.card.opacity"
  expanded: boolean
  hasKeys: boolean
  isParent: boolean
  /** Owning layer, absent on structural property groups and the Scene root. */
  layerId?: string
}

export interface DopeSheetRow {
  node: TrackNode
  /** A parent row summarizes the same filtered descendant tracks. */
  tracks: import('@/lib/types').Track[]
}

export const DOPE_SHEET_ROW_HEIGHT = 28
export const DOPE_SHEET_RULER_HEIGHT = 28
export const DOPE_SHEET_LABEL_WIDTH = 220

export const INITIAL_DOPE_SHEET_STATE: DopeSheetUIState = {
  collapsedNodeIds: new Set(),
  selectedTrackTargets: new Set(),
  filterAnimatedOnly: false,
  filterSelectedObjectOnly: false,
  filterText: '',
  clipboardKeys: null,
}
