'use client'
import { useState, useCallback, useMemo } from 'react'
import type { ChronoScene, Timeline } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { TimelineSettings } from '@/lib/types'
import DopeSheetToolbar from './DopeSheetToolbar'
import DopeSheetContainer from './DopeSheetContainer'
import type { DopeSheetUIState } from './types'
import { INITIAL_DOPE_SHEET_STATE } from './types'
import './DopeSheetPanel.css'

interface Props {
  scene: ChronoScene
  editor: EditorStateReturn
  settings: TimelineSettings
  onSettingsChange: (next: TimelineSettings) => void
  selectedLayerId: string | null
  selectedTimelineId: string | null
  selectedKfIds: Set<string>
  currentTimeMs: number
  isPlaying: boolean
  onTimeChange: (ms: number) => void
  onSelectKeyframes: (next: Set<string>) => void
  onSelectLayer: (id: string | null) => void
}

export default function DopeSheetPanel({
  scene,
  editor,
  settings,
  onSettingsChange,
  selectedLayerId,
  selectedTimelineId,
  selectedKfIds,
  currentTimeMs,
  isPlaying,
  onTimeChange,
  onSelectKeyframes,
  onSelectLayer,
}: Props) {
  const [uiState, setUiState] = useState<DopeSheetUIState>(INITIAL_DOPE_SHEET_STATE)

  // Get selected timeline
  const selectedTimeline = useMemo(() => {
    if (!selectedTimelineId || !scene.timelines) return null
    return scene.timelines.find(tl => tl.id === selectedTimelineId)
  }, [scene.timelines, selectedTimelineId])

  // Update expand state
  const toggleNodeExpand = useCallback((nodeId: string) => {
    setUiState(prev => {
      const next = { ...prev }
      next.expandedNodeIds = new Set(prev.expandedNodeIds)
      if (next.expandedNodeIds.has(nodeId)) {
        next.expandedNodeIds.delete(nodeId)
      } else {
        next.expandedNodeIds.add(nodeId)
      }
      return next
    })
  }, [])

  // Update filters
  const updateFilter = useCallback((key: keyof DopeSheetUIState, value: any) => {
    setUiState(prev => ({ ...prev, [key]: value }))
  }, [])

  // Update selected keyframes
  const handleSelectKeyframes = useCallback((kfIds: Set<string>) => {
    setUiState(prev => ({ ...prev, selectedKfIds: kfIds }))
    onSelectKeyframes(kfIds)
  }, [onSelectKeyframes])

  if (!selectedTimeline) {
    return (
      <div className="dope-sheet-panel">
        <div className="dope-sheet-empty">
          <p>No timeline selected</p>
        </div>
      </div>
    )
  }

  return (
    <div className="dope-sheet-panel">
      <DopeSheetToolbar
        uiState={uiState}
        onFilterChange={updateFilter}
        settings={settings}
        onSettingsChange={onSettingsChange}
      />
      <DopeSheetContainer
        scene={scene}
        selectedTimeline={selectedTimeline}
        editor={editor}
        selectedLayerId={selectedLayerId}
        selectedKfIds={uiState.selectedKfIds}
        expandedNodeIds={uiState.expandedNodeIds}
        onToggleExpand={toggleNodeExpand}
        onSelectKeyframes={handleSelectKeyframes}
        onSelectLayer={onSelectLayer}
        currentTimeMs={currentTimeMs}
        isPlaying={isPlaying}
        onTimeChange={onTimeChange}
        uiState={uiState}
        onUpdateUIState={setUiState}
      />
    </div>
  )
}
