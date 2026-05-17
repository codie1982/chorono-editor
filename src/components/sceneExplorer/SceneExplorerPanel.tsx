'use client'
/**
 * BL-52 — Scene Explorer Panel
 *
 * Unified, column-aware layer panel. The drop-in successor to LayerPanel.tsx
 * for the left dock. Subsequent backlog items add bulk operations (BL-53),
 * the selection-unification hook (BL-54), and the visibility filter strip
 * (BL-55) on top of this foundation.
 *
 * Wiring contract: all CRUD goes through the existing page.tsx callbacks so
 * undo/redo / AI / runtime preview pipelines keep working unchanged.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import type { Layer, Timeline } from '@/lib/types'
import { buildSceneExplorerRows, collectDescendants } from '@/lib/sceneExplorer/sceneExplorerModel'
import {
  DEFAULT_COLUMNS,
  defaultVisibleColumnIds,
  getVisibleColumns,
} from '@/lib/sceneExplorer/sceneExplorerColumns'
import SceneExplorerRow, {
  SCENE_EXPLORER_ROW_HEIGHT,
  type DropTargetState,
  type DropZone,
} from './SceneExplorerRow'

interface Props {
  layers: Layer[]
  /** The currently-active timeline (used by the optional Anim column). */
  timeline: Timeline | null
  selectedId: string | null
  selectedIds: Set<string>

  // Selection + edit
  onSelect: (id: string, shiftHeld: boolean, metaHeld: boolean) => void
  onRename: (id: string, name: string) => void

  // Flag toggles (lock/hidden/solo/pinned)
  onToggleFlag: (id: string, field: 'locked' | 'hidden' | 'solo' | 'pinned') => void

  // Drag/drop hierarchy
  onMoveInTree: (layerId: string, newParentId: string | undefined, toIndex: number) => void
  onGroupWith?: (draggedId: string, targetId: string) => void
}

