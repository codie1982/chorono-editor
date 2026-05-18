'use client'
// ── SelectionPanel (BL-60) ────────────────────────────────────────────────────
// Dock panel for the Smart Selection Engine. Two tabs:
//   1. Select Similar      — find layers matching a reference's properties
//   2. Select By Transform — rule builder (next sprint)
//
// Selection state in page.tsx is UNCHANGED — this panel computes Sets of
// matched layer ids and hands them to onSelect(ids), which routes back into
// the existing multi-select machinery.

import { useMemo, useState } from 'react'
import type { ChronoScene } from '@/lib/types'
import {
  findSimilar,
  matchesAllCriteria,
} from '@/lib/selection/SimilarityMatcher'
import {
  DEFAULT_SIMILARITY,
  type SimilarityOptions,
} from '@/lib/selection/types'

interface Props {
  scene: ChronoScene
  /** The currently-selected layer (primary). Default reference when present. */
  selectedLayerId: string | null
  /** Replace the current selection with these layer ids. */
  onSelectMatched: (ids: Set<string>) => void
}

type Tab = 'similar' | 'byTransform'

export default function SelectionPanel({
  scene, selectedLayerId, onSelectMatched,
}: Props) {
  const [tab, setTab] = useState<Tab>('similar')

  return (
    <div className="flex flex-col h-full text-xs text-gray-300">
      {/* Tab strip */}
      <div className="flex items-center border-b border-gray-700">
        <TabButton active={tab === 'similar'}
          onClick={() => setTab('similar')}
          label="Select Similar" />
        <TabButton active={tab === 'byTransform'}
          onClick={() => setTab('byTransform')}
          label="Select By Transform" />
      </div>

      {tab === 'similar' ? (
        <SelectSimilarTab
          scene={scene}
          selectedLayerId={selectedLayerId}
          onSelectMatched={onSelectMatched}
        />
      ) : (
        <ByTransformTabPlaceholder />
      )}
    </div>
  )
}

