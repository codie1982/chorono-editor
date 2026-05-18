'use client'
/**
 * BL-52 — Scene Explorer cell renderers
 *
 * Single dispatcher component keyed by ColumnDefinition.kind. Keeps cell
 * markup co-located so visual changes are made in one place.
 */

import { useEffect, useRef } from 'react'
import type { Layer, Timeline } from '@/lib/types'
import type { CellKind } from '@/lib/sceneExplorer/sceneExplorerColumns'
import type { LayerInfoCounts } from '@/lib/sceneExplorer/sceneExplorerModel'
import ChoronoIcon from '@/components/ui/ChoronoIcon'
import { LAYER_TYPE_ICON } from '@/lib/icons/iconMap'

interface Props {
  kind: CellKind
  layer: Layer
  depth: number
  hasChildren: boolean
  expanded: boolean
  isEditing: boolean
  editingValue: string
  onSetEditingValue: (v: string) => void
  onCommitRename: () => void
  onCancelRename: () => void
  onBeginRename: () => void
  onToggleExpand: () => void
  onToggleFlag: (field: 'locked' | 'hidden' | 'solo' | 'pinned') => void
  /** Animated-property count for the `tracks` cell — pre-computed by parent. */
  trackCount?: number
  // BL-57 C-lite — info-row toggle for the layer name cell
  infoCounts?: LayerInfoCounts
  subInfoExpanded?: boolean
  onToggleSubInfo?: () => void
}

export default function SceneExplorerCell(props: Props) {
  switch (props.kind) {
    case 'name':    return <NameCell {...props} />
    case 'visible': return <FlagCell {...props} field="hidden" onLabel="👁" offLabel="⊘" inverted />
    case 'locked':  return <FlagCell {...props} field="locked" onLabel="🔒" offLabel="🔓" />
    case 'solo':    return <FlagCell {...props} field="solo"   onLabel="S"  offLabel="s" tone="amber" />
    case 'pinned':  return <FlagCell {...props} field="pinned" onLabel="📌" offLabel="·" />
    case 'type':    return <TypeCell layer={props.layer} />
    case 'color':   return <ColorCell layer={props.layer} />
    case 'startMs': return <TimeCell value={props.layer.startMs} />
    case 'endMs':   return <TimeCell value={props.layer.endMs} />
    case 'tracks':  return <TracksCell count={props.trackCount ?? 0} />
  }
}

// ── Name cell (disclosure + icon + editable label) ───────────────────────

function NameCell(p: Props) {
  const { layer, depth, hasChildren, expanded, isEditing,
          editingValue, onSetEditingValue, onCommitRename, onCancelRename,
          onBeginRename, onToggleExpand,
          infoCounts, subInfoExpanded, onToggleSubInfo } = p
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isEditing])

  const iconKey = LAYER_TYPE_ICON[layer.shapeKind ?? layer.shape ?? layer.type] ?? 'rectangle'
  const dimmed  = layer.hidden || layer.locked

  return (
    <div
      className="flex items-center gap-1 min-w-0 h-full"
      style={{ paddingLeft: 4 + depth * 12 }}
    >
      {hasChildren ? (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleExpand() }}
          className="w-4 h-4 flex items-center justify-center text-gray-500 hover:text-gray-200 shrink-0"
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? '▾' : '▸'}
        </button>
      ) : (
        <span className="w-4 h-4 shrink-0" />
      )}

      <ChoronoIcon name={iconKey} size={14} className="shrink-0" />

      {isEditing ? (
        <input
          ref={inputRef}
          value={editingValue}
          onChange={(e) => onSetEditingValue(e.target.value)}
          onBlur={onCommitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); onCommitRename() }
            else if (e.key === 'Escape') { e.preventDefault(); onCancelRename() }
          }}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          className="flex-1 min-w-0 px-1 bg-gray-700 border border-blue-500 rounded text-[11px] text-gray-100 outline-none"
        />
      ) : (
        <span
          onDoubleClick={(e) => { e.stopPropagation(); onBeginRename() }}
          className={`flex-1 min-w-0 truncate text-[11px] select-none ${
            dimmed ? 'text-gray-500 italic' : 'text-gray-200'
          }`}
          title={layer.name || layer.id}
        >
          {layer.name || layer.id}
        </span>
      )}

      {/* BL-57 C-lite — info-row toggle. Shows a compact summary badge
          ("◆3 🧩2 ⛓1 🌑1") when the layer has any animation/effect/
          constraint/mask. Click toggles the sub-info rows below. */}
      {infoCounts && infoCounts.total > 0 && onToggleSubInfo && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSubInfo() }}
          title={subInfoExpanded ? 'Hide layer info' : 'Show layer info'}
          className={`shrink-0 ml-1 px-1 py-0 text-[9px] font-mono rounded transition-colors
            ${subInfoExpanded ? 'bg-blue-700/50 text-blue-100' : 'text-gray-500 hover:bg-gray-700 hover:text-gray-300'}`}
        >
          <span className="mr-0.5">{subInfoExpanded ? '▾' : '▸'}</span>
          {infoCounts.tracks      > 0 && <span className="mr-0.5">◆{infoCounts.tracks}</span>}
          {infoCounts.effects     > 0 && <span className="mr-0.5">🧩{infoCounts.effects}</span>}
          {infoCounts.constraints > 0 && <span className="mr-0.5">⛓{infoCounts.constraints}</span>}
          {infoCounts.masks       > 0 && <span>🌑{infoCounts.masks}</span>}
        </button>
      )}
    </div>
  )
}

