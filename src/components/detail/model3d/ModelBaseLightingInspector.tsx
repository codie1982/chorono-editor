'use client'
import type { Model3DData } from '@/lib/model3d/types'
import { ModelNumber } from './ModelNumber'

/** Exposes the always-present scene lighting source to private 3D clips.
 * Intensities are unitless and validated by the model channel contract. */
export function ModelBaseLightingInspector({ data, onChange }: { data: Model3DData; onChange(data: Model3DData): void }) {
  return <section aria-label="3D base lighting" className="space-y-2 border-t border-slate-700 pt-3 text-xs">
    <h3 className="font-semibold text-cyan-300">Base lighting</h3>
    <ModelNumber label="Ambient intensity" keyPath="model3d.lighting.ambient" value={data.lighting.ambient} min={0} max={20}
      onChange={ambient => onChange({ ...data, lighting: { ...data.lighting, ambient } })} />
    <ModelNumber label="Key intensity" keyPath="model3d.lighting.key" value={data.lighting.key} min={0} max={20}
      onChange={key => onChange({ ...data, lighting: { ...data.lighting, key } })} />
  </section>
}
