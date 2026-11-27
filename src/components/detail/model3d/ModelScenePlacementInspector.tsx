'use client'
import type { Model3DData } from '@/lib/model3d/types'
import { fromModelMeters, modelMeasurement, toModelMeters } from '@/lib/model3d/measurement/modelMeasurement'
import { ModelNumber } from './ModelNumber'

/** Edit scene placement with linear coordinates in the active physical unit.
 * Rotation and uniform scale keep their original degree/unitless contracts. */
export function ModelScenePlacementInspector({ data, onChange }: { data: Model3DData; onChange(next: Model3DData): void }) {
  const settings = modelMeasurement(data)
  return <section aria-label="3D scene placement" className="space-y-2 text-xs">
    <h3 className="font-semibold text-cyan-300">3D scene placement</h3>
    {(['x', 'y', 'z'] as const).map(axis => <ModelNumber key={`${axis}-${settings.unit}-${settings.pixelsPerInch}`} label={`Position ${axis.toUpperCase()} (${settings.unit})`}
      keyPath={`model3d.position.${axis}`} value={fromModelMeters(data.position[axis], settings)} min={fromModelMeters(-1e6, settings)} max={fromModelMeters(1e6, settings)}
      onChange={value => onChange({ ...data, position: { ...data.position, [axis]: toModelMeters(value, settings) } })} />)}
    {(['x', 'y', 'z'] as const).map(axis => <ModelNumber key={axis} keyPath={`model3d.rotation.${axis}`} label={`Rotation ${axis.toUpperCase()} (deg)`} value={data.rotation[axis]} min={-1e6} max={1e6}
      onChange={value => onChange({ ...data, rotation: { ...data.rotation, [axis]: value } })} />)}
    <ModelNumber label="3D scale" keyPath="model3d.scale" value={data.scale} min={.001} max={1000} onChange={value => onChange({ ...data, scale: value })} />
  </section>
}
