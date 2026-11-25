'use client'
import { useState } from 'react'
import type { Model3DData } from '@/lib/model3d/types'
import type { ModelInventory } from '@/lib/model3d/content/types'
import type { ModelSelection, ModelWorldMeasurement } from '@/lib/model3d/inspection/types'
import { PRIMITIVE_SELECTION_INSTANCE } from '@/lib/model3d/modeling/poly/primitiveSource'
import { calibrateModelInstance, formatModelLength, fromModelMeters, modelMeasurement, toModelMeters } from '@/lib/model3d/measurement/modelMeasurement'
import { ModelNumber } from './ModelNumber'

/** Show evaluated world AABB dimensions. Imported geometry stays labelled as
 * normalized until an explicit, revision-bound instance calibration is saved. */
export function ModelWorldDimensions({ data, selection, measurement, inventory, onChange }: {
  data: Model3DData; selection?: ModelSelection; measurement: ModelWorldMeasurement | null; inventory?: ModelInventory; onChange(next: Model3DData): void
}) {
  const [axis, setAxis] = useState<'width' | 'length' | 'height'>('width')
  const [knownMeters, setKnownMeters] = useState(1)
  const [error, setError] = useState<string | null>(null)
  if (!selection || !measurement) return null
  const settings = modelMeasurement(data), primitive = selection.instanceId === PRIMITIVE_SELECTION_INSTANCE
  const calibrated = primitive || !!data.content?.instances[selection.instanceId]?.calibration
  const display = (value: number) => calibrated ? formatModelLength(value, settings) : `${Number(value.toFixed(4))} normalized`
  const bounds = measurement.selected, instanceBounds = measurement.instance
  const apply = () => {
    if (!inventory || !instanceBounds) return
    try {
      onChange(calibrateModelInstance(data, inventory, selection.instanceId, instanceBounds[axis], knownMeters))
      setError(null)
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
  }
  return <section aria-label="World dimensions" className="border-t border-gray-700 pt-3 text-xs space-y-2">
    <h3 className="font-semibold text-cyan-300">World dimensions</h3>
    <dl className="grid grid-cols-2 gap-x-2 gap-y-1"><dt>Width · X</dt><dd>{display(bounds.width)}</dd>
      <dt>Length · Z</dt><dd>{display(bounds.length)}</dd><dt>Height · Y</dt><dd>{display(bounds.height)}</dd></dl>
    <p className="text-slate-400">Measured after object and scene transforms. Read only.</p>
    {!primitive && <div className="space-y-2 border-t border-gray-700 pt-2">
      <p className={calibrated ? 'text-slate-400' : 'text-amber-300'}>{calibrated ? 'Instance calibrated from a known length.' : 'Imported model scale is not calibrated.'}</p>
      <label className="flex items-center justify-between gap-2">Known instance axis
        <select aria-label="Calibration axis" className="rounded border border-gray-600 bg-gray-800 px-2 py-1" value={axis} onChange={event => setAxis(event.target.value as typeof axis)}>
          <option value="width">Width · X</option><option value="length">Length · Z</option><option value="height">Height · Y</option>
        </select>
      </label>
      <ModelNumber key={`${settings.unit}-${settings.pixelsPerInch}`} label={`Known length (${settings.unit})`} value={fromModelMeters(knownMeters, settings)}
        min={fromModelMeters(.000001, settings)} onChange={value => setKnownMeters(toModelMeters(value, settings))} />
      <button type="button" disabled={!inventory || !instanceBounds || instanceBounds[axis] <= 1e-9} className="rounded border border-gray-600 bg-gray-800 px-2 py-1 disabled:opacity-50" onClick={apply}>{calibrated ? 'Update calibration' : 'Calibrate instance'}</button>
      {error && <p role="alert" className="text-red-300">{error}</p>}
    </div>}
  </section>
}
