'use client'
import { useRef, useState } from 'react'
import type { Layer } from '@/lib/types'
import { ANIMATION_PRESETS } from '@/lib/timeline/presets'
import ChoronoIcon from '@/components/ui/ChoronoIcon'
import { LAYER_TYPE_ICON, ADD_LAYER_GROUPS } from '@/lib/icons/iconMap'

interface Props {
  layers: Layer[]
  selectedId: string | null
  selectedIds: Set<string>
  onSelect: (id: string, shiftHeld: boolean) => void
  onAdd: (kind: string) => void
  onAddImage: (file: File) => void
  onAddVideo: (file: File) => void
  onAddAudio: (file: File) => void
  onImportSvg?: (file: File) => void
  onDelete: (id: string) => void
  onReorder: (from: number, to: number) => void
  onToggleFlag: (id: string, field: 'locked' | 'hidden' | 'solo') => void
  /** Inline rename — fired on Enter or blur of the rename input. */
  onRename: (id: string, name: string) => void
  onApplyStagger?: (presetId: string, stepMs: number) => void
  /** Drag-drop: move a layer to a new spot in the tree.
   *  newParentId === undefined → promote to root. toIndex is absolute. */
  onMoveInTree?: (layerId: string, newParentId: string | undefined, toIndex: number) => void
  /** Drag-drop: dropped one layer ONTO another. Caller decides whether to
   *  wrap both in a new group (target is leaf) or re-parent into an
   *  existing group (target.type === 'group'). */
  onGroupWith?: (draggedId: string, targetId: string) => void
}

type DropZone = 'before' | 'after' | 'into'
interface DropTargetState { id: string; zone: DropZone }

