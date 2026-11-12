'use client'
import { DocumentationHelp } from '@/components/help/DocumentationHelp'
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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Layer, Timeline } from '@/lib/types'
import { buildSceneExplorerRows, collectDescendants, type SceneExplorerSort } from '@/lib/sceneExplorer/sceneExplorerModel'
import {
  DEFAULT_COLUMNS,
  defaultVisibleColumnIds,
  getVisibleColumns,
  COLUMN_PRESETS,
  detectActivePreset,
  type ColumnDefinition,
} from '@/lib/sceneExplorer/sceneExplorerColumns'
import SceneExplorerRow, {
  SCENE_EXPLORER_ROW_HEIGHT,
  type DropTargetState,
  type DropZone,
} from './SceneExplorerRow'
import ContextMenu from '@/components/ui/ContextMenu'
import { buildSceneExplorerMenu, type SceneExplorerMenuHandlers } from './buildSceneExplorerMenu'
import BulkOperationsToolbar from './BulkOperationsToolbar'
import SubtreeOperationsToolbar from './SubtreeOperationsToolbar'
import { useLayerBranches } from '@/components/layerHierarchy/useLayerBranches'
import { useFindSelected } from '@/components/layerHierarchy/useFindSelected'
import { FindSelectedButton, FoundSelectionNotice } from '@/components/layerHierarchy/FindSelectedControls'
import { LayerIndex } from '@/lib/scene/LayerIndex'
import type { SubtreeFlag } from '@/lib/editor/branches/SubtreeCommands'
import { useSelectedLayerReveal } from './hooks/useSelectedLayerReveal'
import LayerVisibilityPanel from './LayerVisibilityPanel'
import SceneExplorerStatusBar from './SceneExplorerStatusBar'
import QuickFilterChips from './QuickFilterChips'
import SearchInput from './SearchInput'
import { RowLayout } from '@/lib/editor/virtualization/RowLayout'
import { useRowWindow } from '@/components/virtualization/useRowWindow'
import { WindowedRows } from '@/components/virtualization/WindowedRows'
import { DEFAULT_VISIBILITY_FILTERS, type LayerVisibilityFilters } from '@/lib/sceneExplorer/visibilityFilters'

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

  // BL-53 — Context-menu actions (omit any you don't want to expose)
  contextHandlers?: Partial<SceneExplorerMenuHandlers>
  /** BL-53 — called when the bulk toolbar's ✕ button is pressed. */
  onClearSelection?: () => void

  // BL-55 — Layer visibility & state actions
  /** Predicate: does a layer have any animated property tracks?
   *  Used by the "Only animated" filter. */
  isLayerAnimated?: (layer: Layer) => boolean
  /** Predicate: does a layer have effects or masks?
   *  Used by the "Only with effects" filter. */
  doesLayerHaveEffects?: (layer: Layer) => boolean
  /** Resolve selected source roots plus descendants in one reversible command. */
  onSetSubtreeFlag?: (roots: readonly string[], field: SubtreeFlag, value: boolean) => void
  /** Freeze the current explicit selection only. */
  onFreezeSelection?: () => void
  /** Unfreeze the current selection. */
  onUnfreezeSelection?: () => void
}

