'use client'
/**
 * BL-52 — Scene Explorer row
 *
 * Renders a single row across all visible columns. Owns:
 *   - Multi-select click handling (Shift / Ctrl-Cmd modifiers)
 *   - Inline rename (delegated visually to NameCell)
 *   - HTML5 drag/drop with three drop zones (before / after / into)
 *
 * Drag/drop semantics mirror the existing LayerPanel (BL-52 preserves the
 * UX so users coming from the old panel feel at home):
 *   - drop on TOP third       → insert before target (same parent)
 *   - drop on BOTTOM third    → insert after target (same parent)
 *   - drop on MIDDLE third    → group/reparent INTO target
 *   - dropping onto a descendant of the dragged layer is rejected
 */

import { useRef, useState } from 'react'
import type { Layer, Timeline } from '@/lib/types'
import type {
  ColumnDefinition,
} from '@/lib/sceneExplorer/sceneExplorerColumns'
import type { SceneExplorerRow as Row } from '@/lib/sceneExplorer/sceneExplorerModel'
import SceneExplorerCell, { countLayerTracks } from './SceneExplorerCell'

export type DropZone = 'before' | 'after' | 'into'

export interface DropTargetState {
  id: string
  zone: DropZone
}

interface Props {
  row: Row
  columns: ColumnDefinition[]
  isSelected:   boolean
  isPrimary:    boolean
  isDragging:   boolean
  dropTarget:   DropTargetState | null
  invalidDrop:  boolean
  /** Active timeline used for the tracks-count cell. */
  timeline:     Timeline | null

  // Edit state
  isEditing:        boolean
  editingValue:     string
  onSetEditingValue: (v: string) => void
  onBeginRename:    () => void
  onCommitRename:   () => void
  onCancelRename:   () => void

  // Interaction
  onSelect:         (id: string, shift: boolean, meta: boolean) => void
  onToggleExpand:   () => void
  onToggleFlag:     (field: 'locked' | 'hidden' | 'solo' | 'pinned') => void

  // Drag/drop
  onDragStart:      (id: string) => void
  onDragEnd:        () => void
  onDragOverRow:    (id: string, zone: DropZone) => void
  onDropOnRow:      (id: string, zone: DropZone) => void

  // Context menu (right-click). Panel owns the open/close state.
  onContextMenu?:   (id: string, clientX: number, clientY: number) => void
}

const ROW_HEIGHT = 22

export default function SceneExplorerRow(props: Props) {
  const {
    row, columns, isSelected, isPrimary, isDragging,
    dropTarget, invalidDrop, timeline,
    isEditing, editingValue, onSetEditingValue,
    onBeginRename, onCommitRename, onCancelRename,
    onSelect, onToggleExpand, onToggleFlag,
    onDragStart, onDragEnd, onDragOverRow, onDropOnRow,
    onContextMenu,
  } = props

  const ref = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState(false)

  // Compute drop indicator state for THIS row
  const dropZone = dropTarget?.id === row.id ? dropTarget.zone : null

  // Background classes
  let bg = 'bg-transparent'
  if (isPrimary)       bg = 'bg-blue-700/30'
  else if (isSelected) bg = 'bg-blue-900/30'
  if (hovered && !isPrimary && !isSelected) bg = 'bg-gray-800/60'
  if (isDragging)      bg = 'opacity-40'

  // Drop ring (invalid = red, valid + into = blue)
  const ringClass = dropZone === 'into'
    ? (invalidDrop ? 'ring-1 ring-red-500 ring-inset' : 'ring-1 ring-blue-400 ring-inset')
    : ''

  // Track count for the optional tracks column
  const trackCount = countLayerTracks(timeline, row.layer.id)

  return (
    <div
      ref={ref}
      role="row"
      aria-selected={isSelected}
      draggable={!isEditing}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/x-chorono-layer', row.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart(row.id)
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault()
        const rect = ref.current?.getBoundingClientRect()
        if (!rect) return
        const y = e.clientY - rect.top
        const h = rect.height
        const zone: DropZone =
          y < h * 0.25 ? 'before' :
          y > h * 0.75 ? 'after'  :
          'into'
        e.dataTransfer.dropEffect = invalidDrop ? 'none' : 'move'
        onDragOverRow(row.id, zone)
      }}
      onDrop={(e) => {
        e.preventDefault()
        if (!dropZone || invalidDrop) return
        onDropOnRow(row.id, dropZone)
      }}
      onClick={(e) => onSelect(row.id, e.shiftKey, e.metaKey || e.ctrlKey)}
      onContextMenu={(e) => {
        if (!onContextMenu) return
        e.preventDefault()
        e.stopPropagation()
        onContextMenu(row.id, e.clientX, e.clientY)
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`relative flex items-stretch border-b border-gray-800/50 ${bg} ${ringClass}
                  cursor-pointer select-none transition-colors`}
      style={{ height: ROW_HEIGHT }}
    >
      {/* Before / after drop-line indicators */}
      {dropZone === 'before' && (
        <div className={`absolute top-0 left-0 right-0 h-[2px] ${invalidDrop ? 'bg-red-500' : 'bg-blue-400'}`} />
      )}
      {dropZone === 'after' && (
        <div className={`absolute bottom-0 left-0 right-0 h-[2px] ${invalidDrop ? 'bg-red-500' : 'bg-blue-400'}`} />
      )}

      {/* Cells */}
      {columns.map((col) => (
        <div
          key={col.id}
          className={`flex items-stretch overflow-hidden ${col.sticky ? 'sticky left-0 z-10 bg-inherit border-r border-gray-800/70' : ''}`}
          style={{
            width:    col.width === 'flex' ? undefined : col.width,
            flex:     col.width === 'flex' ? '1 1 auto' : '0 0 auto',
            minWidth: col.width === 'flex' ? 120 : col.width,
          }}
        >
          <SceneExplorerCell
            kind={col.kind}
            layer={row.layer}
            depth={col.kind === 'name' ? row.depth : 0}
            hasChildren={row.hasChildren}
            expanded={row.expanded}
            isEditing={col.kind === 'name' && isEditing}
            editingValue={editingValue}
            onSetEditingValue={onSetEditingValue}
            onCommitRename={onCommitRename}
            onCancelRename={onCancelRename}
            onBeginRename={onBeginRename}
            onToggleExpand={onToggleExpand}
            onToggleFlag={onToggleFlag}
            trackCount={trackCount}
          />
        </div>
      ))}
    </div>
  )
}

export const SCENE_EXPLORER_ROW_HEIGHT = ROW_HEIGHT
