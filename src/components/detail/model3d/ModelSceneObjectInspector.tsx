'use client'
import type { Model3DData } from '@/lib/model3d/types'
import { fromModelMeters, modelMeasurement, toModelMeters } from '@/lib/model3d/measurement/modelMeasurement'
import { updateSceneObject, type ModelSceneObject, type ScenePoint } from '@/lib/model3d/source/modelSceneObjects'
import { ModelNumber } from './ModelNumber'

/** Properties for a selected authored camera or light. Coordinates are world
 * metres in source and displayed in the scene's chosen measurement unit. */
export function ModelSceneObjectInspector({ data, object, onChange }: {
  data: Model3DData; object: ModelSceneObject; onChange(next: Model3DData): void
}) {
  const settings = modelMeasurement(data)
  const change = (patch: Partial<ModelSceneObject>) => onChange(updateSceneObject(data, object.id, current => ({ ...current, ...patch } as ModelSceneObject)))
  const point = (field: 'position' | 'target', value: ScenePoint) => <fieldset className="space-y-1 border-t border-slate-700 pt-2">
    <legend className="font-medium text-slate-200">{field === 'position' ? 'Position' : 'Target'} · {settings.unit}</legend>
    {(['x', 'y', 'z'] as const).map(axis => <ModelNumber key={`${field}-${axis}-${settings.unit}`} label={axis.toUpperCase()}
      value={fromModelMeters(value[axis], settings)} min={fromModelMeters(-1e5, settings)} max={fromModelMeters(1e5, settings)}
      onChange={number => change({ [field]: { ...value, [axis]: toModelMeters(number, settings) } })} />)}
  </fieldset>
  return <section aria-label={`${object.kind} properties`} className="space-y-2 border-t border-slate-700 pt-3 text-xs text-slate-300">
    <h3 className="font-semibold text-cyan-300">{object.name}</h3>
    {object.kind === 'camera' ? <>
      <label className="block space-y-1"><span>Projection</span><select aria-label="Camera projection" value={object.projection}
        onChange={event => change({ projection: event.target.value as 'perspective' | 'orthographic' })}
        className="w-full rounded border border-slate-600 bg-slate-800 p-1.5 text-slate-100">
        <option value="perspective">Perspective</option><option value="orthographic">Orthographic</option></select></label>
      {point('position', object.position)}{point('target', object.target)}
      <ModelNumber label="Roll (deg)" value={object.roll} min={-180} max={180} onChange={roll => change({ roll })} />
      {object.projection === 'perspective' ? <ModelNumber label="Field of view (deg)" value={object.fov} min={5} max={150} onChange={fov => change({ fov })} />
        : <ModelNumber label={`Orthographic height (${settings.unit})`} value={fromModelMeters(object.orthoHeight, settings)}
          min={fromModelMeters(.001, settings)} max={fromModelMeters(1e5, settings)} onChange={value => change({ orthoHeight: toModelMeters(value, settings) })} />}
      <button type="button" disabled={data.sceneObjects?.activeCameraId === object.id}
        onClick={() => onChange({ ...data, sceneObjects: { ...data.sceneObjects!, activeCameraId: object.id } })}
        className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-left hover:bg-slate-700 disabled:opacity-50">
        {data.sceneObjects?.activeCameraId === object.id ? 'Active render camera' : 'Set as render camera'}</button>
    </> : <>
      <label className="block space-y-1"><span>Light type</span><select aria-label="Light type" value={object.lightType}
        onChange={event => change({ lightType: event.target.value as 'directional' | 'point' | 'spot' })}
        className="w-full rounded border border-slate-600 bg-slate-800 p-1.5 text-slate-100">
        <option value="directional">Directional</option><option value="point">Point</option><option value="spot">Spot</option></select></label>
      {point('position', object.position)}{object.lightType !== 'point' && point('target', object.target)}
      <label className="flex items-center gap-2">Color <input type="color" aria-label="Light color" value={object.color} onChange={event => change({ color: event.target.value })} /></label>
      <ModelNumber label="Intensity" value={object.intensity} min={0} max={1e5} onChange={intensity => change({ intensity })} />
      <label className="flex items-center gap-2"><input type="checkbox" checked={object.shadows} onChange={event => change({ shadows: event.target.checked })} />Cast shadows</label>
    </>}
  </section>
}
