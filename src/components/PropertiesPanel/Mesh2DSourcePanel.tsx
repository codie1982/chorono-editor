'use client'

import { useEffect, useMemo, useState } from 'react'
import ScrubInput from '@/components/inputs/ScrubInput'
import {
  isShapeBoundaryMesh2DCurrent,
  isSplineBoundaryMesh2DCurrent,
  regenerateShapeBoundaryMesh2DLayer,
  regenerateSplineBoundaryMesh2DLayer,
} from '@/lib/registry/definitions/mesh2d/Mesh2DDefinition'
import {
  isMesh2DPinSelectionCurrent,
  selectMesh2DPinPreset,
  setMesh2DDeformation,
  setMesh2DPins,
  type Mesh2DPinPreset,
} from '@/lib/mesh2d'
import type { Asset, Layer } from '@/lib/types'
import Mesh2DTextureControls from './Mesh2DTextureControls'

interface Props {
  readonly layer: Layer
  readonly allLayers: readonly Layer[]
  readonly allAssets?: readonly Asset[]
  readonly onLayerChange: (layer: Layer) => void
}

/**
 * Shows persisted source contracts for authored and bake-generated Mesh2D layers.
 *
 * Source lookup and fingerprint comparison are read-only. Regeneration returns
 * one complete layer snapshot to the owning editor command path, so tolerance
 * plus derived geometry form one undo step. Errors stay adjacent to the source
 * controls and never partially update the selected layer.
 */