export default function LayerPanel({
  layers, selectedId, selectedIds, onSelect, onAdd,
  onAddImage, onAddVideo, onAddAudio, onImportSvg,
  onDelete, onReorder, onToggleFlag, onApplyStagger, onRename,
  onMoveInTree, onGroupWith,
}: Props) {
  // ── Drag-drop state ──────────────────────────────────────────────────────
  // Only the dragged id + the current drop target row + zone — kept tiny so
  // re-renders during dragover are cheap (each only invalidates two rows).
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTargetState | null>(null)
  /** Descendants of the dragged layer — invalid drop targets (can't drop a
   *  layer onto its own subtree). Pre-computed once at drag start. */
  const dragDescendantsRef = useRef<Set<string>>(new Set())
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const svgInputRef   = useRef<HTMLInputElement>(null)
  const [menuOpen, setMenuOpen]       = useState(false)
  const [activeCategory, setCategory] = useState('Basic Shapes')

  // ── Inline rename: double-click a layer name to edit, Enter / blur to
  //    commit, Escape to cancel. Auto-focus + select-all on enter.
  const [editingId,    setEditingId]    = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const beginRename = (l: Layer) => {
    setEditingId(l.id)
    setEditingValue(l.name || l.id)
  }
  const commitRename = () => {
    if (editingId) {
      const trimmed = editingValue.trim()
      if (trimmed.length > 0) onRename(editingId, trimmed)
    }
    setEditingId(null)
  }
  const cancelRename = () => setEditingId(null)
  // Tree expand state — collapsed groups hide their children. Persists across
  // re-renders. Newly created groups default to EXPANDED (not in the set).
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const toggleCollapsed = (id: string) => setCollapsedGroups(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const handleFilePicked = (handler: (file: File) => void) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handler(file)
      e.target.value = ''
    }

  const handleAddItem = (type: string) => {
    setMenuOpen(false)
    switch (type) {
      case 'image':
        return imageInputRef.current?.click()
      case 'video':
        return videoInputRef.current?.click()
      case 'audio':
        return audioInputRef.current?.click()
      case 'svgImport':
        return svgInputRef.current?.click()
      default:
        // All shape kinds, text, pathStroke, bezierPath, pathStroke —
        // registry-driven via page.tsx addLayer().
        return onAdd(type)
    }
  }

  const activeGroup = ADD_LAYER_GROUPS.find(g => g.title === activeCategory) ?? ADD_LAYER_GROUPS[0]

  // ── Drag-drop handlers ────────────────────────────────────────────────────
  // Native HTML5 drag-and-drop is good enough here — it handles the ghost
  // image and cursor automatically, and the dataTransfer API gives us a
  // built-in way to identify the source even when crossing frame boundaries.
  //
  // Pre-compute descendants on dragstart so the dragover handler can reject
  // drops onto the dragged layer's own subtree in O(1).

  const collectDescendants = (rootId: string): Set<string> => {
    const out = new Set<string>([rootId])
    let added = true
    while (added) {
      added = false
      for (const l of layers) {
        if (l.parentId && out.has(l.parentId) && !out.has(l.id)) {
          out.add(l.id)
          added = true
        }
      }
    }
    return out
  }

  const onDragStart = (e: React.DragEvent<HTMLLIElement>, layerId: string) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/x-chorono-layer', layerId)
    setDraggingId(layerId)
    dragDescendantsRef.current = collectDescendants(layerId)
  }

  const onDragEnd = () => {
    setDraggingId(null)
    setDropTarget(null)
    dragDescendantsRef.current = new Set()
  }

  /** Decide which zone the cursor is in (top 25% / middle / bottom 25%). */
  const computeZone = (e: React.DragEvent<HTMLLIElement>): DropZone => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const y = e.clientY - rect.top
    const h = rect.height
    if (y < h * 0.25) return 'before'
    if (y > h * 0.75) return 'after'
    return 'into'
  }

  const onDragOverRow = (e: React.DragEvent<HTMLLIElement>, layer: Layer) => {
    if (!draggingId) return
    // Reject drops onto the dragged layer's own subtree (incl. itself).
    if (dragDescendantsRef.current.has(layer.id)) {
      e.dataTransfer.dropEffect = 'none'
      return
    }
    e.preventDefault()                      // required to allow drop
    e.dataTransfer.dropEffect = 'move'
    const zone = computeZone(e)
    setDropTarget((cur) =>
      cur?.id === layer.id && cur.zone === zone ? cur : { id: layer.id, zone })
  }

  const onDropRow = (e: React.DragEvent<HTMLLIElement>, target: Layer, targetRealIdx: number) => {
    e.preventDefault()
    e.stopPropagation()
    const draggedId = e.dataTransfer.getData('text/x-chorono-layer') || draggingId
    if (!draggedId || draggedId === target.id) { onDragEnd(); return }
    if (dragDescendantsRef.current.has(target.id)) { onDragEnd(); return }

    const zone = computeZone(e)

    if (zone === 'into') {
      // Drop ONTO a row → grouping logic lives in page.tsx (decides whether
      // to wrap-in-new-group or add-to-existing-group based on target type).
      onGroupWith?.(draggedId, target.id)
    } else {
      // Reorder within the target's parent.
      //   • Visually-above (zone='before')  → insert AFTER target in array
      //                                       (panel order is reversed)
      //   • Visually-below (zone='after')   → insert BEFORE target in array
      const newParentId = target.parentId
      const insertAt = zone === 'before' ? targetRealIdx + 1 : targetRealIdx
      onMoveInTree?.(draggedId, newParentId, insertAt)
    }
    onDragEnd()
  }

  /** Empty-area drop at the very bottom of the list = promote to root,
   *  placed BEHIND everything (array index 0 = bottom of z-order). */
  const onDropEmpty = (e: React.DragEvent<HTMLUListElement>) => {
    if (!draggingId) return
    e.preventDefault()
    onMoveInTree?.(draggingId, undefined, 0)
    onDragEnd()
  }

  return (
    <aside className="flex flex-col h-full w-full bg-gray-900 border-r border-gray-700 select-none">
      {/* ── Header ── */}
      <div className="px-3 py-2 border-b border-gray-700 flex items-center justify-between gap-1">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Layers</span>
        <div className="flex items-center gap-1">
          {/* Group / Ungroup buttons now live in the top toolbar so the panel
              header stays clean. Cmd+G / Cmd+Shift+G shortcuts still work. */}
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-white bg-blue-600 hover:bg-blue-500 rounded-md px-2 py-0.5 transition-colors"
            title="Add Layer"
          >
            <span className="text-base leading-none">+</span>
            <span>Add</span>
          </button>
        </div>
      </div>

      {/* ── Add Layer Menu (inline dropdown) ── */}
      {menuOpen && (
        <div className="border-b border-gray-700 bg-gray-950">
          {/* Category tabs */}
          <div className="flex overflow-x-auto scrollbar-none border-b border-gray-800">
            {ADD_LAYER_GROUPS.map(g => (
              <button
                key={g.title}
                onClick={() => setCategory(g.title)}
                className={`shrink-0 px-3 py-1.5 text-[10px] font-medium whitespace-nowrap transition-colors
                  ${activeCategory === g.title
                    ? 'text-blue-400 border-b-2 border-blue-500 bg-gray-900'
                    : 'text-gray-500 hover:text-gray-300'}`}
              >
                {g.title}
              </button>
            ))}
          </div>

          {/* Items grid */}
          <div className="grid grid-cols-2 gap-1 p-2">
            {activeGroup.items.map(item => (
              <button
                key={item.type}
                onClick={() => item.available && handleAddItem(item.type)}
                className={`ch-layer-btn ${!item.available ? 'ch-layer-btn--soon' : ''}`}
                title={item.available ? `Add ${item.label}` : `${item.label} — coming soon`}
              >
                <ChoronoIcon name={item.icon} size={20} />
                <span className="truncate">{item.label}</span>
                {!item.available && (
                  <span className="ml-auto text-[9px] text-gray-600 shrink-0">soon</span>
                )}
              </button>
            ))}
          </div>

          {/* Close strip */}
          <button
            onClick={() => setMenuOpen(false)}
            className="w-full py-1 text-[10px] text-gray-600 hover:text-gray-400 text-center border-t border-gray-800 transition-colors"
          >
            ✕ close
          </button>
        </div>
      )}

      {/* Hidden file inputs */}
      <input ref={imageInputRef} type="file" accept="image/*"  className="hidden" onChange={handleFilePicked(onAddImage)} />
      <input ref={videoInputRef} type="file" accept="video/*"  className="hidden" onChange={handleFilePicked(onAddVideo)} />
      <input ref={audioInputRef} type="file" accept="audio/*"  className="hidden" onChange={handleFilePicked(onAddAudio)} />
      <input ref={svgInputRef}   type="file" accept=".svg,image/svg+xml" className="hidden"
             onChange={handleFilePicked((f) => onImportSvg?.(f))} />

      {/* ── Layer list ── */}
      <ul
        className="flex-1 overflow-y-auto py-1"
        onDragOver={(e) => { if (draggingId) e.preventDefault() }}
        onDrop={onDropEmpty}
      >
        {layers.length === 0 && (
          <li className="px-3 py-8 text-center text-xs text-gray-600 leading-relaxed">
            No layers yet.<br />Press <span className="text-gray-500">+ Add</span> above.
          </li>
        )}

        {/* Flatten layers[] into a tree-ordered list respecting collapse state.
            Roots are reversed so topmost-z-order appears first; children are
            recursively appended right below their parent (also reversed). */}
        {(() => {
          interface Row { layer: Layer; realIdx: number; depth: number; hasChildren: boolean; collapsed: boolean }
          const childrenOf = (parentId?: string) =>
            layers
              .map((l, idx) => ({ l, idx }))
              .filter(({ l }) => l.parentId === parentId)
              .reverse()   // topmost first

          const rows: Row[] = []
          const walk = (parentId: string | undefined, depth: number) => {
            for (const { l, idx } of childrenOf(parentId)) {
              const kids = layers.some(x => x.parentId === l.id)
              const collapsed = collapsedGroups.has(l.id)
              rows.push({ layer: l, realIdx: idx, depth, hasChildren: kids, collapsed })
              if (kids && !collapsed) walk(l.id, depth + 1)
            }
          }
          walk(undefined, 0)
          return rows
        })().map(({ layer, realIdx, depth, hasChildren, collapsed }) => {
          const isPrimary  = layer.id === selectedId
          const isInSet    = selectedIds.has(layer.id)
          const canMoveUp  = realIdx < layers.length - 1
          const canMoveDown= realIdx > 0

          // Resolve icon: prefer shapeKind, then shape, then type
          const iconKey =
            LAYER_TYPE_ICON[(layer as any).shapeKind ?? layer.shape ?? layer.type] ??
            'rectangle'

          // Groups render as a slim, distinct "header strip" instead of a full
          // layer row — they organise their children, not own geometry.
          const isGroup = layer.type === 'group'

          const isDragSource = draggingId === layer.id
          const isDropTarget = dropTarget?.id === layer.id
          const dropZone     = isDropTarget ? dropTarget!.zone : null
          // Drop-zone visuals — coloured outlines so reorder vs. group is
          // visually unambiguous before the user commits.
          //   before  →  blue line ABOVE the row
          //   after   →  blue line BELOW the row
          //   into    →  blue ring around the WHOLE row (will create / join group)
          const dropClass =
            dropZone === 'into'   ? 'ring-2 ring-blue-400 ring-inset' :
            dropZone === 'before' ? 'shadow-[inset_0_2px_0_0_#60a5fa]' :
            dropZone === 'after'  ? 'shadow-[inset_0_-2px_0_0_#60a5fa]' :
            ''

          return (
            <li
              key={layer.id}
              // Disable native DnD while inline-renaming so the input gets
              // pointer events instead of being grabbed by the drag system.
              draggable={editingId !== layer.id}
              onDragStart={(e) => onDragStart(e, layer.id)}
              onDragEnd={onDragEnd}
              onDragOver={(e) => onDragOverRow(e, layer)}
              onDragLeave={() => {
                // Only clear if WE are the current target (dragover on
                // another row will overwrite via setDropTarget anyway).
                setDropTarget((cur) => (cur?.id === layer.id ? null : cur))
              }}
              onDrop={(e) => onDropRow(e, layer, realIdx)}
              onClick={(e) => onSelect(layer.id, e.shiftKey)}
              style={depth > 0 ? { paddingLeft: 6 + depth * 14 } : undefined}
              className={
                (isGroup
                  ? `flex items-center gap-1 px-2 py-0.5 mx-0 my-0 cursor-grab active:cursor-grabbing group border-l-2
                     ${isPrimary
                        ? 'bg-blue-600 text-white border-blue-300'
                        : isInSet
                        ? 'bg-blue-900/60 text-blue-100 border-blue-500'
                        : 'bg-gray-800/60 text-gray-400 border-amber-500/60 hover:bg-gray-800'}
                     ${layer.hidden ? 'opacity-50' : ''}`
                  : `flex items-center gap-1 px-2 py-1.5 mx-1 my-0.5 rounded cursor-grab active:cursor-grabbing group
                     ${isPrimary
                        ? 'bg-blue-600 text-white'
                        : isInSet
                        ? 'bg-blue-900/60 text-blue-100'
                        : 'text-gray-300 hover:bg-gray-700'}
                     ${layer.hidden ? 'opacity-50' : ''}`)
                + ` ${isDragSource ? 'opacity-40' : ''} ${dropClass}`
              }
            >
              {/* Disclosure arrow for groups; empty placeholder for leaves */}
              {hasChildren ? (
                <button
                  onClick={(e) => { e.stopPropagation(); toggleCollapsed(layer.id) }}
                  className={`w-3 h-3 flex items-center justify-center text-[9px] shrink-0 transition-transform
                    ${collapsed ? '' : 'rotate-90'}
                    ${isPrimary ? 'text-blue-200' : 'text-gray-500 hover:text-gray-300'}`}
                  title={collapsed ? 'Expand' : 'Collapse'}
                  aria-expanded={!collapsed}
                >
                  ▶
                </button>
              ) : (
                <span className="w-3 shrink-0" aria-hidden />
              )}
              {/* Flags */}
              <LayerFlag
                active={!!layer.locked}
                onChars="🔒" offChars="🔓"
                title="Lock"
                onClick={(e) => { e.stopPropagation(); onToggleFlag(layer.id, 'locked') }}
              />
              <LayerFlag
                active={!layer.hidden}
                onChars="👁" offChars="⊘"
                title="Visibility"
                onClick={(e) => { e.stopPropagation(); onToggleFlag(layer.id, 'hidden') }}
              />
              <LayerFlag
                active={!!layer.solo}
                onChars="S" offChars="s"
                title="Solo"
                onClick={(e) => { e.stopPropagation(); onToggleFlag(layer.id, 'solo') }}
                highlightClass={layer.solo ? 'text-amber-400 font-bold' : ''}
              />

              {/* Sprite icon — groups use a tiny "▣" badge instead */}
              {isGroup ? (
                <span className={`shrink-0 text-[10px] font-bold tracking-wider
                  ${isPrimary ? 'text-blue-100' : 'text-amber-400/80'}`}>
                  ▣
                </span>
              ) : (
                <span className="shrink-0">
                  <ChoronoIcon
                    name={iconKey}
                    size={20}
                    className={isPrimary ? '' : 'opacity-70'}
                  />
                </span>
              )}

              {editingId === layer.id ? (
                <input
                  type="text"
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter')  { e.preventDefault(); (e.target as HTMLInputElement).blur() }
                    if (e.key === 'Escape') { e.preventDefault(); cancelRename() }
                    e.stopPropagation()
                  }}
                  onClick={(e) => e.stopPropagation()}
                  // Auto-focus + select-all on mount
                  autoFocus
                  onFocus={(e) => e.currentTarget.select()}
                  className={`flex-1 min-w-0 px-1 -mx-1 rounded outline-none
                              bg-gray-950 text-white border border-blue-500
                              ${isGroup ? 'text-[10px] uppercase tracking-wider font-medium' : 'text-xs'}`}
                />
              ) : (
                <span
                  onDoubleClick={(e) => { e.stopPropagation(); beginRename(layer) }}
                  title="Double-click to rename"
                  className={`flex-1 truncate ${isGroup ? 'text-[10px] uppercase tracking-wider font-medium' : 'text-xs'}`}
                >
                  {layer.name || layer.id}
                </span>
              )}

              {/* Reorder */}
              <button
                onClick={(e) => { e.stopPropagation(); if (canMoveUp) onReorder(realIdx, realIdx + 1) }}
                disabled={!canMoveUp}
                className={`opacity-0 group-hover:opacity-100 text-[10px] px-1 rounded
                  disabled:opacity-20 ${isPrimary ? 'hover:bg-blue-500' : 'hover:bg-gray-600'}`}
                title="Bring forward"
              >▲</button>
              <button
                onClick={(e) => { e.stopPropagation(); if (canMoveDown) onReorder(realIdx, realIdx - 1) }}
                disabled={!canMoveDown}
                className={`opacity-0 group-hover:opacity-100 text-[10px] px-1 rounded
                  disabled:opacity-20 ${isPrimary ? 'hover:bg-blue-500' : 'hover:bg-gray-600'}`}
                title="Send backward"
              >▼</button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(layer.id) }}
                className={`opacity-0 group-hover:opacity-100 text-xs px-1 rounded
                  ${isPrimary ? 'hover:bg-blue-500 text-blue-200' : 'hover:bg-gray-600 text-gray-500'}`}
                title="Delete"
              >✕</button>
            </li>
          )
        })}
      </ul>

      {/* ── Stagger picker ── */}
      {selectedIds.size > 1 && onApplyStagger && (
        <StaggerPicker count={selectedIds.size} onApply={onApplyStagger} />
      )}

      {layers.length > 0 && (
        <div className="px-3 py-1.5 border-t border-gray-700 text-xs text-gray-500">
          {layers.length} layers
          {selectedIds.size > 1 ? ` · ${selectedIds.size} selected` : ''}
        </div>
      )}
    </aside>
  )
}

