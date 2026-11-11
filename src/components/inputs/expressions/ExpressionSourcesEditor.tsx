'use client'
import { useState } from 'react'
import type { ChronoScene, ParameterRef } from '@/lib/types'
import SourceParameterPicker from '@/components/wiring/SourceParameterPicker'
import { formatParameterRef } from '@/lib/wiring/helpers'

/** Named scalar inputs reuse the existing stable-reference picker. Local
 * drafts alone change; Apply owns source validation and persistence. The picker
 * is mounted only for the actively edited row and releases on close/removal. */
export function ExpressionSourcesEditor({ scene, sources, onChange }: { scene: ChronoScene; sources: Record<string, ParameterRef>; onChange(value: Record<string, ParameterRef>): void }) {
  const [editing, setEditing] = useState<string | null>(null), [name, setName] = useState(() => unusedInputName(sources))
  return <fieldset className="mt-3 rounded border border-gray-700 p-2 text-xs">
    <legend className="px-1 text-gray-300">Named sources</legend>
    {Object.entries(sources).map(([key, ref]) => <div key={key} className="my-1 flex items-center gap-2">
      <code>{key}</code><button type="button" onClick={() => setEditing(key)} className="min-w-0 flex-1 truncate text-left text-sky-300" title={formatParameterRef(ref, scene)}>{formatParameterRef(ref, scene)}</button>
      <button type="button" aria-label={'Remove source ' + key} onClick={() => { const next = { ...sources }; delete next[key]; onChange(next); if (editing === key) setEditing(null) }}>Remove</button>
    </div>)}
    <div className="mt-2 flex gap-2"><input aria-label="Source variable name" value={name} maxLength={48} onChange={event => setName(event.target.value)} className="min-w-0 flex-1 rounded border border-gray-600 bg-gray-950 p-1" />
      <button type="button" disabled={!name || Object.keys(sources).length >= 16 || Object.prototype.hasOwnProperty.call(sources, name)} onClick={() => setEditing(name)} className="rounded bg-gray-700 px-2 disabled:opacity-40">Choose source</button></div>
    {editing && <div className="mt-2"><SourceParameterPicker scene={scene} value={sources[editing] ?? null} expectedType="number" onChange={ref => { const next = { ...sources, [editing]: ref }; onChange(next); setEditing(null); setName(unusedInputName(next)) }} />
      <button type="button" onClick={() => setEditing(null)} className="mt-1 underline">Close source picker</button></div>}
  </fieldset>
}

/** Suggest an unused bounded input variable, including after removing a row. */
function unusedInputName(sources: Record<string, ParameterRef>): string {
  for (let index = 1; index <= 17; index++) if (!Object.prototype.hasOwnProperty.call(sources, 'input' + index)) return 'input' + index
  return ''
}