function TabButton({
  active, onClick, label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-3 py-1.5 text-[11px] font-medium border-b-2 transition-colors ${
        active
          ? 'border-blue-400 text-gray-100'
          : 'border-transparent text-gray-500 hover:text-gray-300'
      }`}
    >
      {label}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 1: Select Similar
// ─────────────────────────────────────────────────────────────────────────────

function SelectSimilarTab({
  scene, selectedLayerId, onSelectMatched,
}: {
  scene: ChronoScene
  selectedLayerId: string | null
  onSelectMatched: (ids: Set<string>) => void
}) {
  // Reference layer — defaults to current selection, overridable via dropdown.
  const [refId, setRefId] = useState<string | null>(selectedLayerId)
  // Re-sync when the user changes the canvas selection (only if they hadn't
  // manually picked a different reference).
  const effectiveRefId = refId ?? selectedLayerId

  const [opts, setOpts] = useState<SimilarityOptions>(DEFAULT_SIMILARITY)

  const refLayer = scene.layers.find((l) => l.id === effectiveRefId) ?? null

  // Live preview: count of matches given current options.
  const matchedIds = useMemo(() => {
    if (!refLayer) return new Set<string>()
    const canvas = { width: scene.composition.width, height: scene.composition.height }
    const ids = new Set<string>()
    for (const l of scene.layers) {
      if (matchesAllCriteria(refLayer, l, opts, canvas)) ids.add(l.id)
    }
    return ids
  }, [refLayer, scene.layers, scene.composition.width, scene.composition.height, opts])

  const anyToggleEnabled =
    opts.matchScale || opts.matchRotation || opts.matchPosition || opts.matchType || opts.matchOpacity

  function applySelection() {
    if (!refLayer) return
    const canvas = { width: scene.composition.width, height: scene.composition.height }
    const matched = findSimilar(refLayer, scene.layers, opts, canvas)
    onSelectMatched(new Set(matched.map((l) => l.id)))
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      {/* Reference picker */}
      <div>
        <label className="block text-[9px] uppercase tracking-wider text-gray-500 mb-1">
          Reference layer
        </label>
        <select
          value={effectiveRefId ?? ''}
          onChange={(e) => setRefId(e.target.value || null)}
          className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-200 outline-none focus:border-gray-500"
        >
          <option value="" disabled>(pick a layer)</option>
          {scene.layers.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} <span className="text-gray-500">({l.type})</span>
            </option>
          ))}
        </select>
      </div>

      {/* Match toggles + tolerances */}
      <div className="space-y-1.5 border-t border-gray-800 pt-2">
        <MatchToggle
          label="Match Type"
          checked={opts.matchType}
          onChange={(v) => setOpts({ ...opts, matchType: v })}
        />
        <MatchToggleWithTolerance
          label="Match Scale"
          unit="±%"
          checked={opts.matchScale}
          tolerance={opts.scaleTolerancePct}
          step={1}
          min={0}
          max={100}
          onCheckedChange={(v) => setOpts({ ...opts, matchScale: v })}
          onToleranceChange={(v) => setOpts({ ...opts, scaleTolerancePct: v })}
        />
        <MatchToggleWithTolerance
          label="Match Rotation"
          unit="±°"
          checked={opts.matchRotation}
          tolerance={opts.rotationToleranceDeg}
          step={1}
          min={0}
          max={180}
          onCheckedChange={(v) => setOpts({ ...opts, matchRotation: v })}
          onToleranceChange={(v) => setOpts({ ...opts, rotationToleranceDeg: v })}
        />
        <MatchToggleWithTolerance
          label="Match Position"
          unit="±px"
          checked={opts.matchPosition}
          tolerance={opts.positionTolerancePx}
          step={1}
          min={0}
          max={500}
          onCheckedChange={(v) => setOpts({ ...opts, matchPosition: v })}
          onToleranceChange={(v) => setOpts({ ...opts, positionTolerancePx: v })}
        />
        <MatchToggleWithTolerance
          label="Match Opacity"
          unit="±"
          checked={opts.matchOpacity}
          tolerance={opts.opacityTolerance}
          step={0.01}
          min={0}
          max={1}
          onCheckedChange={(v) => setOpts({ ...opts, matchOpacity: v })}
          onToleranceChange={(v) => setOpts({ ...opts, opacityTolerance: v })}
        />
      </div>

      {/* Preview + apply */}
      <div className="border-t border-gray-800 pt-2 space-y-2">
        {!refLayer ? (
          <p className="text-[11px] text-gray-500 italic">Pick a reference layer to preview matches.</p>
        ) : !anyToggleEnabled ? (
          <p className="text-[10px] text-amber-400 bg-amber-950/30 border border-amber-800/40 rounded px-2 py-1">
            ⚠ No match criteria enabled — would select <b>every</b> layer ({scene.layers.length}).
          </p>
        ) : (
          <p className="text-[11px] text-gray-400">
            <span className="text-blue-300 font-semibold">{matchedIds.size}</span>
            {' '}/ {scene.layers.length} layers match
          </p>
        )}
        <button
          onClick={applySelection}
          disabled={!refLayer || matchedIds.size === 0}
          className="w-full px-3 py-1.5 text-[11px] rounded bg-blue-700 hover:bg-blue-600 text-white border border-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Select Matched ({matchedIds.size})
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 2: Select By Transform (placeholder until next sprint)
// ─────────────────────────────────────────────────────────────────────────────

function ByTransformTabPlaceholder() {
  return (
    <div className="flex-1 flex items-center justify-center p-4 text-center text-[11px] text-gray-500">
      <div>
        <p>Rule builder coming in BL-60 Sprint 2.</p>
        <p className="mt-2 text-gray-600 italic">
          Will let you query layers by attributes (e.g. <code>rotation between 30 and 60</code>,
          <br />
          <code>name contains &quot;button&quot;</code>) with AND / OR / NOT combinators.
        </p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Small UI helpers
// ─────────────────────────────────────────────────────────────────────────────

function MatchToggle({
  label, checked, onChange,
}: {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-[11px]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={checked ? 'text-gray-200' : 'text-gray-500'}>{label}</span>
    </label>
  )
}

function MatchToggleWithTolerance({
  label, unit, checked, tolerance,
  min, max, step,
  onCheckedChange, onToleranceChange,
}: {
  label: string
  unit: string
  checked: boolean
  tolerance: number
  min: number; max: number; step: number
  onCheckedChange: (v: boolean) => void
  onToleranceChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
      />
      <span className={`flex-1 ${checked ? 'text-gray-200' : 'text-gray-500'}`}>{label}</span>
      <span className="text-[9px] text-gray-500">{unit}</span>
      <input
        type="number"
        value={tolerance}
        step={step}
        min={min}
        max={max}
        disabled={!checked}
        onChange={(e) => onToleranceChange(Number(e.target.value))}
        className="w-16 bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-[11px] text-gray-100 outline-none disabled:opacity-30 font-mono text-right"
      />
    </div>
  )
}