// ── Stagger picker ────────────────────────────────────────────────────────────

function StaggerPicker({ count, onApply }: { count: number; onApply: (presetId: string, stepMs: number) => void }) {
  const [stepMs, setStepMs] = useState(80)
  return (
    <div className="border-t border-gray-700 p-2 space-y-1.5 bg-gray-900/70">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider">
        Stagger ({count} layers)
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="number" value={stepMs} min={0} step={10}
          onChange={(e) => setStepMs(Number(e.target.value))}
          className="w-14 bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-[11px] text-gray-200
                     [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="text-[10px] text-gray-500">ms / layer</span>
      </div>
      <select
        defaultValue=""
        onChange={(e) => { if (e.target.value) { onApply(e.target.value, stepMs); e.target.value = '' } }}
        className="w-full text-[11px] bg-gray-800 border border-gray-600 rounded px-1.5 py-1 text-purple-300
                   focus:outline-none focus:border-purple-500"
      >
        <option value="" disabled>✨ Apply preset (staggered)…</option>
        {ANIMATION_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>
  )
}

// ── Layer flag toggle ─────────────────────────────────────────────────────────

function LayerFlag(props: {
  active: boolean
  onChars: string
  offChars: string
  title: string
  highlightClass?: string
  onClick: (e: React.MouseEvent) => void
}) {
  return (
    <button
      onClick={props.onClick}
      title={props.title}
      className={`text-[10px] w-3.5 h-3.5 leading-none flex items-center justify-center shrink-0
        ${props.active ? 'opacity-90' : 'opacity-40 hover:opacity-70'}
        ${props.highlightClass ?? ''}`}
    >
      {props.active ? props.onChars : props.offChars}
    </button>
  )
}