export default function SceneExplorerPanel({
  layers, timeline, selectedId, selectedIds,
  onSelect, onRename, onToggleFlag,
  onMoveInTree, onGroupWith,
  contextHandlers, onClearSelection,
  isLayerAnimated, doesLayerHaveEffects,
  onFreezeSelection, onUnfreezeSelection, onSetSubtreeFlag,
}: Props) {
  // ── State ────────────────────────────────────────────────────────────────
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set())
  const findSelection = useFindSelected(selectedId, selectedIds)
  const setBranchFlag = useCallback((roots: readonly string[], field: SubtreeFlag, value: boolean) => {
    if (onSetSubtreeFlag) { onSetSubtreeFlag(roots, field, value); return }
    if (field === 'frozen') return
    const index = new LayerIndex(layers)
    const changed = Array.from(index.subtreeIds(roots)).filter(id => !!index.get(id)?.[field] !== value)
    if (changed.length) contextHandlers?.bulkToggleFlag?.(changed, field, value)
  }, [layers, onSetSubtreeFlag, contextHandlers?.bulkToggleFlag])
  const branches = useLayerBranches({ layers, selectedId, selectedIds, setCollapsedIds, onSetFlag: setBranchFlag })
  const [textFilter, setTextFilter]     = useState('')
  // BL-57 C-lite — which layers have their info sub-rows expanded inline.
  // Independent of `collapsedIds` so the user can hide group children but
  // still inspect the layer's animation / effect roster.
  const [subInfoExpandedIds, setSubInfoExpandedIds] = useState<Set<string>>(() => new Set())

  // Column visibility — persisted in localStorage (BL-53.7)
  const [visibleColumnIds, setVisibleColumnIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return defaultVisibleColumnIds()
    try {
      const raw = window.localStorage.getItem('chorono.sceneExplorer.visibleColumns')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) return new Set(parsed as string[])
      }
    } catch { /* fall through */ }
    return defaultVisibleColumnIds()
  })
  useEffect(() => {
    try {
      window.localStorage.setItem(
        'chorono.sceneExplorer.visibleColumns',
        JSON.stringify(Array.from(visibleColumnIds)),
      )
    } catch { /* localStorage full or disabled — silent skip */ }
  }, [visibleColumnIds])

  // Sort — { columnId, direction } persisted in localStorage
  const [sortState, setSortState] = useState<{ columnId: string; direction: 'asc' | 'desc' } | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const raw = window.localStorage.getItem('chorono.sceneExplorer.sort')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && 'columnId' in parsed) return parsed
      }
    } catch { /* */ }
    return null
  })
  useEffect(() => {
    try {
      if (sortState) {
        window.localStorage.setItem('chorono.sceneExplorer.sort', JSON.stringify(sortState))
      } else {
        window.localStorage.removeItem('chorono.sceneExplorer.sort')
      }
    } catch { /* */ }
  }, [sortState])

  // Column-header right-click menu
  const [columnMenu, setColumnMenu] = useState<{ x: number; y: number; columnId: string } | null>(null)

  // BL-58 — Panel-scoped keyboard shortcuts. Scoped via hover state so they
  // don't fight with other panels (Canvas / Timeline). Inputs are exempt.
  const [hovered, setHovered] = useState(false)

  // BL-55 — Visibility filters (type / behaviour). Persisted in localStorage.
  const [visibilityFilters, setVisibilityFilters] = useState<LayerVisibilityFilters>(() => {
    if (typeof window === 'undefined') return DEFAULT_VISIBILITY_FILTERS
    try {
      const raw = window.localStorage.getItem('chorono.sceneExplorer.visibilityFilters')
      if (raw) {
        const parsed = JSON.parse(raw)
        // Merge with defaults so newly-added type keys get default = true.
        return {
          ...DEFAULT_VISIBILITY_FILTERS,
          ...parsed,
          types: { ...DEFAULT_VISIBILITY_FILTERS.types, ...(parsed?.types ?? {}) },
        }
      }
    } catch { /* */ }
    return DEFAULT_VISIBILITY_FILTERS
  })
  useEffect(() => {
    try {
      window.localStorage.setItem(
        'chorono.sceneExplorer.visibilityFilters',
        JSON.stringify(visibilityFilters),
      )
    } catch { /* */ }
  }, [visibilityFilters])

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

  // Context-menu state (BL-53)
  const [menuState, setMenuState] = useState<{
    x: number; y: number; targetId: string
  } | null>(null)

  // ── Derived: sort + visible rows ────────────────────────────────────────
  const columns = useMemo(
    () => getVisibleColumns(DEFAULT_COLUMNS, visibleColumnIds),
    [visibleColumnIds],
  )
  const activeSort: SceneExplorerSort | undefined = useMemo(() => {
    if (!sortState) return undefined
    const col = DEFAULT_COLUMNS.find((c) => c.id === sortState.columnId)
    if (!col?.sortKey) return undefined
    return { accessor: col.sortKey, direction: sortState.direction }
  }, [sortState])
  const rows = useMemo(
    () => buildSceneExplorerRows(layers, {
      collapsedIds, subInfoExpandedIds, timeline, revealIds: findSelection.revealIds,
      textFilter, sort: activeSort,
      visibilityFilters,
      isAnimated: isLayerAnimated,
      hasEffects: doesLayerHaveEffects,
    }),
    [layers, collapsedIds, subInfoExpandedIds, timeline, textFilter, activeSort, visibilityFilters, isLayerAnimated, doesLayerHaveEffects, findSelection.revealIds],
  )
  const scrollRef = useRef<HTMLDivElement>(null)
  const layout = useMemo(() => RowLayout.fixed(rows.length, SCENE_EXPLORER_ROW_HEIGHT), [rows.length])
  const rowKeys = useMemo(() => rows.map(row => row.id), [rows])
  const canFocusRow = useCallback((index: number) => rows[index].kind === 'layer', [rows])
  const windowed = useRowWindow(layout, rowKeys, scrollRef, undefined, canFocusRow)
  useSelectedLayerReveal({ layers, selectedId, selectedIds, setCollapsedIds,
    rowKeys, reveal: windowed.reveal, viewportHeight: windowed.viewport.height, requestKey: findSelection.nonce })

  // ── BL-58 Keyboard shortcuts ─────────────────────────────────────────────
  // Active only when the pointer is over the panel — keeps Delete / Cmd+D
  // etc. from firing while the user is editing on the canvas or in the
  // timeline. Inputs ignore the handler so renaming continues to work.
  useEffect(() => {
    if (!hovered) return
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return
      // Don't intercept during an inline rename either (input already
      // caught the keystroke above, but be defensive).
      if (editingId) return

      const meta = e.metaKey || e.ctrlKey
      const shift = e.shiftKey
      const selIds = Array.from(
        selectedIds.size > 0 ? selectedIds : selectedId ? [selectedId] : []
      )

      // Esc → clear selection
      if (e.key === 'Escape') {
        if (menuState || columnMenu) {
          // let the menu close naturally
          return
        }
        if (selIds.length > 0 && onClearSelection) {
          e.preventDefault()
          onClearSelection()
        }
        return
      }

      // F2 → rename primary
      if (e.key === 'F2' && selectedId) {
        e.preventDefault()
        const layer = layers.find((l) => l.id === selectedId)
        if (layer) beginRename(layer)
        return
      }

      // Delete / Backspace → delete selection
      if ((e.key === 'Delete' || e.key === 'Backspace') && selIds.length > 0) {
        if (contextHandlers?.deleteLayers) {
          e.preventDefault()
          contextHandlers.deleteLayers(selIds)
        }
        return
      }

      // Cmd/Ctrl+D → duplicate
      if (meta && (e.key === 'd' || e.key === 'D') && selIds.length > 0) {
        if (contextHandlers?.duplicate) {
          e.preventDefault()
          selIds.forEach((id) => contextHandlers.duplicate!(id))
        }
        return
      }

      // Cmd/Ctrl+Shift+G → ungroup, Cmd/Ctrl+G → group
      if (meta && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault()
        if (shift) {
          if (contextHandlers?.ungroupGroup && selectedId) {
            const layer = layers.find((l) => l.id === selectedId)
            if (layer?.type === 'group') contextHandlers.ungroupGroup(selectedId)
          }
        } else if (contextHandlers?.groupLayers && selIds.length > 0) {
          contextHandlers.groupLayers(selIds)
        }
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    hovered, editingId, selectedId, selectedIds, layers,
    menuState, columnMenu, onClearSelection, beginRename, contextHandlers,
  ])

  // ── Handlers ─────────────────────────────────────────────────────────────
  const toggleExpand = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  // BL-57 C-lite — toggle the info-row group beneath a layer.
  const toggleSubInfo = useCallback((id: string) => {
    setSubInfoExpandedIds((prev) => {
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

  // ── Context menu open handler ────────────────────────────────────────────
  // If the right-clicked row isn't in the current selection, promote it to
  // primary single-selection so the menu's "Selected (1)" labels read right.
  const handleOpenContextMenu = useCallback((id: string, clientX: number, clientY: number) => {
    if (!selectedIds.has(id) && id !== selectedId) {
      onSelect(id, false, false)
    }
    setMenuState({ x: clientX, y: clientY, targetId: id })
  }, [selectedId, selectedIds, onSelect])

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
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-gray-700 shrink-0">
        <span className="text-[10px] font-mono uppercase text-gray-500">Scene Explorer</span>
        <DocumentationHelp topic="editor/layers/scene-explorer" compact />
        <LayerVisibilityPanel
          filters={visibilityFilters}
          onChange={setVisibilityFilters}
          selectionCount={selectedIds.size}
          onIsolate={contextHandlers?.isolate
            ? () => contextHandlers.isolate!(Array.from(selectedIds))
            : undefined}
          onShowAll={contextHandlers?.showAll}
          onFreezeSelection={onFreezeSelection}
          onUnfreezeSelection={onUnfreezeSelection}
        />
        <SearchInput
          value={textFilter}
          onChange={setTextFilter}
          layers={layers}
        />
        <span className="text-[9px] font-mono text-gray-600 shrink-0">
          {rows.length}/{layers.length}
        </span>
      </div>

      <div className="flex items-center gap-2 px-2 py-1 border-b border-gray-700">
        <FindSelectedButton disabled={!selectedId} onFind={findSelection.find} />
      </div>
      {findSelection.revealIds.length > 0 && <FoundSelectionNotice onRestore={findSelection.restore} />}

      {/* BL-58 — Quick filter chips (single-row type-solo presets) */}
      <QuickFilterChips
        filters={visibilityFilters}
        onChange={setVisibilityFilters}
      />

      {branches.roots.length > 0 && <SubtreeOperationsToolbar
        selectedCount={branches.roots.length} affectedCount={branches.ids.size}
        hasChildren={branches.hasChildren} counts={branches.counts}
        canSetFlag={field => !!onSetSubtreeFlag || field !== 'frozen' && !!contextHandlers?.bulkToggleFlag}
        onExpand={() => branches.setExpanded(branches.roots, true)}
        onCollapse={() => branches.setExpanded(branches.roots, false)}
        onSetFlag={(field, value) => branches.setFlag(branches.roots, field, value)} />}

      {/* BL-53 — Bulk operations toolbar (appears when 2+ rows selected) */}
      {selectedIds.size >= 2 && contextHandlers && (
        <BulkOperationsToolbar
          selectedLayers={layers.filter((l) => selectedIds.has(l.id))}
          onBulkToggleFlag={(ids, field, nextValue) =>
            contextHandlers.bulkToggleFlag?.(ids, field, nextValue)}
          onBulkColor={(ids, color) =>
            contextHandlers.setColorLabel?.(ids, color)}
          onGroup={(ids) => contextHandlers.groupLayers?.(ids)}
          onDelete={(ids) => contextHandlers.deleteLayers?.(ids)}
          onClear={() => onClearSelection?.()}
        />
      )}

      {/* Column header row */}
      <div
        className="flex items-stretch border-b border-gray-700 bg-gray-850 shrink-0"
        style={{ height: 20 }}
      >
        {columns.map((col) => {
          const isSorted    = sortState?.columnId === col.id
          const sortArrow   = isSorted ? (sortState!.direction === 'asc' ? ' ▲' : ' ▼') : ''
          const sortable    = !!col.sortKey
          const handleClick = () => {
            if (!sortable) return
            if (!isSorted)                            setSortState({ columnId: col.id, direction: 'asc' })
            else if (sortState!.direction === 'asc')  setSortState({ columnId: col.id, direction: 'desc' })
            else                                       setSortState(null)  // third click clears
          }
          return (
            <div
              key={col.id}
              onClick={handleClick}
              onContextMenu={(e) => {
                e.preventDefault()
                setColumnMenu({ x: e.clientX, y: e.clientY, columnId: col.id })
              }}
              className={`flex items-center px-1.5 text-[9px] font-mono uppercase select-none ${
                isSorted ? 'text-blue-300' : 'text-gray-500'
              } ${sortable ? 'cursor-pointer hover:text-gray-300' : ''} ${
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
              title={`${col.title ?? col.label}${sortable ? ' — click to sort, right-click for options' : ''}`}
            >
              {col.label}{sortArrow}
            </div>
          )
        })}
      </div>

      {/* Scrollable rows */}
      <div
        ref={scrollRef}
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
          <WindowedRows layout={layout} indices={windowed.indices} rowKey={index => rowKeys[index]}
            renderRow={(index, attributes) => {
            const row = rows[index]
            return (
            <SceneExplorerRow
              attributes={attributes}
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
              onNavigate={direction => {
                if (direction === 'parent') { windowed.focusKey(row.layer.parentId ?? ''); return }
                const step = direction === 'up' ? -1 : 1
                let next = index + step
                while (next >= 0 && next < rows.length && rows[next].kind !== 'layer') next += step
                if (next >= 0 && next < rows.length && (direction !== 'child' || rows[next].depth > row.depth)) windowed.focus(next)
              }}
              onToggleExpand={() => toggleExpand(row.id)}
              onToggleFlag={(field) => onToggleFlag(row.id, field)}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragOverRow={handleDragOverRow}
              onDropOnRow={handleDropOnRow}
              onContextMenu={contextHandlers ? handleOpenContextMenu : undefined}
              subInfoExpanded={subInfoExpandedIds.has(row.id)}
              onToggleSubInfo={toggleSubInfo}
            />
          )}} />
        )}
      </div>

      {/* BL-58 — Rich status bar */}
      <SceneExplorerStatusBar
        layers={layers}
        selectedIds={selectedIds}
        visibleRowCount={rows.length}
        textFilter={textFilter}
        visibilityFilters={visibilityFilters}
        isLayerAnimated={isLayerAnimated}
      />

      {/* Column-header right-click menu (BL-53) — show/hide + sort */}
      {columnMenu && (() => {
        const col = DEFAULT_COLUMNS.find((c) => c.id === columnMenu.columnId)
        if (!col) return null
        const isSorted = sortState?.columnId === col.id
        const items = [
          ...(col.sortKey ? [
            {
              kind: 'action' as const,
              label: 'Sort Ascending',
              icon: isSorted && sortState!.direction === 'asc' ? '✓' : null,
              onSelect: () => setSortState({ columnId: col.id, direction: 'asc' }),
            },
            {
              kind: 'action' as const,
              label: 'Sort Descending',
              icon: isSorted && sortState!.direction === 'desc' ? '✓' : null,
              onSelect: () => setSortState({ columnId: col.id, direction: 'desc' }),
            },
            {
              kind: 'action' as const,
              label: 'Clear Sort',
              disabled: !sortState,
              onSelect: () => setSortState(null),
            },
            { kind: 'separator' as const },
          ] : []),
          {
            kind: 'action' as const,
            label: 'Hide This Column',
            disabled: col.id === 'name',  // Name column is mandatory
            onSelect: () => {
              const next = new Set(visibleColumnIds)
              next.delete(col.id)
              setVisibleColumnIds(next)
            },
          },
          {
            kind: 'submenu' as const,
            label: 'Show / Hide Columns',
            items: DEFAULT_COLUMNS.map((c) => ({
              kind: 'action' as const,
              label: c.label + (c.title ? ` — ${c.title}` : ''),
              icon: visibleColumnIds.has(c.id) ? '☑' : '☐',
              disabled: c.id === 'name',  // Name always visible
              onSelect: () => {
                const next = new Set(visibleColumnIds)
                if (next.has(c.id)) next.delete(c.id); else next.add(c.id)
                setVisibleColumnIds(next)
              },
            })),
          },
          { kind: 'separator' as const },
          {
            // BL-58 — Column presets (named workspace profiles)
            kind: 'submenu' as const,
            label: 'Preset',
            items: COLUMN_PRESETS.map((p) => ({
              kind: 'action' as const,
              label: `${p.label} — ${p.description}`,
              icon: detectActivePreset(visibleColumnIds) === p.id ? '✓' : null,
              onSelect: () => setVisibleColumnIds(new Set(p.columnIds)),
            })),
          },
          {
            kind: 'action' as const,
            label: 'Reset Columns',
            onSelect: () => setVisibleColumnIds(defaultVisibleColumnIds()),
          },
        ]
        return (
          <ContextMenu
            x={columnMenu.x}
            y={columnMenu.y}
            onClose={() => setColumnMenu(null)}
            items={items}
          />
        )
      })()}

      {/* Context menu (BL-53) */}
      {menuState && contextHandlers && (() => {
        const target = layers.find((l) => l.id === menuState.targetId)
        if (!target) return null
        // Effective selection: include the target so single-row right-clicks
        // operate on just that row.
        const ids = selectedIds.has(target.id)
          ? Array.from(selectedIds)
          : [target.id]
        // Provide safe defaults for any handlers the caller omitted.
        const handlers: SceneExplorerMenuHandlers = {
          rename:        contextHandlers.rename        ?? (() => {}),
          duplicate:     contextHandlers.duplicate     ?? (() => {}),
          deleteLayers:  contextHandlers.deleteLayers  ?? (() => {}),
          groupLayers:   contextHandlers.groupLayers   ?? (() => {}),
          ungroupGroup:  contextHandlers.ungroupGroup,
          setColorLabel: contextHandlers.setColorLabel ?? (() => {}),
          bulkToggleFlag: contextHandlers.bulkToggleFlag ?? (() => {}),
          isolate:       contextHandlers.isolate,
          showAll:       contextHandlers.showAll,
          expandSubtrees: ids => branches.setExpanded(ids, true),
          collapseSubtrees: ids => branches.setExpanded(ids, false),
          setSubtreeHidden: (onSetSubtreeFlag || contextHandlers.bulkToggleFlag) ? (ids, hidden) => branches.setFlag(ids, 'hidden', hidden) : undefined,
          setSubtreeFlag: onSetSubtreeFlag ? branches.setFlag : undefined,
        }
        return (
          <ContextMenu
            x={menuState.x}
            y={menuState.y}
            onClose={() => setMenuState(null)}
            items={buildSceneExplorerMenu({
              target,
              selectionIds: ids,
              allLayers: layers,
              handlers,
            })}
          />
        )
      })()}
    </div>
  )
}
