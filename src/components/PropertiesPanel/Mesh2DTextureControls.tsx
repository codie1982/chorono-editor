'use client'

import { useMemo, useState } from 'react'
import ScrubInput from '@/components/inputs/ScrubInput'
import {
  DEFAULT_MESH2D_TEXTURE_TRANSFORM,
  resetMesh2DTextureTransform,
  resolveMesh2DTextureTransform,
  setMesh2DTexture,
  setMesh2DTextureTransform,
} from '@/lib/mesh2d'
import type { Asset, Layer } from '@/lib/types'
import type { Mesh2DTextureFit, Mesh2DTextureTransform } from '@/lib/types/mesh2d'

interface Props {
  readonly layer: Layer
  readonly allAssets: readonly Asset[]
  readonly onLayerChange: (layer: Layer) => void
  readonly onDiagnostic: (message: string | null) => void
}

const FIT_OPTIONS: readonly [Mesh2DTextureFit, string][] = [
  ['stretch', 'Stretch'],
  ['contain', 'Contain'],
  ['cover', 'Cover / crop'],
  ['fitX', 'Fit X'],
  ['fitY', 'Fit Y'],
  ['original', 'Original pixels'],
]

/**
 * Edits portable Mesh2D appearance placement without touching UVs or topology.
 *
 * Every control returns one complete immutable layer snapshot to the owning
 * history boundary. Scale linking is transient UI state; persisted scale axes
 * remain explicit so save/load and non-UI callers have deterministic values.
 */
