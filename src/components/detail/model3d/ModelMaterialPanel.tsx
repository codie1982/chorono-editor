'use client'
import type { PbrSurface } from '@/lib/model3d/material/pbrSurface'
import type { ModelMaterial } from '@/lib/model3d/content/types'
import { ModelNumber } from './ModelNumber'
import { ModelKeyButton } from './ModelAnimationKeyContext'

const textureSlots = [
  ['map', 'Base color', 'srgb'], ['normalMap', 'Normal', 'linear'],
  ['roughnessMap', 'Roughness', 'linear'], ['metalnessMap', 'Metallic', 'linear'],
  ['aoMap', 'Occlusion', 'linear'], ['emissiveMap', 'Emission', 'srgb'],
] as const

/** Compact, keyboard-accessible dark inspector for the shared metallic/roughness
 * surface contract. The owner performs the actual source edit and Undo step;
 * this component never retains model or GPU state. Imported texture indices
 * remain bound to the exact asset revision and UVs supplied by glTF. */
export function ModelMaterialPanel({ title, surface, onChange, keyRoot, textures }: {
  title: string
  surface: PbrSurface & Partial<Pick<ModelMaterial, 'map' | 'normalMap' | 'roughnessMap' | 'metalnessMap' | 'aoMap' | 'emissiveMap'>>
  onChange(patch: Partial<ModelMaterial>): void
  keyRoot?: string
  textures?: { names: readonly string[]; colorSpaces: readonly ('srgb' | 'linear')[] }
}) {
  const update = (field: keyof ModelMaterial, value: number | string | boolean) => onChange({ [field]: value })
  const number = (field: 'roughness' | 'metalness' | 'opacity' | 'emissiveIntensity' | 'alphaCutoff' | 'normalStrength' | 'aoStrength', label: string, value: number, max: number, step = .05, disabled = false) =>
    <ModelNumber key={field} label={label} value={value} min={0} max={max} step={step} disabled={disabled}
      keyPath={keyRoot && ['roughness', 'metalness', 'opacity'].includes(field) ? `${keyRoot}.${field}` : undefined}
      onChange={next => update(field, next)} />
  const color = (field: 'color' | 'emissiveColor', label: string, value: string) =>
    <label className="flex min-h-9 items-center justify-between gap-2 text-slate-300">
      <span>{label}</span><span className="flex items-center gap-2">
        {field === 'color' && keyRoot && <ModelKeyButton path={`${keyRoot}.color`} />}
        <input type="color" aria-label={label} value={value} onChange={event => update(field, event.target.value)}
          className="h-7 w-12 cursor-pointer rounded border border-slate-600 bg-slate-800 p-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400" />
      </span>
    </label>
  return <section aria-label="PBR material" className="space-y-3 text-xs text-slate-300">
    <div className="flex items-center gap-3 rounded-lg border border-slate-700 bg-[#152133] p-3">
      <span aria-hidden="true" className="h-10 w-10 shrink-0 rounded-full border border-white/20 shadow-[inset_-8px_-8px_12px_#0006,0_2px_8px_#0005]" style={{ backgroundColor: surface.color }} />
      <span className="min-w-0"><strong className="block truncate text-sm font-medium text-slate-100">{title}</strong>
        <span className="text-[11px] text-slate-400">Metallic / roughness PBR</span></span>
    </div>
    <details open className="rounded-lg border border-slate-700 bg-[#101a2a] px-3 py-2">
      <summary className="cursor-pointer py-1 font-medium text-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">Surface</summary>
      <div className="space-y-2 border-t border-slate-700 pt-2">
        {color('color', 'Base color', surface.color)}
        {number('metalness', 'Metallic', surface.metalness, 1)}
        {number('roughness', 'Roughness', surface.roughness, 1)}
      </div>
    </details>
    <details className="rounded-lg border border-slate-700 bg-[#101a2a] px-3 py-2">
      <summary className="cursor-pointer py-1 font-medium text-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">Emission & lighting</summary>
      <div className="space-y-2 border-t border-slate-700 pt-2">
        {color('emissiveColor', 'Emission color', surface.emissiveColor ?? '#000000')}
        {number('emissiveIntensity', 'Emission strength', surface.emissiveIntensity ?? 1, 20)}
        {number('normalStrength', 'Normal strength', surface.normalStrength ?? 1, 4, .05, (surface.normalMap ?? -1) < 0)}
        {number('aoStrength', 'Occlusion strength', surface.aoStrength ?? 1, 4, .05, (surface.aoMap ?? -1) < 0)}
      </div>
    </details>
    <details className="rounded-lg border border-slate-700 bg-[#101a2a] px-3 py-2">
      <summary className="cursor-pointer py-1 font-medium text-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">Transparency & faces</summary>
      <div className="space-y-2 border-t border-slate-700 pt-2">
        <label className="flex items-center justify-between gap-2">Alpha mode
          <select aria-label="Alpha mode" value={surface.alphaMode === 'mask' ? 'mask' : surface.opacity < 1 ? 'blend' : surface.alphaMode ?? 'opaque'}
            onChange={event => onChange(event.target.value === 'opaque' ? { alphaMode: 'opaque', opacity: 1 } : { alphaMode: event.target.value as 'mask' | 'blend' })} className="w-32 rounded border border-slate-600 bg-slate-800 px-2 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">
            <option value="opaque">Opaque</option><option value="mask">Mask</option><option value="blend">Blend</option>
          </select>
        </label>
        {(surface.alphaMode === 'blend' || surface.opacity < 1) && number('opacity', 'Opacity', surface.opacity, 1)}
        {surface.alphaMode === 'mask' && number('alphaCutoff', 'Mask threshold', surface.alphaCutoff ?? .5, 1)}
        <label className="flex items-center gap-2"><input type="checkbox" checked={surface.doubleSided ?? false}
          onChange={event => update('doubleSided', event.target.checked)} className="accent-cyan-500" />Double sided</label>
      </div>
    </details>
    <details open className="rounded-lg border border-slate-700 bg-[#101a2a] px-3 py-2">
      <summary className="cursor-pointer py-1 font-medium text-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">Textures</summary>
      <div className="space-y-2 border-t border-slate-700 pt-2">
        {!textures ? <p className="text-slate-400">This primitive has no image texture asset. Surface factors above are available.</p>
          : textures.names.length === 0 ? <p className="text-slate-400">No embedded textures in this model.</p>
          : textureSlots.map(([slot, label, space]) => <label key={slot} className="block space-y-1">
              <span className="text-slate-400">{label} <span className="text-[10px] uppercase">{space}</span></span>
              <select aria-label={`${label} texture`} value={surface[slot] ?? -1} onChange={event => update(slot, Number(event.target.value))}
                className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">
                <option value={-1}>None</option>
                {textures.names.map((name, index) => <option key={index} value={index} disabled={textures.colorSpaces[index] !== space}>{name}</option>)}
              </select>
            </label>)}
        {textures && <p className="text-[11px] leading-4 text-slate-500">Textures use the model’s imported UVs. Color maps use sRGB; data maps use linear values.</p>}
      </div>
    </details>
  </section>
}