export default function SceneExplorerPanel({
  layers, timeline, selectedId, selectedIds,
  onSelect, onRename, onToggleFlag,
  onMoveInTree, onGroupWith,
}: Props) {
  // ── State ────────────────────────────────────────────────────────────────
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set())
  const [textFilter, setTextFilter]     = useState('')
  const [visibleColumnIds]              = useState<Set<string>>(() => defaultVisibleColumnIds())
  // BL-53 will replace setVisibleColumnIds with a column-manager modal.

  // Inline rename state
  const [editingId, setEditingId]       = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const beginRename = useCallback((l: Layer) => {
    setEditingId(l.id); setEditingValue(l.name || l.id)
  }, [])
  const commitRename = useCallback(() => {
    if (editingId) {
      const trimmed = editingValue.trim()
      if (trimmed.length > 0) onRename(editingId, trimmed)
    }
    setEditingId(null)
  }, [editingId, editingValue, onRename])
  const cancelRename = useCallback(() => setEditingId(null), [])

  // Drag/drop state
  const [draggingId, setDraggingId]   = useState<string | null>(null)
  const [dropTarget, setDropTarget]   = useState<DropTargetState | null>(null)
  const dragDescendantsRef            = useRef<Set<string>>(new Set())

  // ── Derived: visible rows ────────────────────────────────────────────────
  const rows = useMemo(
    () => buildSceneExplorerRows(layers, { collapsedIds, textFilter }),
    [layers, collapsedIds, textFilter],
  )
  const columns = useMemo(
    () => getVisibleColumns(DEFAULT_COLUMNS, visibleColumnIds),
    [visibleColumnIds],
  )

  // ── Handlers ─────────────────────────────────────────────────────────────
  const toggleExpand = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const handleDragStart = useCallback((id: string) => {
    setDraggingId(id)
    dragDescendantsRef.current = collectDescendants(layers, id)
  }, [layers])

  const handleDragEnd = useCallback(() => {
    setDraggingId(null)
    setDropTarget(null)
    dragDescendantsRef.current = new Set()
  }, [])

  const handleDragOverRow = useCallback((id: string, zone: DropZone) => {
    setDropTarget({ id, zone })
  }, [])

  const isInvalidDrop = useCallback((targetId: string): boolean => {
    if (!draggingId)                     return true
    if (targetId === draggingId)         return true
    if (dragDescendantsRef.current.has(targetId)) return true
    const target = layers.find((l) => l.id === targetId)
    if (target?.locked)                  return true
    return false
  }, [draggingId, layers])

  const handleDropOnRow = useCallback((targetId: string, zone: DropZone) => {
    if (!draggingId || isInvalidDrop(targetId)) return
    const target = layers.find((l) => l.id === targetId)
    if (!target) return

    if (zone === 'into') {
      if (target.type === 'group') {
        // drop into existing group → reparent to group root, append at end
        const childIdx = layers.filter((l) => l.parentId === target.id).length
        onMoveInTree(draggingId, target.id, childIdx)
      } else if (onGroupWith) {
        // drop onto a leaf → wrap both in a new group (caller decides)
        onGroupWith(draggingId, targetId)
      }
    } else {
      // before / after — same parent as target, adjacent index
      const newParentId = target.parentId ?? undefined
      const siblings = layers
        .filter((l) => (l.parentId ?? null) === (target.parentId ?? null))
      let idx = siblings.findIndex((l) => l.id === targetId)
      if (zone === 'after') idx += 1
      onMoveInTree(draggingId, newParentId, idx)
    }

    handleDragEnd()
  }, [draggingId, layers, isInvalidDrop, onMoveInTree, onGroupWith, handleDragEnd])

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col h-full bg-gray-900 text-gray-200"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Toolbar (minimal — BL-53 / BL-55 will flesh this out) */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-gray-700 shrink-0">
        <span className="text-[10px] font-mono uppercase text-gray-500">Scene Explorer</span>
        <input
          type="text"
          placeholder="Search…"
          value={textFilter}
          onChange={(e) => setTextFilter(e.target.value)}
          className="ml-auto w-32 px-1.5 py-0.5 text-[10px] bg-gray-800 border border-gray-700 rounded text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
        />
        <span className="text-[9px] font-mono text-gray-600 shrink-0">
          {rows.length}/{layers.length}
        </span>
      </div>

      {/* Column header row */}
      <div
        className="flex items-stretch border-b border-gray-700 bg-gray-850 shrink-0"
        style={{ height: 20 }}
      >
        {columns.map((col) => (
          <div
            key={col.id}
            className={`flex items-center px-1.5 text-[9px] font-mono uppercase text-gray-500 ${
              col.sticky ? 'sticky left-0 z-10 bg-gray-900 border-r border-gray-700' : ''
            }`}
            style={{
              width:    col.width === 'flex' ? undefined : col.width,
              flex:     col.width === 'flex' ? '1 1 auto' : '0 0 auto',
              minWidth: col.width === 'flex' ? 120 : col.width,
              justifyContent: col.kind === 'name' ? 'flex-start'
                              : (col.kind === 'startMs' || col.kind === 'endMs')
                                ? 'flex-end'
                                : 'center',
            }}
            title={col.title ?? col.label}
          >
            {col.label}
          </div>
        ))}
      </div>

      {/* Scrollable rows */}
      <div
        className="flex-1 overflow-auto"
        role="tree"
        aria-label="Scene Explorer"
      >
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-[11px] text-gray-600">
            {layers.length === 0
              ? 'No layers yet — add one from the toolbar.'
              : 'No layers match the current filter.'}
          </div>
        ) : (
          rows.map((row) => (
            <SceneExplorerRow
              key={row.id}
              row={row}
              columns={columns}
              isSelected={selectedIds.has(row.id) || row.id === selectedId}
              isPrimary={row.id === selectedId}
              isDragging={draggingId === row.id}
              dropTarget={dropTarget}
              invalidDrop={dropTarget?.id === row.id ? isInvalidDrop(row.id) : false}
              timeline={timeline}
              isEditing={editingId === row.id}
              editingValue={editingValue}
              onSetEditingValue={setEditingValue}
              onBeginRename={() => beginRename(row.layer)}
              onCommitRename={commitRename}
              onCancelRename={cancelRename}
              onSelect={onSelect}
              onToggleExpand={() => toggleExpand(row.id)}
              onToggleFlag={(field) => onToggleFlag(row.id, field)}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragOverRow={handleDragOverRow}
              onDropOnRow={handleDropOnRow}
            />
          ))
        )}
      </div>

      {/* Footer (placeholder for BL-58 status bar) */}
      <div className="flex items-center justify-between px-2 py-1 border-t border-gray-800 text-[9px] font-mono text-gray-600 shrink-0">
        <span>{layers.length} layers · {selectedIds.size} selected</span>
        <span>row {SCENE_EXPLORER_ROW_HEIGHT}px</span>
      </div>
    </div>
  )
}
