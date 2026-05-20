'use client'
import { useMemo } from 'react'
import type { ChronoScene, Timeline } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import DopeSheetHierarchy from './DopeSheetHierarchy'
import DopeSheetGrid from './DopeSheetGrid'
import type { DopeSheetUIState } from './types'

interface Props {
  scene: ChronoScene
  selectedTimeline: Timeline
  editor: EditorStateReturn
  selectedLayerId: string | null
  selectedKfIds: Set<string>
  expandedNodeIds: Set<string>
  onToggleExpand: (nodeId: string) => void
  onSelectKeyframes: (kfIds: Set<string>) => void
  onSelectLayer: (id: string | null) => void
  currentTimeMs: number
  isPlaying: boolean
  onTimeChange: (ms: number) => void
  uiState: DopeSheetUIState
  onUpdateUIState: (state: DopeSheetUIState) => void
}

export default function DopeSheetContainer({
  scene,
  selectedTimeline,
  editor,
  selectedLayerId,
  selectedKfIds,
  expandedNodeIds,
  onToggleExpand,
  onSelectKeyframes,
  onSelectLayer,
  currentTimeMs,
  isPlaying,
  onTimeChange,
  uiState,
  onUpdateUIState,
}: Props) {
  return (
    <div className="dope-sheet-container">
      <div className="dope-sheet-hierarchy-panel">
        <DopeSheetHierarchy
          scene={scene}
          selectedTimeline={selectedTimeline}
          selectedLayerId={selectedLayerId}
          expandedNodeIds={expandedNodeIds}
          onToggleExpand={onToggleExpand}
          onSelectLayer={onSelectLayer}
          filterAnimatedOnly={uiState.filterAnimatedOnly}
          filterSelectedObjectOnly={uiState.filterSelectedObjectOnly}
          filterText={uiState.filterText}
        />
      </div>

      <div className="dope-sheet-grid-panel">
        <DopeSheetGrid
          selectedTimeline={selectedTimeline}
          selectedKfIds={selectedKfIds}
          onSelectKeyframes={onSelectKeyframes}
          currentTimeMs={currentTimeMs}
          isPlaying={isPlaying}
          onTimeChange={onTimeChange}
          editor={editor}
          uiState={uiState}
          onUpdateUIState={onUpdateUIState}
        />
      </div>
    </div>
  )
}
