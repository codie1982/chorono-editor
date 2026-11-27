'use client'

import { useEffect, useMemo, useState } from 'react'
import type {
  FractureBondDamageReset,
  FractureBondForcedBreak,
  FractureBondGraph,
  FractureBondOverride,
} from '@/lib/types/fractureCluster'
import { inputClass, labelClass, PhysicsNumberField } from './PhysicsFormControls'

interface Props {
  readonly graph?: FractureBondGraph
  readonly selectedBondId: string | null
  readonly currentTimeMs: number
  readonly startTimeMs: number
  readonly durationMs: number
  readonly stepHz: number
  readonly overrides: readonly FractureBondOverride[]
  readonly forcedBreaks: readonly FractureBondForcedBreak[]
  readonly damageResets: readonly FractureBondDamageReset[]
  onSelectBond(bondId: string): void
  onOverrides(value: readonly FractureBondOverride[]): void
  onForcedBreaks(value: readonly FractureBondForcedBreak[]): void
  onDamageResets(value: readonly FractureBondDamageReset[]): void
}

/**
 * Edits one persisted bond graph as a Re-bake draft.
 *
 * Pair grouping/splitting becomes canonical graph overrides. Forced breaks and
 * damage resets are fixed-tick authoring schedules. No scene mutation occurs
 * here; replacement Apply remains the single undoable command.
 */
export default function FractureBondAuthoringControls(props: Props) {
  const { graph } = props
  const [fragmentAId, setFragmentAId] = useState('')
  const [fragmentBId, setFragmentBId] = useState('')
  useEffect(() => {
    if (!graph) return
    setFragmentAId(current => graph.fragmentIds.includes(current) ? current : graph.fragmentIds[0] ?? '')
    setFragmentBId(current => graph.fragmentIds.includes(current) && current !== graph.fragmentIds[0]
      ? current : graph.fragmentIds[1] ?? '')
  }, [graph])
  const selected = graph?.bonds.find(bond => bond.bondId === props.selectedBondId)
    ?? graph?.bonds[0]
  useEffect(() => {
    if (selected && selected.bondId !== props.selectedBondId) props.onSelectBond(selected.bondId)
  }, [props.onSelectBond, props.selectedBondId, selected])
  const selectedOverride = selected && findOverride(props.overrides, selected.fragmentAId, selected.fragmentBId)
  const actionTimeMs = useMemo(() => alignedLocalTime(props.currentTimeMs, props.startTimeMs,
    props.durationMs, props.stepHz), [props.currentTimeMs, props.durationMs, props.startTimeMs, props.stepHz])

  if (!graph) return <p className="text-xs leading-5 text-cyan-300/80">
    Apply a bonded bake, then choose Re-bake to edit generated pairs, schedule breaks or reset damage.
  </p>
  if (!selected) return <p className="text-xs leading-5 text-amber-300">This graph has no editable bonds.</p>

  const patchSelected = (patch: Partial<FractureBondOverride>) => props.onOverrides(upsertOverride(
    props.overrides,
    selected.fragmentAId,
    selected.fragmentBId,
    { mode: selected.origin === 'manual' ? 'manual' : 'auto', ...selectedOverride, ...patch },
  ))
  const groupPair = () => {
    if (!fragmentAId || !fragmentBId || fragmentAId === fragmentBId) return
    const existing = graph.bonds.find(bond => samePair(bond, fragmentAId, fragmentBId))
    props.onOverrides(upsertOverride(props.overrides, fragmentAId, fragmentBId, {
      mode: existing?.origin === 'sharedBoundary' ? 'auto' : 'manual',
    }))
  }
  const splitSelected = () => props.onOverrides(selected.origin === 'manual'
    ? removeOverride(props.overrides, selected.fragmentAId, selected.fragmentBId)
    : upsertOverride(props.overrides, selected.fragmentAId, selected.fragmentBId, { mode: 'disabled' }))
  const forceBreak = () => props.onForcedBreaks(canonicalActions([
    ...props.forcedBreaks.filter(action => action.bondId !== selected.bondId || action.timeMs !== actionTimeMs),
    { bondId: selected.bondId, timeMs: actionTimeMs, source: 'user' },
  ]))
  const resetDamage = (bondId?: string) => props.onDamageResets(canonicalActions([
    ...props.damageResets.filter(action => action.bondId !== bondId || action.timeMs !== actionTimeMs),
    { ...(bondId ? { bondId } : {}), timeMs: actionTimeMs, source: 'user' },
  ]))

  return <div className="space-y-3 border-t border-cyan-900/70 pt-3" aria-label="Bond authoring">
    <label className={labelClass}>Selected bond
      <select aria-label="Selected fracture bond" value={selected.bondId}
        onChange={event => props.onSelectBond(event.target.value)} className={`${inputClass} font-mono`}>
        {graph.bonds.map(bond => <option key={bond.bondId} value={bond.bondId}>
          {shortId(bond.fragmentAId)} ↔ {shortId(bond.fragmentBId)}{bond.unbreakable ? ' · locked' : ''}
        </option>)}
      </select>
    </label>
    <div className="grid grid-cols-2 gap-2">
      <PhysicsNumberField label="Bond strength" unit="solver load"
        value={selectedOverride?.impulseStrength ?? selected.impulseStrength} min={0.000001}
        onChange={value => patchSelected({ impulseStrength: value })} />
      <PhysicsNumberField label="Damage threshold" unit="accumulated"
        value={selectedOverride?.damageThreshold ?? selected.damageThreshold} min={0.000001}
        onChange={value => patchSelected({ damageThreshold: value })} />
    </div>
    <label className="flex min-h-11 items-center gap-2 rounded border border-cyan-900/70 px-2 py-2 text-xs text-cyan-100">
      <input type="checkbox" checked={selectedOverride?.unbreakable ?? selected.unbreakable}
        onChange={event => patchSelected({ unbreakable: event.target.checked })} className="size-4 accent-violet-500" />
      Unbreakable under contact load
    </label>
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={splitSelected} className={secondaryButton}>Split cluster</button>
      <button type="button" onClick={forceBreak} className={secondaryButton}>Break at playhead</button>
      <button type="button" onClick={() => resetDamage(selected.bondId)} className={secondaryButton}>Reset bond damage</button>
      <button type="button" onClick={() => resetDamage()} className={secondaryButton}>Reset all damage</button>
    </div>
    <p className="text-[10px] leading-4 text-cyan-300/80">Action tick · {format(actionTimeMs)} ms local. Forced break overrides Unbreakable; reset runs before load on that tick.</p>
    <div className="grid grid-cols-2 gap-2">
      <label className={labelClass}>Fragment A
        <select aria-label="Cluster fragment A" value={fragmentAId} onChange={event => setFragmentAId(event.target.value)} className={`${inputClass} font-mono`}>
          {graph.fragmentIds.map(id => <option key={id} value={id}>{shortId(id)}</option>)}
        </select>
      </label>
      <label className={labelClass}>Fragment B
        <select aria-label="Cluster fragment B" value={fragmentBId} onChange={event => setFragmentBId(event.target.value)} className={`${inputClass} font-mono`}>
          {graph.fragmentIds.map(id => <option key={id} value={id}>{shortId(id)}</option>)}
        </select>
      </label>
    </div>
    <button type="button" disabled={!fragmentAId || !fragmentBId || fragmentAId === fragmentBId}
      onClick={groupPair} className={`${primaryButton} w-full`}>Group selected fragments</button>
    {(props.forcedBreaks.length > 0 || props.damageResets.length > 0) && <div className="rounded border border-cyan-900/70 p-2 text-[10px] leading-4 text-cyan-200">
      {props.forcedBreaks.length} forced break{props.forcedBreaks.length === 1 ? '' : 's'} · {props.damageResets.length} damage reset{props.damageResets.length === 1 ? '' : 's'}
      <button type="button" onClick={() => { props.onForcedBreaks([]); props.onDamageResets([]) }}
        className="mt-2 block min-h-11 w-full rounded border border-cyan-800 px-2 text-cyan-100 hover:bg-cyan-950">Clear scheduled actions</button>
    </div>}
  </div>
}

