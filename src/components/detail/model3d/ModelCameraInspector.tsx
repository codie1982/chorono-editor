'use client'
import type { Model3DData } from '@/lib/model3d/types'
import { fromModelMeters, modelMeasurement, toModelMeters } from '@/lib/model3d/measurement/modelMeasurement'
import { ModelNumber } from './ModelNumber'

/** Edit the legacy fallback view for scenes without authored cameras. Linear
 * distance/target fields use the display unit; angles remain degrees. */
export function ModelCameraInspector({ data, onChange }: { data: Model3DData; onChange(next: Model3DData): void }) {
  const settings = modelMeasurement(data), camera = data.camera
  const angle = (field: 'yaw' | 'pitch' | 'roll' | 'fov', label: string, min: number, max: number) =>
    <ModelNumber key={field} keyPath={`model3d.camera.${field}`} label={label} value={camera[field] ?? 0} min={min} max={max}
      onChange={value => onChange({ ...data, camera: { ...camera, [field]: value } })} />
  const length = (field: 'distance' | 'targetX' | 'targetY' | 'targetZ', label: string, min: number, max: number) =>
    <ModelNumber key={`${field}-${settings.unit}-${settings.pixelsPerInch}`} keyPath={`model3d.camera.${field}`} label={`${label} (${settings.unit})`} value={fromModelMeters(camera[field], settings)}
      min={fromModelMeters(min, settings)} max={fromModelMeters(max, settings)}
      onChange={value => onChange({ ...data, camera: { ...camera, [field]: toModelMeters(value, settings) } })} />
  return <section aria-label="Legacy 3D camera" className="space-y-2 border-t border-gray-700 pt-3 text-xs">
    <h3 className="font-semibold text-cyan-300">Legacy camera view</h3>
    <p className="text-slate-400">Add a scene Camera to choose the render view.</p>
    {angle('yaw', 'Orbit yaw (deg)', -1e6, 1e6)}
    {angle('pitch', 'Orbit pitch (deg)', -90, 90)}
    {angle('roll', 'Roll (deg)', -180, 180)}
    {length('distance', 'Distance', .1, 1000)}
    {angle('fov', 'Field of view (deg)', 5, 150)}
    {length('targetX', 'Target X', -1e6, 1e6)}
    {length('targetY', 'Target Y', -1e6, 1e6)}
    {length('targetZ', 'Target Z', -1e6, 1e6)}
  </section>
}
