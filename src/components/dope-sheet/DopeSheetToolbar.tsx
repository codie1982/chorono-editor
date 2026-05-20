'use client'
import { useCallback } from 'react'
import type { DopeSheetUIState } from './types'
import type { TimelineSettings } from '@/lib/types'

interface Props {
  uiState: DopeSheetUIState
  onFilterChange: (key: keyof DopeSheetUIState, value: any) => void
  settings: TimelineSettings
  onSettingsChange: (next: TimelineSettings) => void
}

export default function DopeSheetToolbar({
  uiState,
  onFilterChange,
  settings,
  onSettingsChange,
}: Props) {
  const toggleAnimatedOnly = useCallback(() => {
    onFilterChange('filterAnimatedOnly', !uiState.filterAnimatedOnly)
  }, [uiState.filterAnimatedOnly, onFilterChange])

  const toggleSelectedOnly = useCallback(() => {
    onFilterChange('filterSelectedObjectOnly', !uiState.filterSelectedObjectOnly)
  }, [uiState.filterSelectedObjectOnly, onFilterChange])

  const handleSearchChange = useCallback((text: string) => {
    onFilterChange('filterText', text)
  }, [onFilterChange])

  const toggleSnap = useCallback(() => {
    onSettingsChange({ ...settings, snapEnabled: !settings.snapEnabled })
  }, [settings, onSettingsChange])

  return (
    <div className="dope-sheet-toolbar">
      <div className="toolbar-row">
        {/* Filter buttons */}
        <button
          className={`toolbar-btn ${uiState.filterAnimatedOnly ? 'active' : ''}`}
          onClick={toggleAnimatedOnly}
          title="Show only tracks with keyframes"
        >
          Animated Only
        </button>

        <button
          className={`toolbar-btn ${uiState.filterSelectedObjectOnly ? 'active' : ''}`}
          onClick={toggleSelectedOnly}
          title="Show only selected layer"
        >
          Selected Only
        </button>

        <div className="toolbar-divider" />

        {/* Search */}
        <input
          type="text"
          className="toolbar-search"
          placeholder="Search tracks..."
          value={uiState.filterText}
          onChange={e => handleSearchChange(e.target.value)}
        />

        <div className="toolbar-divider" />

        {/* Snap toggle */}
        <button
          className={`toolbar-btn ${settings.snapEnabled ? 'active' : ''}`}
          onClick={toggleSnap}
          title="Toggle snap to grid/frame"
        >
          Snap
        </button>
      </div>
    </div>
  )
}
