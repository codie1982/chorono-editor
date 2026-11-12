import type { Layer } from '@/lib/types'
import type { ArraySettings } from '@/lib/array/ArrayTypes'
import { ArrayCheck, ArrayNumber, ArraySection, ArrayVector } from './ArrayFields'

/** Discriminated pattern forms. They edit numeric settings only; all coordinate
 * conversions, count policy and placement validation remain in the domain plan. */
export function ArrayPatternFields({ settings, setSettings, paths }: { settings: ArraySettings; setSettings: (settings: ArraySettings) => void; paths: readonly Layer[] }) {
  if (settings.pattern === 'linear') return <ArraySection title="Linear">
    <ArrayNumber label="Count" value={settings.count} onChange={count => setSettings({ ...settings, count })} step={1} />
    <ArrayVector label="Move" value={settings.move} onChange={move => setSettings({ ...settings, move })} />
    <ArrayNumber label="Rotation degrees" value={settings.rotationDeg} onChange={rotationDeg => setSettings({ ...settings, rotationDeg })} />
    <ArrayVector label="Scale" value={settings.scale} onChange={scale => setSettings({ ...settings, scale })} />
  </ArraySection>
  if (settings.pattern === 'grid') return <ArraySection title="Grid">
    <div className="grid grid-cols-2 gap-2"><ArrayNumber label="Columns" value={settings.columns} onChange={columns => setSettings({ ...settings, columns })} step={1} />
      <ArrayNumber label="Rows" value={settings.rows} onChange={rows => setSettings({ ...settings, rows })} step={1} /></div>
    <ArrayVector label="Column move" value={settings.columnMove} onChange={columnMove => setSettings({ ...settings, columnMove })} />
    <ArrayVector label="Row move" value={settings.rowMove} onChange={rowMove => setSettings({ ...settings, rowMove })} />
    <ArrayCheck label="Stagger rows" checked={settings.stagger?.enabled ?? false} onChange={enabled => setSettings({ ...settings,
      stagger: enabled ? { enabled: true, mode: 'odd-rows', offset: { x: 0, y: 0 } } : undefined })} />
    {settings.stagger?.enabled && <><label className="my-2 block text-xs">Row parity<select aria-label="Array Row parity" value={settings.stagger.mode}
      onChange={event => setSettings({ ...settings, stagger: { ...settings.stagger!, mode: event.target.value as 'odd-rows' | 'even-rows' } })}
      className="ml-2 rounded border border-slate-600 bg-slate-950 p-1"><option value="odd-rows">Odd rows</option><option value="even-rows">Even rows</option></select></label>
      <ArrayVector label="Stagger offset" value={settings.stagger.offset} onChange={offset => setSettings({ ...settings, stagger: { ...settings.stagger!, offset } })} /></>}
  </ArraySection>
  if (settings.pattern === 'radial') return <ArraySection title="Radial">
    <ArrayNumber label="Count" value={settings.count} onChange={count => setSettings({ ...settings, count })} step={1} />
    <ArrayNumber label="Radius" value={settings.radius} onChange={radius => setSettings({ ...settings, radius })} />
    <ArrayVector label="Center" value={settings.center} onChange={center => setSettings({ ...settings, center })} />
    <ArrayNumber label="Start angle degrees" value={settings.startAngleDeg} onChange={startAngleDeg => setSettings({ ...settings, startAngleDeg })} />
    <ArrayNumber label="Total angle degrees" value={settings.totalAngleDeg} onChange={totalAngleDeg => setSettings({ ...settings, totalAngleDeg })} />
    <ArrayCheck label="Closed circle" checked={settings.closed} onChange={closed => setSettings({ ...settings, closed })} />
    <ArrayCheck label="Orient to angle" checked={settings.orientToAngle} onChange={orientToAngle => setSettings({ ...settings, orientToAngle })} />
    <ArrayNumber label="Rotation offset degrees" value={settings.rotationOffsetDeg} onChange={rotationOffsetDeg => setSettings({ ...settings, rotationOffsetDeg })} />
  </ArraySection>
  return <ArraySection title="Path">
    <label className="mb-2 block text-xs">Target path<select aria-label="Array Target path" value={settings.pathLayerId}
      onChange={event => setSettings({ ...settings, pathLayerId: event.target.value })} className="mt-1 w-full rounded border border-slate-600 bg-slate-950 p-2">
      <option value="">Choose a path…</option>{paths.map(path => <option key={path.id} value={path.id}>{path.name}</option>)}</select></label>
    <ArrayNumber label="Count" value={settings.count} onChange={count => setSettings({ ...settings, count })} step={1} />
    <ArrayNumber label="Start offset pixels" value={settings.startOffset} onChange={startOffset => setSettings({ ...settings, startOffset })} />
    <ArrayNumber label="End offset pixels" value={settings.endOffset} onChange={endOffset => setSettings({ ...settings, endOffset })} />
    <ArrayNumber label="Normal offset" value={settings.normalOffset} onChange={normalOffset => setSettings({ ...settings, normalOffset })} />
    <ArrayCheck label="Align to tangent" checked={settings.alignToTangent} onChange={alignToTangent => setSettings({ ...settings, alignToTangent })} />
    <ArrayCheck label="Reverse path" checked={settings.reverse} onChange={reverse => setSettings({ ...settings, reverse })} />
  </ArraySection>
}