export default function Mesh2DSourcePanel({ layer, allLayers, allAssets = [], onLayerChange }: Props) {
  const mesh = layer.mesh2d
  const source = layer.mesh2d?.source
  const boundarySource = source?.kind === 'splineBoundary' || source?.kind === 'shapeBoundary'
  const fractureSource = source?.kind === 'fractureFragment'
  const sourceLayer = boundarySource || fractureSource
    ? allLayers.find(candidate => candidate.id === source.sourceLayerId)
    : undefined
  const current = useMemo(
    () => source?.kind === 'shapeBoundary'
      ? isShapeBoundaryMesh2DCurrent(layer, sourceLayer)
      : source?.kind === 'splineBoundary'
        ? isSplineBoundaryMesh2DCurrent(layer, sourceLayer)
        : true,
    [layer, source, sourceLayer],
  )
  const [error, setError] = useState<string | null>(null)
  useEffect(() => setError(null), [layer.id, sourceLayer?.id])
  if (!mesh) return null

  const regenerate = (flattenTolerance: number) => {
    if (!sourceLayer || (source?.kind !== 'splineBoundary' && source?.kind !== 'shapeBoundary')) return
    try {
      onLayerChange(source.kind === 'shapeBoundary'
        ? regenerateShapeBoundaryMesh2DLayer(layer, sourceLayer, { flattenTolerance })
        : regenerateSplineBoundaryMesh2DLayer(layer, sourceLayer, { flattenTolerance }))
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Mesh2D could not be regenerated')
    }
  }

  const missing = source?.kind === 'shapeBoundary'
    ? sourceLayer?.type !== 'shape' || !sourceLayer.size
    : sourceLayer?.type !== 'spline' || !sourceLayer.spline
  const status = missing
    ? { label: 'Source missing', classes: 'border-red-800/60 bg-red-950/30 text-red-300' }
    : current
      ? { label: 'Source up to date', classes: 'border-emerald-800/60 bg-emerald-950/30 text-emerald-300' }
      : { label: 'Source changed — regenerate', classes: 'border-amber-700/60 bg-amber-950/30 text-amber-200' }
  const deformationAssets = allAssets.filter(asset => asset.type === 'meshDeformation')
  const deformationAssetId = mesh.deformation?.assetId
  const deformationAsset = deformationAssets.find(asset => asset.id === deformationAssetId)
  const deformationMissing = !!deformationAssetId && !deformationAsset
  const pinsCurrent = isMesh2DPinSelectionCurrent(layer)
  const pinCount = mesh.pins?.vertexIds.length ?? 0

  const chooseDeformation = (assetId: string) => {
    onLayerChange(setMesh2DDeformation(layer, assetId || null))
  }

  const updateDeformation = (options: Parameters<typeof setMesh2DDeformation>[2]) => {
    if (!deformationAssetId) return
    try {
      onLayerChange(setMesh2DDeformation(layer, deformationAssetId, options))
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Deformation playback could not be updated')
    }
  }

  const choosePins = (preset: Mesh2DPinPreset) => {
    try {
      onLayerChange(selectMesh2DPinPreset(layer, preset))
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Pin selection could not be updated')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {fractureSource && <section aria-labelledby="mesh2d-fracture-source-heading" className="flex flex-col gap-2">
        <h3 id="mesh2d-fracture-source-heading" className="border-t border-gray-700 pt-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">
          Fracture Fragment
        </h3>
        <div className="rounded border border-blue-800/60 bg-blue-950/20 px-2.5 py-2 text-[11px] text-blue-100">
          <div className="flex items-center justify-between gap-2">
            <span className="text-blue-300/70">Source layer</span>
            <span className="min-w-0 truncate text-right" title={sourceLayer?.name ?? source.sourceLayerId}>
              {sourceLayer?.name ?? source.sourceLayerId}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-blue-300/70">Generation</span>
            <span className="min-w-0 truncate font-mono text-[10px]" title={source.generationId}>{source.generationId}</span>
          </div>
          <p role="status" className="mt-2 rounded border border-blue-700/60 bg-blue-950/35 px-2 py-1.5 text-[10px] leading-4 text-blue-200">
            Bake-owned image mesh · source-rectangle UVs preserved
          </p>
        </div>
        <p className="text-[10px] leading-4 text-gray-500">
          Texture edits are allowed, but Inspect Bake will mark this generated output as edited before Re-bake or Clear.
        </p>
      </section>}

      {boundarySource && (source.kind === 'splineBoundary' || source.kind === 'shapeBoundary') && <section aria-labelledby="mesh2d-source-heading" className="flex flex-col gap-2">
        <h3 id="mesh2d-source-heading" className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pt-1 border-t border-gray-700">
          {source.kind === 'shapeBoundary' ? 'Shape Source' : 'Spline Source'}
        </h3>
        <div className="rounded border border-gray-700 bg-gray-950/40 px-2.5 py-2 text-[11px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-gray-500">Source layer</span>
            <span className="truncate text-right text-gray-200" title={sourceLayer?.name ?? source.sourceLayerId}>
              {sourceLayer?.name ?? source.sourceLayerId}
            </span>
          </div>
          <div role={missing ? 'alert' : 'status'} aria-live="polite" className={`mt-2 rounded border px-2 py-1.5 font-medium ${status.classes}`}>
            {status.label}
          </div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-gray-500 uppercase tracking-wide">Flatten tolerance (local px)</span>
          <ScrubInput
            value={source.flattenTolerance}
            min={0.01}
            max={10}
            step={0.05}
            disabled={missing}
            onChange={regenerate}
          />
          <span className="text-[10px] leading-snug text-gray-500">
            Lower values follow curves more closely and create more triangles. Viewport zoom does not affect this value.
          </span>
        </label>

        <button
          type="button"
          disabled={missing || current}
          onClick={() => regenerate(source.flattenTolerance)}
          className="min-h-9 w-full rounded border border-blue-700 bg-blue-950/30 px-3 py-2 text-xs font-medium text-blue-200 transition-colors hover:bg-blue-900/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:border-gray-700 disabled:bg-gray-800/40 disabled:text-gray-500"
        >
          {current ? 'Mesh2D is up to date' : 'Regenerate Mesh2D'}
        </button>
        <p className="text-[10px] leading-snug text-gray-600">
          Earcut 3.2.4 · {mesh.geometry.topology.triangleIndices.length / 3} triangles
        </p>
      </section>}

      <Mesh2DTextureControls layer={layer} allAssets={allAssets} onLayerChange={onLayerChange} onDiagnostic={setError} />

      <section aria-labelledby="mesh2d-deformation-heading" className="flex flex-col gap-2">
        <h3 id="mesh2d-deformation-heading" className="border-t border-gray-700 pt-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">Deformation Clip</h3>
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-gray-500">
          Binary clip asset
          <select aria-label="Deformation clip asset" value={deformationAssetId ?? ''} onChange={event => chooseDeformation(event.target.value)}
            className="min-h-9 rounded border border-gray-700 bg-gray-900 px-2 text-xs normal-case tracking-normal text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
            <option value="">Rest mesh</option>
            {deformationAssets.map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-gray-500">
            Start (ms)
            <ScrubInput value={mesh.deformation?.startTimeMs ?? 0} step={10} disabled={!deformationAssetId}
              onChange={startTimeMs => updateDeformation({ startTimeMs })} />
          </label>
          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-gray-500">
            Speed
            <ScrubInput value={mesh.deformation?.playbackRate ?? 1} min={0.01} max={16} step={0.05} disabled={!deformationAssetId}
              onChange={playbackRate => updateDeformation({ playbackRate })} />
          </label>
        </div>
        <label className="flex min-h-9 items-center justify-between gap-3 rounded border border-gray-700 bg-gray-900 px-2.5 text-xs text-gray-300">
          Loop clip
          <input type="checkbox" aria-label="Loop deformation clip" disabled={!deformationAssetId}
            checked={mesh.deformation?.loop ?? false} onChange={event => updateDeformation({ loop: event.target.checked })}
            className="size-4 accent-blue-500" />
        </label>
        <div role={deformationMissing ? 'alert' : 'status'} aria-live="polite"
          className={`min-h-8 rounded border px-2 py-1.5 text-[10px] ${deformationMissing ? 'border-red-800/60 bg-red-950/30 text-red-300' : 'border-gray-700 bg-gray-950/40 text-gray-400'}`}>
          {deformationMissing
            ? 'Clip asset is missing; renderer uses the rest mesh.'
            : deformationAsset
              ? `Clip linked: ${deformationAsset.name}. Topology is validated during decode.`
              : 'Rest mesh playback active.'}
        </div>
      </section>

      <section aria-labelledby="mesh2d-pins-heading" className="flex flex-col gap-2">
        <div className="flex items-center justify-between border-t border-gray-700 pt-2">
          <h3 id="mesh2d-pins-heading" className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Pins</h3>
          <span role="status" aria-live="polite" className={`text-[10px] ${pinsCurrent ? 'text-emerald-400' : 'text-amber-300'}`}>
            {pinsCurrent ? `${pinCount} selected` : `${pinCount} stale`}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5" aria-label="Pin selection presets">
          {([['topEdge', 'Top edge'], ['corners', 'Corners'], ['boundary', 'Boundary']] as const).map(([preset, label]) => (
            <button key={preset} type="button" onClick={() => choosePins(preset)}
              className="min-h-9 rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-[11px] text-gray-200 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
              {label}
            </button>
          ))}
          <button type="button" onClick={() => onLayerChange(setMesh2DPins(layer, []))}
            className="min-h-9 rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-[11px] text-gray-300 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
            Clear
          </button>
        </div>
        <p className="min-h-8 text-[10px] leading-snug text-gray-500">
          Pins use stable vertex ids. Green markers are current; amber markers require reselection after topology changes.
        </p>
      </section>

      {error && <p role="alert" className="rounded border border-red-800/60 bg-red-950/30 px-2 py-1.5 text-[10px] leading-snug text-red-300">{error}</p>}
    </div>
  )
}