export default function Mesh2DTextureControls({ layer, allAssets, onLayerChange, onDiagnostic }: Props) {
  const [linkScale, setLinkScale] = useState(true)
  const mesh = layer.mesh2d!
  const visualAssets = allAssets.filter(asset => asset.type === 'image' || asset.type === 'spriteSheet')
  const textureAssetId = mesh.appearance?.kind === 'texture' ? mesh.appearance.textureAssetId : undefined
  const textureAsset = visualAssets.find(asset => asset.id === textureAssetId)
  const textureMissing = !!textureAssetId && !textureAsset
  const resolved = useMemo(() => {
    try { return { value: resolveMesh2DTextureTransform(mesh.appearance?.textureTransform), error: null } }
    catch (cause) {
      return {
        value: DEFAULT_MESH2D_TEXTURE_TRANSFORM,
        error: cause instanceof Error ? cause.message : 'Texture placement is invalid',
      }
    }
  }, [mesh.appearance?.textureTransform])
  const disabled = !textureAssetId || !!resolved.error

  const apply = (patch: Partial<Omit<Mesh2DTextureTransform, 'schemaVersion'>>) => {
    try {
      onLayerChange(setMesh2DTextureTransform(layer, patch))
      onDiagnostic(null)
    } catch (cause) {
      onDiagnostic(cause instanceof Error ? cause.message : 'Texture placement could not be updated')
    }
  }

  const applyScale = (axis: 'scaleX' | 'scaleY', value: number) => {
    if (!linkScale) { apply({ [axis]: value }); return }
    const other = axis === 'scaleX' ? 'scaleY' : 'scaleX'
    const baseline = resolved.value[axis]
    const factor = baseline > 0 ? value / baseline : 1
    apply({ [axis]: value, [other]: resolved.value[other] * factor })
  }

  const reset = () => {
    onLayerChange(resetMesh2DTextureTransform(layer))
    onDiagnostic(null)
  }

  return (
    <section aria-labelledby="mesh2d-texture-heading" className="flex flex-col gap-2">
      <h3 id="mesh2d-texture-heading" className="border-t border-gray-700 pt-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">Mesh Appearance</h3>
      <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-gray-500">
        Texture asset
        <select aria-label="Texture asset" value={textureAssetId ?? ''}
          onChange={event => { onLayerChange(setMesh2DTexture(layer, event.target.value || null)); onDiagnostic(null) }}
          className="min-h-9 rounded border border-gray-700 bg-gray-900 px-2 text-xs normal-case tracking-normal text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
          <option value="">Solid fill</option>
          {visualAssets.map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-gray-500">
          Fit
          <select aria-label="Texture fit" value={resolved.value.fit} disabled={disabled}
            onChange={event => apply({ fit: event.target.value as Mesh2DTextureFit })}
            className="min-h-9 rounded border border-gray-700 bg-gray-900 px-2 text-xs normal-case tracking-normal text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:text-gray-600">
            {FIT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-gray-500">
          Sampling
          <select aria-label="Texture sampling" value={mesh.appearance?.sampling ?? 'linear'} disabled={!textureAssetId}
            onChange={event => onLayerChange(setMesh2DTexture(layer, textureAssetId ?? null, event.target.value as 'linear' | 'nearest'))}
            className="min-h-9 rounded border border-gray-700 bg-gray-900 px-2 text-xs normal-case tracking-normal text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:text-gray-600">
            <option value="linear">Linear</option>
            <option value="nearest">Nearest</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumberControl label="Offset X" value={resolved.value.offsetX} disabled={disabled} onChange={offsetX => apply({ offsetX })} />
        <NumberControl label="Offset Y" value={resolved.value.offsetY} disabled={disabled} onChange={offsetY => apply({ offsetY })} />
        <NumberControl label="Scale X" value={resolved.value.scaleX} min={0.01} max={100} step={0.01} disabled={disabled} onChange={value => applyScale('scaleX', value)} />
        <NumberControl label="Scale Y" value={resolved.value.scaleY} min={0.01} max={100} step={0.01} disabled={disabled} onChange={value => applyScale('scaleY', value)} />
      </div>
      <label className="flex min-h-9 items-center justify-between gap-3 rounded border border-gray-700 bg-gray-900 px-2.5 text-xs text-gray-300">
        Link scale ratio
        <input type="checkbox" aria-label="Link texture scale ratio" checked={linkScale} disabled={disabled}
          onChange={event => setLinkScale(event.target.checked)} className="size-4 accent-blue-500" />
      </label>

      <div className="grid grid-cols-3 gap-2">
        <NumberControl label="Rotation °" value={resolved.value.rotationDeg} step={1} disabled={disabled} onChange={rotationDeg => apply({ rotationDeg })} />
        <NumberControl label="Pivot U" value={resolved.value.pivotU} min={0} max={1} step={0.01} disabled={disabled} onChange={pivotU => apply({ pivotU })} />
        <NumberControl label="Pivot V" value={resolved.value.pivotV} min={0} max={1} step={0.01} disabled={disabled} onChange={pivotV => apply({ pivotV })} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <FlipControl axis="X" checked={resolved.value.flipX} disabled={disabled} onChange={flipX => apply({ flipX })} />
        <FlipControl axis="Y" checked={resolved.value.flipY} disabled={disabled} onChange={flipY => apply({ flipY })} />
      </div>
      <button type="button" onClick={reset} disabled={!mesh.appearance?.textureTransform}
        className="min-h-9 rounded border border-gray-700 bg-gray-800 px-2 text-[11px] text-gray-200 transition-colors hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:text-gray-600">
        Reset texture placement
      </button>

      <div role={textureMissing || resolved.error ? 'alert' : 'status'} aria-live="polite"
        className={`min-h-8 rounded border px-2 py-1.5 text-[10px] ${textureMissing || resolved.error ? 'border-red-800/60 bg-red-950/30 text-red-300' : 'border-gray-700 bg-gray-950/40 text-gray-400'}`}>
        {resolved.error ?? (textureMissing
          ? 'Texture asset is missing; renderer uses solid fill.'
          : textureAsset
            ? `Texture linked: ${textureAsset.name}. Use Texture tool (T) for canvas handles.`
            : 'Solid fill fallback active.')}
      </div>
      <p className="text-[10px] leading-snug text-gray-500">
        Placement changes appearance only; UV topology, pins and deformation clips stay unchanged.
      </p>
    </section>
  )
}

function NumberControl({ label, value, disabled, min, max, step = 1, onChange }: {
  readonly label: string; readonly value: number; readonly disabled: boolean
  readonly min?: number; readonly max?: number; readonly step?: number; readonly onChange: (value: number) => void
}) {
  return <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-gray-500">
    {label}
    <ScrubInput value={value} min={min} max={max} step={step} disabled={disabled} onChange={onChange} />
  </label>
}

function FlipControl({ axis, checked, disabled, onChange }: {
  readonly axis: 'X' | 'Y'; readonly checked: boolean; readonly disabled: boolean; readonly onChange: (value: boolean) => void
}) {
  return <label className="flex min-h-9 items-center justify-between gap-2 rounded border border-gray-700 bg-gray-900 px-2.5 text-xs text-gray-300">
    Flip {axis}
    <input type="checkbox" aria-label={`Flip texture ${axis}`} checked={checked} disabled={disabled}
      onChange={event => onChange(event.target.checked)} className="size-4 accent-blue-500" />
  </label>
}
