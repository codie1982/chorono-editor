'use client'
// ── ArrayModal (BL-59) ────────────────────────────────────────────────────────
//
// Configures Linear / Grid / Radial array operations. Uses the discriminated
// union ArraySettings type so each pattern shows only its own fields.
//
// Source policy + transform mode + space + animation toggle are shared and
// rendered in a common "Common" section at the bottom.

import { useMemo, useState } from 'react'
import type { Layer } from '@/lib/types'
import {
  type ArraySettings,
  type LinearArraySettings,
  type GridArraySettings,
  type RadialArraySettings,
  type PathArraySettings,
  type ArrayPattern,
  type BaseArraySettings,
  defaultLinearArraySettings,
  defaultGridArraySettings,
  defaultRadialArraySettings,
  defaultPathArraySettings,
} from '@/lib/array/ArrayTypes'
import { countArrayInstances, countNewClones } from '@/lib/array/ArrayTransformResolver'
import ArrayPreviewMini from './ArrayPreviewMini'

interface Props {
  source:                Layer
  hasAnimationOnSource:  boolean
  /** All scene layers — needed for the Path tab's path layer picker. */
  allLayers:             Layer[]
  onApply:               (settings: ArraySettings, asRepeater: boolean) => void
  onClose:               () => void
}

export default function ArrayModal({
  source, hasAnimationOnSource, allLayers, onApply, onClose,
}: Props) {
  const [pattern, setPattern] = useState<ArrayPattern>('linear')
  // BL-59 Phase 2 — Non-destructive (Repeater Modifier) mode. Only Linear
  // and Radial are supported by the renderer; Grid/Path fall back to
  // destructive Array even when this checkbox is checked.
  const [asRepeater, setAsRepeater] = useState(false)
  const repeaterSupported = pattern === 'linear' || pattern === 'radial'

  // Discover path layers in the scene for the Path tab picker.
  const pathLayers = useMemo(
    () => allLayers.filter((l) => l.type === 'path' && l.path && l.path.anchors.length >= 2),
    [allLayers],
  )
  const firstPathId = pathLayers[0]?.id ?? ''

  // Per-pattern state — independent so switching tabs keeps prior values.
  const [linear,  setLinear]  = useState<LinearArraySettings>(defaultLinearArraySettings)
  const [grid,    setGrid]    = useState<GridArraySettings>(defaultGridArraySettings)
  const [radial,  setRadial]  = useState<RadialArraySettings>(defaultRadialArraySettings)
  const [path,    setPath]    = useState<PathArraySettings>(() => defaultPathArraySettings(firstPathId))

  // Always read the live settings for whichever pattern is selected.
  const settings: ArraySettings = useMemo(() => {
    if (pattern === 'linear') return linear
    if (pattern === 'grid')   return grid
    if (pattern === 'radial') return radial
    return path
  }, [pattern, linear, grid, radial, path])

  const totalInstances = countArrayInstances(settings)
  const newClones      = countNewClones(settings)
  const valid          = totalInstances > 0 && newClones >= 1

  function apply() {
    if (!valid) return
    onApply(settings, asRepeater && repeaterSupported)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-[460px] p-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-100">
            Array &ldquo;{source.name}&rdquo;
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Pattern tabs */}
        <div className="mb-4">
          <div className="grid grid-cols-4 gap-1 bg-gray-950 border border-gray-800 rounded p-1">
            <TabBtn label="Linear" active={pattern === 'linear'} onClick={() => setPattern('linear')} />
            <TabBtn label="Grid"   active={pattern === 'grid'}   onClick={() => setPattern('grid')} />
            <TabBtn label="Radial" active={pattern === 'radial'} onClick={() => setPattern('radial')} />
            <TabBtn label="Path"   active={pattern === 'path'}   onClick={() => setPattern('path')} />
          </div>
        </div>

        {/* Per-pattern fields */}
        {pattern === 'linear' && (
          <LinearFields settings={linear} onChange={setLinear} />
        )}
        {pattern === 'grid' && (
          <GridFields settings={grid} onChange={setGrid} />
        )}
        {pattern === 'radial' && (
          <RadialFields settings={radial} onChange={setRadial} />
        )}
        {pattern === 'path' && (
          <PathFields settings={path} onChange={setPath} pathLayers={pathLayers} />
        )}

        {/* Live preview (BL-59 Phase 2) */}
        {valid && <ArrayPreviewMini source={source} settings={settings} allLayers={allLayers} />}

        {/* Common section */}
        <CommonFields
          settings={settings}
          hasAnimationOnSource={hasAnimationOnSource}
          onChange={(patch) => {
            // Patch only touches BaseArraySettings + transformMode for Linear,
            // so the discriminated union stays intact when re-applied.
            if (pattern === 'linear') {
              setLinear({ ...linear, ...patch } as LinearArraySettings)
            } else if (pattern === 'grid') {
              setGrid({ ...grid, ...patch } as GridArraySettings)
            } else if (pattern === 'radial') {
              setRadial({ ...radial, ...patch } as RadialArraySettings)
            } else {
              setPath({ ...path, ...patch } as PathArraySettings)
            }
          }}
        />

        {/* Non-destructive (Repeater Modifier) toggle */}
        <div className="mb-3">
          <label
            className={
              'flex items-start gap-2 text-[11px] ' +
              (repeaterSupported ? 'text-gray-300' : 'text-gray-600')
            }
          >
            <input
              type="checkbox"
              checked={asRepeater && repeaterSupported}
              disabled={!repeaterSupported}
              onChange={(e) => setAsRepeater(e.target.checked)}
              className="accent-blue-500 mt-0.5"
            />
            <span>
              Apply as <span className="font-semibold">Repeater Modifier</span> (non-destructive)
              <div className="text-[10px] text-gray-500 mt-0.5">
                {repeaterSupported
                  ? 'Adds one virtual repeater layer instead of N real layers — animatable count, instant Bake.'
                  : 'Only Linear & Radial patterns support Repeater rendering today.'}
              </div>
            </span>
          </label>
        </div>

        {/* Summary */}
        <div className="mb-4 px-3 py-2 bg-gray-800/50 border border-gray-800 rounded text-[11px] text-gray-400">
          {totalInstances === 0 ? (
            <span className="text-rose-400">No instances — increase count.</span>
          ) : asRepeater && repeaterSupported ? (
            <>
              Will add <span className="text-gray-200 font-medium">1 Repeater layer</span>
              {' '}rendering <span className="text-gray-200 font-medium">{totalInstances}</span> virtual copies.
              Source is hidden but not destroyed. One undo step.
            </>
          ) : (
            <>
              Will create <span className="text-gray-200 font-medium">{newClones}</span> new layer
              {newClones === 1 ? '' : 's'} ({totalInstances} total objects).
              One undo step.
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="text-[11px] px-3 py-1 rounded text-gray-300 hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={apply}
            disabled={!valid}
            className="text-[11px] px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Apply Array
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Pattern field groups ─────────────────────────────────────────────────────

function LinearFields({
  settings, onChange,
}: {
  settings: LinearArraySettings
  onChange: (s: LinearArraySettings) => void
}) {
  return (
    <Section title="Linear">
      <NumberRow label="Count"
        value={settings.count}
        onChange={(n) => onChange({ ...settings, count: Math.max(1, Math.round(n)) })}
        min={1} max={500}
      />
      <Vec2Row label="Move"
        value={settings.move}
        onChange={(v) => onChange({ ...settings, move: v })}
      />
      <NumberRow label="Rotate (°)"
        value={settings.rotationDeg}
        onChange={(n) => onChange({ ...settings, rotationDeg: n })}
      />
      <Vec2Row label="Scale ×"
        value={settings.scale}
        onChange={(v) => onChange({ ...settings, scale: v })}
        step={0.05}
      />
    </Section>
  )
}

function GridFields({
  settings, onChange,
}: {
  settings: GridArraySettings
  onChange: (s: GridArraySettings) => void
}) {
  return (
    <Section title="Grid">
      <div className="grid grid-cols-2 gap-2 mb-2">
        <NumberRow label="Columns"
          value={settings.columns}
          onChange={(n) => onChange({ ...settings, columns: Math.max(1, Math.round(n)) })}
          min={1} max={100}
        />
        <NumberRow label="Rows"
          value={settings.rows}
          onChange={(n) => onChange({ ...settings, rows: Math.max(1, Math.round(n)) })}
          min={1} max={100}
        />
      </div>
      <Vec2Row label="Column move"
        value={settings.columnMove}
        onChange={(v) => onChange({ ...settings, columnMove: v })}
      />
      <Vec2Row label="Row move"
        value={settings.rowMove}
        onChange={(v) => onChange({ ...settings, rowMove: v })}
      />
      <label className="flex items-center gap-2 text-[11px] text-gray-300 mt-2">
        <input
          type="checkbox"
          checked={settings.stagger?.enabled ?? false}
          onChange={(e) =>
            onChange({
              ...settings,
              stagger: e.target.checked
                ? { enabled: true, mode: 'odd-rows', offset: { x: 0, y: 0 } }
                : undefined,
            })
          }
          className="accent-blue-500"
        />
        Stagger rows
      </label>
      {settings.stagger?.enabled && (
        <div className="mt-2 ml-5 grid grid-cols-2 gap-2">
          <select
            value={settings.stagger.mode}
            onChange={(e) =>
              onChange({
                ...settings,
                stagger: { ...settings.stagger!, mode: e.target.value as 'odd-rows' | 'even-rows' },
              })
            }
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-100"
          >
            <option value="odd-rows">Odd rows</option>
            <option value="even-rows">Even rows</option>
          </select>
          <Vec2Row label="Offset"
            value={settings.stagger.offset}
            onChange={(v) =>
              onChange({
                ...settings,
                stagger: { ...settings.stagger!, offset: v },
              })
            }
            compact
          />
        </div>
      )}
    </Section>
  )
}

function PathFields({
  settings, onChange, pathLayers,
}: {
  settings: PathArraySettings
  onChange: (s: PathArraySettings) => void
  pathLayers: Layer[]
}) {
  return (
    <Section title="Path">
      <div className="mb-2">
        <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">
          Target path layer
        </label>
        {pathLayers.length === 0 ? (
          <div className="text-[11px] text-rose-400 italic">
            No path layers in scene. Draw one with the Pen Tool first.
          </div>
        ) : (
          <select
            value={settings.pathLayerId}
            onChange={(e) => onChange({ ...settings, pathLayerId: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-100"
          >
            {pathLayers.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        )}
      </div>
      <NumberRow label="Count"
        value={settings.count}
        onChange={(n) => onChange({ ...settings, count: Math.max(1, Math.round(n)) })}
        min={1} max={500}
      />
      <div className="grid grid-cols-2 gap-2">
        <NumberRow label="Start offset (px)"
          value={settings.startOffset}
          onChange={(n) => onChange({ ...settings, startOffset: Math.max(0, n) })}
        />
        <NumberRow label="End offset (px)"
          value={settings.endOffset}
          onChange={(n) => onChange({ ...settings, endOffset: Math.max(0, n) })}
        />
      </div>
      <NumberRow label="Normal offset"
        value={settings.normalOffset}
        onChange={(n) => onChange({ ...settings, normalOffset: n })}
      />
      <label className="flex items-center gap-2 text-[11px] text-gray-300 mt-1">
        <input
          type="checkbox"
          checked={settings.alignToTangent}
          onChange={(e) => onChange({ ...settings, alignToTangent: e.target.checked })}
          className="accent-blue-500"
        />
        Align to path tangent
      </label>
      <label className="flex items-center gap-2 text-[11px] text-gray-300">
        <input
          type="checkbox"
          checked={settings.reverse}
          onChange={(e) => onChange({ ...settings, reverse: e.target.checked })}
          className="accent-blue-500"
        />
        Distribute in reverse
      </label>
    </Section>
  )
}

function RadialFields({
  settings, onChange,
}: {
  settings: RadialArraySettings
  onChange: (s: RadialArraySettings) => void
}) {
  return (
    <Section title="Radial">
      <NumberRow label="Count"
        value={settings.count}
        onChange={(n) => onChange({ ...settings, count: Math.max(1, Math.round(n)) })}
        min={1} max={500}
      />
      <NumberRow label="Radius"
        value={settings.radius}
        onChange={(n) => onChange({ ...settings, radius: n })}
        min={0}
      />
      <Vec2Row label="Center"
        value={settings.center}
        onChange={(v) => onChange({ ...settings, center: v })}
      />
      <div className="grid grid-cols-2 gap-2">
        <NumberRow label="Start angle (°)"
          value={settings.startAngleDeg}
          onChange={(n) => onChange({ ...settings, startAngleDeg: n })}
        />
        <NumberRow label="Total angle (°)"
          value={settings.totalAngleDeg}
          onChange={(n) => onChange({ ...settings, totalAngleDeg: n })}
        />
      </div>
      <label className="flex items-center gap-2 text-[11px] text-gray-300 mt-1">
        <input
          type="checkbox"
          checked={settings.closed}
          onChange={(e) => onChange({ ...settings, closed: e.target.checked })}
          className="accent-blue-500"
        />
        Closed circle (last copy does not overlap first)
      </label>
      <label className="flex items-center gap-2 text-[11px] text-gray-300">
        <input
          type="checkbox"
          checked={settings.orientToAngle}
          onChange={(e) => onChange({ ...settings, orientToAngle: e.target.checked })}
          className="accent-blue-500"
        />
        Orient copies to angle
      </label>
      {settings.orientToAngle && (
        <NumberRow label="Rotation offset (°)"
          value={settings.rotationOffsetDeg}
          onChange={(n) => onChange({ ...settings, rotationOffsetDeg: n })}
        />
      )}
    </Section>
  )
}

// ── Common settings (transformMode / space / sourcePolicy / animation) ──────

// Patch type: BaseArraySettings fields + linear-only transformMode override.
// Keeps the discriminated union narrowable in the parent.
type CommonPatch = Partial<BaseArraySettings>

function CommonFields({
  settings, hasAnimationOnSource, onChange,
}: {
  settings: ArraySettings
  hasAnimationOnSource: boolean
  onChange: (patch: CommonPatch) => void
}) {
  return (
    <Section title="Options">
      {/* Source policy */}
      <SegmentChoice<'include-source' | 'clone-source-too'>
        label="Source"
        value={settings.sourcePolicy}
        options={[
          { value: 'include-source', label: 'Include source (count = total)' },
          { value: 'clone-source-too', label: 'Clone source (count = new clones)' },
        ]}
        onChange={(v) => onChange({ sourcePolicy: v })}
      />

      {/* Transform mode — only meaningful for Linear */}
      {settings.pattern === 'linear' && (
        <SegmentChoice<'incremental' | 'total'>
          label="Transform"
          value={settings.transformMode}
          options={[
            { value: 'incremental', label: 'Per-copy step' },
            { value: 'total', label: 'Total span' },
          ]}
          onChange={(v) => onChange({ transformMode: v })}
        />
      )}

      {/* Coordinate space — MVP only world */}
      <div className="mb-2">
        <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">Space</label>
        <select
          value={settings.space}
          onChange={(e) => onChange({ space: e.target.value as ArraySettings['space'] })}
          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-100"
        >
          <option value="world">World</option>
          <option value="local" disabled>Local (Phase 2)</option>
          <option value="parent" disabled>Parent (Phase 2)</option>
        </select>
      </div>

      {/* Animation duplication */}
      <label className="flex items-center gap-2 text-[11px] text-gray-300 mt-2">
        <input
          type="checkbox"
          checked={settings.duplicateAnimation}
          disabled={!hasAnimationOnSource}
          onChange={(e) => onChange({ duplicateAnimation: e.target.checked })}
          className="accent-blue-500"
        />
        <span className={hasAnimationOnSource ? '' : 'text-gray-600'}>
          Duplicate animation tracks
          {!hasAnimationOnSource && (
            <span className="ml-1 text-gray-600 italic">(no tracks on source)</span>
          )}
        </span>
      </label>

      {/* Time offset (only enabled when animation dup is on) */}
      {settings.duplicateAnimation && hasAnimationOnSource && (
        <NumberRow label="Time offset per copy (ms)"
          value={settings.timeOffsetMs ?? 0}
          onChange={(n) => onChange({ timeOffsetMs: n })}
        />
      )}
    </Section>
  )
}

// ── Reusable primitives ──────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 pb-3 border-b border-gray-800 last:border-b-0">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">{title}</div>
      {children}
    </div>
  )
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={
        'text-[11px] px-2 py-1 rounded transition-colors ' +
        (active
          ? 'bg-blue-600 text-white'
          : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200')
      }
    >
      {label}
    </button>
  )
}

function NumberRow({
  label, value, onChange, min, max, step = 1,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  step?: number
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <label className="text-[11px] text-gray-400 flex-1">{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(n)
        }}
        className="w-24 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[12px] text-gray-100 outline-none focus:border-gray-500"
      />
    </div>
  )
}

function Vec2Row({
  label, value, onChange, step = 1, compact = false,
}: {
  label: string
  value: { x: number; y: number }
  onChange: (v: { x: number; y: number }) => void
  step?: number
  compact?: boolean
}) {
  return (
    <div className={'mb-2 ' + (compact ? '' : 'flex items-center gap-2')}>
      {!compact && (
        <label className="text-[11px] text-gray-400 flex-1">{label}</label>
      )}
      <div className="flex items-center gap-1">
        <Vec2Input axis="X" value={value.x} step={step} onChange={(n) => onChange({ ...value, x: n })} />
        <Vec2Input axis="Y" value={value.y} step={step} onChange={(n) => onChange({ ...value, y: n })} />
      </div>
    </div>
  )
}

function Vec2Input({
  axis, value, onChange, step = 1,
}: {
  axis: 'X' | 'Y'
  value: number
  onChange: (n: number) => void
  step?: number
}) {
  return (
    <div className="flex items-center gap-1 bg-gray-800 border border-gray-700 rounded px-1">
      <span className="text-[10px] text-gray-500">{axis}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(n)
        }}
        className="w-14 bg-transparent px-1 py-1 text-[12px] text-gray-100 outline-none"
      />
    </div>
  )
}

function SegmentChoice<T extends string>({
  label, value, options, onChange,
}: {
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (v: T) => void
}) {
  return (
    <div className="mb-2">
      <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">{label}</label>
      <div className="grid grid-cols-2 gap-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={
              'text-[10px] px-2 py-1 rounded border transition-colors ' +
              (value === opt.value
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500')
            }
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
