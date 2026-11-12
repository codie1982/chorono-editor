'use client'
import type { KeyCollisionPolicy } from '@/lib/timeline/authoring/keyframeBatch'
import { useMemo } from 'react'
import type { ChronoScene, Timeline, TimelineSettings } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { buildHierarchy } from '@/lib/dope-sheet/hierarchy-builder'
import { flattenDopeSheetRows } from '@/lib/dope-sheet/rows'
import DopeSheetGrid from './DopeSheetGrid'
import type { DopeSheetUIState } from './types'

interface Props {
  collisionPolicy?: KeyCollisionPolicy
  onCollisionPolicyChange?: (policy: KeyCollisionPolicy) => void
  scene: ChronoScene
  selectedTimeline: Timeline
  editor: EditorStateReturn
  settings: TimelineSettings
  selectedLayerId: string | null
  selectedLayerIds?: ReadonlySet<string>
  selectedKfIds: Set<string>
  onToggleExpand: (nodeId: string) => void
  onSelectKeyframes: (kfIds: Set<string>) => void
  onSelectLayer: (id: string | null, additive?: boolean) => void
  currentTimeMs: number
  isPlaying: boolean
  onTimeChange: (ms: number) => void
  uiState: DopeSheetUIState
}

export default function DopeSheetContainer(props: Props) {
  const { scene, selectedTimeline, uiState, selectedLayerId } = props
  const rows = useMemo(() => flattenDopeSheetRows(buildHierarchy(
    scene, selectedTimeline, uiState.filterAnimatedOnly, uiState.filterSelectedObjectOnly,
    uiState.filterText, selectedLayerId, props.selectedLayerIds,
  ), selectedTimeline, uiState.collapsedNodeIds), [scene, selectedTimeline, uiState, selectedLayerId, props.selectedLayerIds])

  return <div className="dope-sheet-container">
    <DopeSheetGrid {...props} rows={rows} />
  </div>
}
