'use client'
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import type { Model3DData, Model3DResource } from '@/lib/model3d/types'
import type { ModelResourceLookup, ModelSelection } from '@/lib/model3d/inspection/types'
import { buildModelSceneTree, searchModelSceneTree, type ModelSceneTreeItem, type ModelTreeVisibility } from '@/lib/model3d/inspection/modelSceneTree'
import { modelSelectionKey } from '@/lib/model3d/inspection/modelSelection'
import { setModelTreeFlag } from '@/lib/model3d/source/modelVisibility'
import { selectionModeForModifiers, type SelectionMode } from '@/lib/selection/selectionGesture'

interface Props {
  name: string; data: Model3DData; primary?: Model3DResource; lookup: ModelResourceLookup
  selectedKeys: ReadonlySet<string>; isolatedKeys?: ReadonlySet<string>; isolationActive: boolean
  disabled?: boolean
  onSelect(selection?: ModelSelection, mode?: SelectionMode): void
  onSelectAll(): void; onDeleteSelected(): void
  onOpenContextMenu(item: ModelSceneTreeItem, x: number, y: number): void
  renameRequest?: { id: string; name: string } | null
  onRename(target: ModelTreeVisibility, name: string): void; onCancelRename(): void
  onMaterial(): void; onToggleIsolation(): void; onChange(data: Model3DData): void; onRemove(target: ModelTreeVisibility): void
}

/** Searchable hierarchy for the private 3D world. Expansion and search are
 * view-local; source controls use validated commands through the host. Every
 * object row uses the same selection key as viewport picking. */
