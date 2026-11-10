'use client'
import type { KeyCollisionPolicy } from '@/lib/timeline/authoring/keyframeBatch'
import { useState, useCallback, useMemo } from 'react'
import type { ChronoScene } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { TimelineSettings } from '@/lib/types'
import DopeSheetToolbar from './DopeSheetToolbar'
import DopeSheetContainer from './DopeSheetContainer'
import type { DopeSheetUIState } from './types'
import { INITIAL_DOPE_SHEET_STATE } from './types'
import './DopeSheetPanel.css'

interface Props {
  collisionPolicy?: KeyCollisionPolicy
  onCollisionPolicyChange?: (policy: KeyCollisionPolicy) => void
  scene: ChronoScene
  editor: EditorStateReturn
  settings: TimelineSettings
  onSettingsChange: (next: TimelineSettings) => void
  selectedLayerId: string | null
  selectedLayerIds?: ReadonlySet<string>
  selectedTimelineId: string | null
  selectedKfIds: Set<string>
  currentTimeMs: number
  isPlaying: boolean
  onTimeChange: (ms: number) => void
  onSelectKeyframes: (next: Set<string>) => void
  onSelectLayer: (id: string | null, additive?: boolean) => void
}

export default function DopeSheetPanel({
  scene,
  editor,
  settings,
  onSettingsChange,
  selectedLayerId,
  selectedLayerIds,
  selectedTimelineId,
  selectedKfIds,
  currentTimeMs,
  isPlaying,
  onTimeChange,
  onSelectKeyframes,
  onSelectLayer, collisionPolicy, onCollisionPolicyChange,
}: Props) {
  const [localPolicy, setLocalPolicy] = useState<KeyCollisionPolicy>('reject')
  const bulkPolicy = collisionPolicy ?? localPolicy
  const setBulkPolicy = onCollisionPolicyChange ?? setLocalPolicy
  const [uiState, setUiState] = useState<DopeSheetUIState>(INITIAL_DOPE_SHEET_STATE)

  // Get selected timeline
  const selectedTimeline = useMemo(() => {
    if (!selectedTimelineId || !scene.timelines) return null
    return scene.timelines.find(tl => tl.id === selectedTimelineId)
  }, [scene.timelines, selectedTimelineId])

  // Toggle collapse state (nodes expanded by default)
  const toggleNodeExpand = useCallback((nodeId: string) => {
    setUiState(prev => {
      const next = { ...prev }
      next.collapsedNodeIds = new Set(prev.collapsedNodeIds)
      if (next.collapsedNodeIds.has(nodeId)) {
        next.collapsedNodeIds.delete(nodeId)
      } else {
        next.collapsedNodeIds.add(nodeId)
      }
      return next
    })
  }, [])

  // Update filters
  const updateFilter = useCallback((key: keyof DopeSheetUIState, value: any) => {
    setUiState(prev => ({ ...prev, [key]: value }))
  }, [])

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
      <DopeSheetToolbar collisionPolicy={bulkPolicy} onCollisionPolicyChange={setBulkPolicy}
        uiState={uiState}
        onFilterChange={updateFilter}
        settings={settings}
        onSettingsChange={onSettingsChange}
      />
      <DopeSheetContainer collisionPolicy={bulkPolicy} onCollisionPolicyChange={setBulkPolicy}
        scene={scene}
        selectedTimeline={selectedTimeline}
        editor={editor}
        settings={settings}
        selectedLayerId={selectedLayerId}
        selectedLayerIds={selectedLayerIds}
        selectedKfIds={selectedKfIds}
        onToggleExpand={toggleNodeExpand}
        onSelectKeyframes={onSelectKeyframes}
        onSelectLayer={onSelectLayer}
        currentTimeMs={currentTimeMs}
        isPlaying={isPlaying}
        onTimeChange={onTimeChange}
        uiState={uiState}
      />
    </div>
  )
}