// ── Flag cell (binary toggle: 🔒/🔓, 👁/⊘, S/s, 📌/·) ────────────────────

interface FlagCellProps extends Props {
  field: 'locked' | 'hidden' | 'solo' | 'pinned'
  onLabel: string
  offLabel: string
  /** When true, "on" = layer[field] === false (used for `visible` showing `hidden`). */
  inverted?: boolean
  tone?: 'amber'
}

function FlagCell(p: FlagCellProps) {
  const { layer, field, onLabel, offLabel, inverted, tone, onToggleFlag } = p
  const raw    = !!layer[field]
  const isOn   = inverted ? !raw : raw
  const colour = tone === 'amber'
    ? (isOn ? 'text-amber-400 font-bold' : 'text-gray-600')
    : (isOn ? 'text-blue-400' : 'text-gray-600 hover:text-gray-400')

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggleFlag(field) }}
      className={`w-full h-full flex items-center justify-center text-[11px] ${colour}`}
      title={`${field}: ${raw ? 'on' : 'off'} (click to toggle)`}
    >
      {isOn ? onLabel : offLabel}
    </button>
  )
}

// ── Type cell ────────────────────────────────────────────────────────────

function TypeCell({ layer }: { layer: Layer }) {
  const label = layer.shapeKind ?? layer.shape ?? layer.type
  return (
    <div
      className="flex items-center px-1.5 text-[10px] font-mono text-gray-500 truncate h-full"
      title={`type: ${layer.type}${layer.shapeKind ? ` · ${layer.shapeKind}` : ''}`}
    >
      {label}
    </div>
  )
}

// ── Color cell (small swatch) ────────────────────────────────────────────

function ColorCell({ layer }: { layer: Layer }) {
  const color = layer.colorLabel
  return (
    <div className="flex items-center justify-center h-full">
      {color ? (
        <div
          className="w-3 h-3 rounded-sm border border-gray-700"
          style={{ backgroundColor: color }}
          title={color}
        />
      ) : (
        <div className="w-3 h-3 rounded-sm border border-dashed border-gray-700" title="No label" />
      )}
    </div>
  )
}

// ── Time cell (ms) ───────────────────────────────────────────────────────

function TimeCell({ value }: { value: number | undefined }) {
  return (
    <div className="flex items-center justify-end px-1.5 h-full text-[10px] font-mono text-gray-500">
      {value === undefined ? '—' : `${value}ms`}
    </div>
  )
}

// ── Tracks cell (animated-property count badge) ──────────────────────────

function TracksCell({ count }: { count: number }) {
  return (
    <div className="flex items-center justify-center h-full">
      <span
        className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${
          count > 0 ? 'bg-yellow-700 text-yellow-100' : 'text-gray-700'
        }`}
        title={`${count} animated property track${count === 1 ? '' : 's'}`}
      >
        {count > 0 ? `◆${count}` : '—'}
      </span>
    </div>
  )
}

/** Helper for the parent: how many tracks target this layer on a timeline? */
export function countLayerTracks(timeline: Timeline | null | undefined, layerId: string): number {
  if (!timeline) return 0
  const prefix = `layers.${layerId}.`
  let n = 0
  for (const t of timeline.tracks) if (t.target.startsWith(prefix)) n++
  return n
}
