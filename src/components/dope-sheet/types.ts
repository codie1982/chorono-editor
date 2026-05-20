// DopeSheet component types & interfaces

export interface DopeSheetUIState {
  /** Track nodes' expand/collapse state */
  expandedNodeIds: Set<string>

  /** Selected keyframe IDs (multi-select) */
  selectedKfIds: Set<string>

  /** Selected track targets (for bulk operations) */
  selectedTrackTargets: Set<string>

  /** Hide tracks with no keyframes */
  filterAnimatedOnly: boolean

  /** Show only selected layer's hierarchy */
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
}

export const INITIAL_DOPE_SHEET_STATE: DopeSheetUIState = {
  expandedNodeIds: new Set(['scene']),
  selectedKfIds: new Set(),
  selectedTrackTargets: new Set(),
  filterAnimatedOnly: false,
  filterSelectedObjectOnly: false,
  filterText: '',
  clipboardKeys: null,
}
