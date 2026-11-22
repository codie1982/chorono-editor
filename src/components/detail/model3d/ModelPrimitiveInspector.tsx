'use client'
import { useEffect, useState } from 'react'
import type { Model3DData } from '@/lib/model3d/types'
import type { PrimitiveObject } from '@/lib/model3d/modeling/poly/primitiveSource'
import { updatePrimitive } from '@/lib/model3d/modeling/poly/primitiveSource'
import { ModelNumber } from './ModelNumber'
import { ModelKeyButton } from './ModelAnimationKeyContext'
import { fromModelMeters, modelMeasurement, toModelMeters } from '@/lib/model3d/measurement/modelMeasurement'
import { primitiveSurfaceDefaults } from '@/lib/model3d/material/pbrSurface'
import { ModelMaterialPanel } from './ModelMaterialPanel'

/** Typed polygon primitive controls. All edits replace one serializable object
 * and pass through the host's validation and local history. Transient name
 * typing remains local until blur/Enter to avoid one Undo per keystroke. */
export function ModelPrimitiveInspector({ data, object, onChange, workspace = 'modeling' }: { data: Model3DData; object: PrimitiveObject; onChange(data: Model3DData): void; workspace?: 'modeling' | 'material' }) {
  const [name, setName] = useState(object.name)
  useEffect(() => setName(object.name), [object.id, object.name])
  const change = (update: (value: PrimitiveObject) => PrimitiveObject) => onChange(updatePrimitive(data, object.id, update))
  const settings = modelMeasurement(data)
  const keyRoot = `model3d.modeling.objectsById.${object.id}`
  const channelFor = (label: string) => {
    if (label === 'Scale') return `${keyRoot}.scale`
    if (label.startsWith('Width')) return `${keyRoot}.geometry.width`
    if (label.startsWith('Height')) return `${keyRoot}.geometry.height`
    if (label.startsWith('Length')) return `${keyRoot}.geometry.depth`
    if (label === 'Radius') return `${keyRoot}.geometry.radius`
    const match = label.match(/^(position|rotation) ([XYZ])$/)
    return match ? `${keyRoot}.${match[1]}.${match[2].toLowerCase()}` : undefined
  }
  const number = (label: string, value: number, update: (next: number) => PrimitiveObject, min?: number, max?: number) =>
    <ModelNumber key={label} keyPath={channelFor(label)} label={label} value={value} min={min} max={max} onChange={next => change(() => update(next))} />
  const length = (label: string, meters: number, update: (nextMeters: number) => PrimitiveObject, min?: number, max?: number) =>
    <ModelNumber key={`${label}-${settings.unit}-${settings.pixelsPerInch}`} keyPath={channelFor(label)} label={`${label} (${settings.unit})`} value={fromModelMeters(meters, settings)}
      min={min === undefined ? undefined : fromModelMeters(min, settings)} max={max === undefined ? undefined : fromModelMeters(max, settings)}
      onChange={value => change(() => update(toModelMeters(value, settings)))} />
  const geometry = object.geometry
  const color = <label className="flex items-center justify-between gap-2 border-t border-gray-700 pt-2">Color
    <ModelKeyButton path={`${keyRoot}.color`} />
    <input aria-label="Primitive color" type="color" value={object.color} onChange={event => change(value => ({ ...value, color: event.target.value }))} />
  </label>
  if (workspace === 'material') return <ModelMaterialPanel title={object.name}
    surface={{ ...primitiveSurfaceDefaults, doubleSided: object.geometry.kind === 'plane', ...object.material, color: object.color }} keyRoot={keyRoot}
    onChange={patch => change(value => {
      const { color: nextColor, ...material } = patch
      return { ...value, color: nextColor ?? value.color, material: { ...value.material, ...material } }
    })} />
  return <section className="space-y-3 text-xs" aria-label="Primitive properties">
    <h3 className="text-cyan-300">{geometry.kind[0].toUpperCase() + geometry.kind.slice(1)} · primitive</h3>
    <label className="flex items-center justify-between gap-2">Name
      <input aria-label="Primitive name" className="w-28 min-w-0 rounded border border-gray-600 bg-gray-800 px-2 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
        maxLength={80} value={name} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
        onBlur={() => { const next = name.trim(); if (next && next !== object.name) change(value => ({ ...value, name: next })); else setName(object.name) }} />
    </label>
    <div className="flex items-center gap-2"><label className="flex items-center gap-2"><input type="checkbox" checked={object.visible !== false}
      onChange={event => change(value => ({ ...value, visible: event.target.checked }))} />Visible</label><ModelKeyButton path={`${keyRoot}.visible`} /></div>
    <fieldset className="space-y-2 border-t border-gray-700 pt-2"><legend>Geometry · {settings.unit}</legend>
      {geometry.kind === 'box' ? <>
        {length('Width (X)', geometry.width, next => ({ ...object, geometry: { ...geometry, width: next } }), .001, 1000)}
        {length('Height (Y)', geometry.height, next => ({ ...object, geometry: { ...geometry, height: next } }), .001, 1000)}
        {length('Length (Z)', geometry.depth, next => ({ ...object, geometry: { ...geometry, depth: next } }), .001, 1000)}
      </> : geometry.kind === 'plane' ? <>
        {length('Width (X)', geometry.width, next => ({ ...object, geometry: { ...geometry, width: next } }), .001, 1000)}
        {length('Length (Z)', geometry.depth, next => ({ ...object, geometry: { ...geometry, depth: next } }), .001, 1000)}
      </> : <>
        {length('Radius', geometry.radius, next => ({ ...object, geometry: { ...geometry, radius: next } }), .001, 500)}
        {geometry.kind !== 'sphere' && length('Height (Y)', geometry.height, next => ({ ...object, geometry: { ...geometry, height: next } }), .001, 1000)}
      </>}
    </fieldset>
    {(['position', 'rotation'] as const).map(field => <fieldset key={field} className="space-y-2 border-t border-gray-700 pt-2">
      <legend>{field === 'rotation' ? 'Rotation · degrees' : `Position · ${settings.unit}`}</legend>
      {(['x', 'y', 'z'] as const).map(axis => field === 'position'
        ? length(`${field} ${axis.toUpperCase()}`, object[field][axis], next => ({ ...object, [field]: { ...object[field], [axis]: next } }), -1e5, 1e5)
        : number(`${field} ${axis.toUpperCase()}`, object[field][axis], next => ({ ...object, [field]: { ...object[field], [axis]: next } }), -1e5, 1e5))}
    </fieldset>)}
    {number('Scale', object.scale, next => ({ ...object, scale: next }), .001, 1000)}
    {color}
  </section>
}