function upsertOverride(
  values: readonly FractureBondOverride[],
  a: string,
  b: string,
  value: Omit<FractureBondOverride, 'fragmentAId' | 'fragmentBId'>,
): FractureBondOverride[] {
  const [fragmentAId, fragmentBId] = [a, b].sort()
  return [...values.filter(item => !samePair(item, a, b)), { fragmentAId, fragmentBId, ...value }]
    .sort((left, right) => left.fragmentAId.localeCompare(right.fragmentAId)
      || left.fragmentBId.localeCompare(right.fragmentBId))
}

function removeOverride(values: readonly FractureBondOverride[], a: string, b: string): FractureBondOverride[] {
  return values.filter(item => !samePair(item, a, b))
}

function findOverride(values: readonly FractureBondOverride[], a: string, b: string): FractureBondOverride | undefined {
  return values.find(item => samePair(item, a, b))
}

function samePair(value: { fragmentAId: string; fragmentBId: string }, a: string, b: string): boolean {
  return (value.fragmentAId === a && value.fragmentBId === b)
    || (value.fragmentAId === b && value.fragmentBId === a)
}

function alignedLocalTime(currentTimeMs: number, startTimeMs: number, durationMs: number, stepHz: number): number {
  const totalTicks = Math.round(durationMs * stepHz / 1000)
  const tick = Math.min(totalTicks - 1, Math.max(1, Math.round((currentTimeMs - startTimeMs) * stepHz / 1000)))
  return tick * 1000 / stepHz
}

function canonicalActions<T extends { timeMs: number; bondId?: string; source: string }>(values: readonly T[]): T[] {
  return [...values].sort((left, right) => left.timeMs - right.timeMs
    || (left.bondId ?? '').localeCompare(right.bondId ?? '') || left.source.localeCompare(right.source))
}

function shortId(value: string): string {
  return value.length > 26 ? `…${value.slice(-25)}` : value
}

function format(value: number): string {
  return Number(value.toFixed(3)).toString()
}

const secondaryButton = 'min-h-11 rounded border border-cyan-800 px-2 py-2 text-[10px] text-cyan-100 hover:bg-cyan-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400'
const primaryButton = 'min-h-11 rounded bg-cyan-700 px-3 py-2 text-[10px] font-medium text-white hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300'