export function ModelSceneExplorer({ name, data, primary, lookup, selectedKeys, isolatedKeys, isolationActive,
  disabled = false, onSelect, onSelectAll, onDeleteSelected, onOpenContextMenu, renameRequest, onRename, onCancelRename,
  onMaterial, onToggleIsolation, onChange, onRemove }: Props) {
  const [query, setQuery] = useState('')
  const [editingValue, setEditingValue] = useState('')
  const [renameError, setRenameError] = useState('')
  const renameInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!renameRequest) return
    setEditingValue(renameRequest.name); setRenameError('')
    const frame = requestAnimationFrame(() => { renameInput.current?.focus(); renameInput.current?.select() })
    return () => cancelAnimationFrame(frame)
  }, [renameRequest])
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set())
  const tree = useMemo(() => buildModelSceneTree(name, data, primary, lookup, isolatedKeys), [name, data, primary, lookup, isolatedKeys])
  const filtered = useMemo(() => searchModelSceneTree(tree, query), [tree, query])
  const root = filtered ?? { ...tree, children: [] }
  const toggle = (id: string, isOpen: boolean) => {
    setCollapsed(current => { const next = new Set(current); isOpen ? next.add(id) : next.delete(id); return next })
    setOpened(current => { const next = new Set(current); isOpen ? next.delete(id) : next.add(id); return next })
  }
  const choose = (item: ModelSceneTreeItem, event: MouseEvent, frozen: boolean) => {
    if (!item.selection || frozen) return
    onSelect(item.selection, selectionModeForModifiers(event))
    if (item.inspect === 'material') onMaterial()
  }
  const openMenu = (item: ModelSceneTreeItem, x: number, y: number) => onOpenContextMenu(item, x, y)
  const row = (item: ModelSceneTreeItem, depth: number, parentFrozen = false): ReactNode => {
    const hasChildren = item.children.length > 0
    const isOpen = hasChildren && (!!query.trim() || !collapsed.has(item.id) && (depth <= 3 || opened.has(item.id)))
    const frozen = parentFrozen || item.visibility?.frozen === true
    const selected = (item.kind === 'node' || item.kind === 'primitive' || item.kind === 'instance' || item.kind === 'camera' || item.kind === 'light')
      && !!item.selection && selectedKeys.has(modelSelectionKey(item.selection))
    const active = selected
    const editing = renameRequest?.id === item.id && !!item.visibility
    const commitRename = () => {
      if (!item.visibility) return
      const trimmed = editingValue.trim()
      if (!trimmed) { setRenameError('Enter a name.'); return }
      onRename(item.visibility, trimmed)
    }
    return <div key={item.id} role="none" className="min-w-0">
      <div onContextMenu={event => { event.preventDefault(); event.stopPropagation(); openMenu(item, event.clientX, event.clientY) }}
        className={`group flex min-w-0 items-center rounded-sm text-xs ${active ? 'bg-[#164e63] text-white' : 'text-slate-300 hover:bg-[#1d2939]'} ${item.visibility?.visible === false ? 'opacity-55' : ''} ${frozen ? 'italic' : ''}`}>
        <button type="button" aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${item.name}`} aria-expanded={hasChildren ? isOpen : undefined}
          disabled={!hasChildren} onClick={() => toggle(item.id, isOpen)}
          className="flex h-6 w-5 shrink-0 items-center justify-center text-slate-400 disabled:cursor-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">
          {hasChildren ? <span aria-hidden="true" className="text-[10px]">{isOpen ? '▾' : '▸'}</span> : null}
        </button>
        {editing ? <div className="flex h-6 min-w-0 flex-1 items-center gap-1.5">
          <TreeIcon kind={item.kind} />
          <input ref={renameInput} type="text" aria-label={`Rename ${item.name}`} aria-invalid={!!renameError} maxLength={80}
            value={editingValue} onChange={event => { setEditingValue(event.target.value); setRenameError('') }}
            onBlur={onCancelRename} onClick={event => event.stopPropagation()}
            onKeyDown={event => {
              event.stopPropagation()
              if (event.key === 'Enter') { event.preventDefault(); commitRename() }
              if (event.key === 'Escape') { event.preventDefault(); onCancelRename() }
            }}
            className="h-5 min-w-0 flex-1 rounded border border-cyan-400 bg-[#111827] px-1 text-xs text-white outline-none focus:ring-1 focus:ring-cyan-300" />
        </div> : <button type="button" role="treeitem" aria-level={depth} aria-selected={active} aria-disabled={frozen || undefined} aria-expanded={hasChildren ? isOpen : undefined}
          title={item.detail ? `${item.name} · ${item.detail}` : item.name}
          onClick={event => choose(item, event, frozen)}
          onKeyDown={event => {
            if (event.key === 'ArrowRight' && hasChildren && !isOpen) { event.preventDefault(); toggle(item.id, false) }
            if (event.key === 'ArrowLeft' && hasChildren && isOpen) { event.preventDefault(); toggle(item.id, true) }
            if (event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10') {
              event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); openMenu(item, rect.left + 20, rect.bottom)
            }
          }}
          className="flex h-6 min-w-0 flex-1 items-center gap-1.5 truncate text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">
          <TreeIcon kind={item.kind} /><span className="truncate">{item.name}</span>
        </button>}
        {item.visibility && <button type="button" aria-label={`${item.visibility.visible ? 'Hide' : 'Show'} ${item.name}`}
          aria-pressed={item.visibility.visible} title={item.visibility.visible ? 'Hide in 3D scene' : 'Show in 3D scene'} disabled={disabled}
          className="flex h-6 w-6 shrink-0 items-center justify-center text-slate-400 hover:text-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 disabled:opacity-40"
          onClick={() => onChange(setModelTreeFlag(data, item.visibility!, 'visible', !item.visibility!.visible, primary?.inventory))}>
          <EyeIcon visible={item.visibility.visible} />
        </button>}
        {item.visibility && <button type="button" aria-label={`${item.visibility.frozen ? 'Unfreeze' : 'Freeze'} ${item.name}`}
          aria-pressed={item.visibility.frozen === true} title={item.visibility.frozen ? 'Unfreeze selection' : 'Freeze selection'} disabled={disabled}
          className="flex h-6 w-6 shrink-0 items-center justify-center text-slate-400 hover:text-cyan-200 aria-pressed:text-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 disabled:opacity-40"
          onClick={() => { onChange(setModelTreeFlag(data, item.visibility!, 'frozen', !item.visibility!.frozen, primary?.inventory)); if (!item.visibility!.frozen) onSelect(undefined) }}>
          <FreezeIcon />
        </button>}
        {item.visibility && <button type="button" aria-label={`${item.visibility.renderable ? 'Disable render for' : 'Enable render for'} ${item.name}`}
          aria-pressed={item.visibility.renderable !== false} title={item.visibility.renderable ? 'Shown in output' : 'Omitted from output'} disabled={disabled}
          className="flex h-6 w-6 shrink-0 items-center justify-center text-slate-400 hover:text-cyan-200 aria-pressed:text-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 disabled:opacity-40"
          onClick={() => onChange(setModelTreeFlag(data, item.visibility!, 'renderable', !item.visibility!.renderable, primary?.inventory))}>
          <RenderIcon />
        </button>}
        {item.visibility && (item.kind === 'primitive' || item.kind === 'camera' || item.kind === 'light' || item.kind === 'instance' && item.visibility.instanceId !== 'primary') &&
          <button type="button" aria-label={`Remove ${item.name}`} title={`Remove ${item.name}`} disabled={disabled}
            onClick={() => onRemove(item.visibility!)}
            className="flex h-6 w-6 shrink-0 items-center justify-center text-slate-400 hover:text-red-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 disabled:opacity-40">
            <TrashIcon />
          </button>}
      </div>
      {editing && renameError && <p role="alert" className="pl-5 text-[10px] text-amber-300">{renameError}</p>}
      {isOpen && <div className="ml-3 border-l border-[#334155] pl-1">{item.children.map(child => row(child, depth + 1, frozen))}</div>}
    </div>
  }
  return <section aria-label="3D Scene Explorer" className="min-w-0 text-xs">
    <div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Scene Explorer · {selectedKeys.size} selected</h3>
      <button type="button" disabled={!isolationActive && !selectedKeys.size} aria-pressed={isolationActive} onClick={onToggleIsolation}
        className="rounded border border-[#334155] bg-[#1e293b] px-2 py-1 text-[11px] text-slate-200 hover:bg-[#334155] focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 disabled:opacity-40">
        {isolationActive ? 'Exit isolation' : 'Isolate'}</button></div>
    <input type="search" aria-label="Search 3D scene" placeholder="Search objects, materials…" value={query} onChange={event => setQuery(event.target.value)}
      className="mb-2 w-full rounded border border-[#334155] bg-[#111827] px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400" />
    <div role="tree" aria-label="3D Scene Explorer" className="min-w-0" onKeyDown={event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') { event.preventDefault(); onSelectAll() }
      if ((event.key === 'Delete' || event.key === 'Backspace') && !disabled && selectedKeys.size) { event.preventDefault(); onDeleteSelected() }
    }}>{row(root, 1)}</div>
    {(root.children.length === 0 || root.children[0]?.children.length === 0) && <p className="px-2 py-3 text-slate-400">{query ? 'No matching 3D items.' : isolationActive ? 'No objects in this isolated view.' : 'No 3D objects in this scene.'}</p>}
  </section>
}

/** Small monochrome vector glyphs keep type cues legible in the dark tree. */
function TreeIcon({ kind }: { kind: ModelSceneTreeItem['kind'] }) {
  const color = kind === 'material' ? '#f472b6' : kind === 'geometry' ? '#34d399' : kind === 'scene' || kind === 'collection' ? '#cbd5e1' : '#fb923c'
  return <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" className="shrink-0">
    {kind === 'camera' ? <><rect x="1" y="4" width="10" height="8" rx="1" /><path d="m11 6 4-2v8l-4-2" /></>
      : kind === 'light' ? <><circle cx="8" cy="6" r="3" /><path d="M6 10h4M7 13h2M8 1v1M2 6h2M12 6h2" /></>
      : kind === 'material' ? <circle cx="8" cy="8" r="5" fill={color} fillOpacity=".25" />
      : kind === 'scene' || kind === 'collection' ? <><rect x="2" y="3" width="12" height="10" rx="1" /><path d="M2 6h12" /></>
      : <><path d="m8 1 6 3.5v7L8 15l-6-3.5v-7L8 1ZM2 4.5 8 8l6-3.5M8 8v7" /></>}
  </svg>
}

/** Object-level editor lock and output switches; neither creates a scene row. */
function FreezeIcon() {
  return <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><path d="M8 1v14M2 4l12 8M14 4 2 12M6.5 2.5 8 4l1.5-1.5M6.5 13.5 8 12l1.5 1.5" /></svg>
}
function RenderIcon() {
  return <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"><rect x="1.5" y="3" width="13" height="10" rx="1.5" /><path d="m6 6 4.5 2-4.5 2V6Z" /></svg>
}
function TrashIcon() {
  return <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4h10M6 4V2.5h4V4M4.5 4.5l.5 9h6l.5-9M7 6.5v5M9 6.5v5" /></svg>
}

/** Source visibility state is announced independently of row selection. */
function EyeIcon({ visible }: { visible: boolean }) {
  return <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <path d="M1 8s2.5-4 7-4 7 4 7 4-2.5 4-7 4-7-4-7-4Z" /><circle cx="8" cy="8" r="2" />
    {!visible && <path d="M2 14 14 2" />}
  </svg>
}
