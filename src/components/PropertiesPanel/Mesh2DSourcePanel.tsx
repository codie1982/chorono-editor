'use client'

import { useEffect, useMemo, useState } from 'react'
import ScrubInput from '@/components/inputs/ScrubInput'
import {
  isShapeBoundaryMesh2DCurrent,
  isSplineBoundaryMesh2DCurrent,
  regenerateShapeBoundaryMesh2DLayer,
  regenerateSplineBoundaryMesh2DLayer,
} from '@/lib/registry/definitions/mesh2d/Mesh2DDefinition'
import type { Layer } from '@/lib/types'

interface Props {
  readonly layer: Layer
  readonly allLayers: readonly Layer[]
  readonly onLayerChange: (layer: Layer) => void
}

/**
 * Shows the persisted source contract for spline/shape-derived Mesh2D layers.
 *
 * Source lookup and fingerprint comparison are read-only. Regeneration returns
 * one complete layer snapshot to the owning editor command path, so tolerance
 * plus derived geometry form one undo step. Errors stay adjacent to the source
 * controls and never partially update the selected layer.
 */
export default function Mesh2DSourcePanel({ layer, allLayers, onLayerChange }: Props) {
  const source = layer.mesh2d?.source
  const boundarySource = source?.kind === 'splineBoundary' || source?.kind === 'shapeBoundary'
  const sourceLayer = boundarySource
    ? allLayers.find(candidate => candidate.id === source.sourceLayerId)
    : undefined
  const current = useMemo(
    () => source?.kind === 'shapeBoundary'
      ? isShapeBoundaryMesh2DCurrent(layer, sourceLayer)
      : isSplineBoundaryMesh2DCurrent(layer, sourceLayer),
    [layer, source, sourceLayer],
  )
  const [error, setError] = useState<string | null>(null)
  useEffect(() => setError(null), [layer.id, sourceLayer?.id])
  if (!boundarySource || (source.kind !== 'splineBoundary' && source.kind !== 'shapeBoundary')) return null

  const regenerate = (flattenTolerance: number) => {
    if (!sourceLayer) return
    try {
      onLayerChange(source.kind === 'shapeBoundary'
        ? regenerateShapeBoundaryMesh2DLayer(layer, sourceLayer, { flattenTolerance })
        : regenerateSplineBoundaryMesh2DLayer(layer, sourceLayer, { flattenTolerance }))
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Mesh2D could not be regenerated')
    }
  }

  const missing = source.kind === 'shapeBoundary'
    ? sourceLayer?.type !== 'shape' || !sourceLayer.size
    : sourceLayer?.type !== 'spline' || !sourceLayer.spline
  const status = missing
    ? { label: 'Source missing', classes: 'border-red-800/60 bg-red-950/30 text-red-300' }
    : current
      ? { label: 'Source up to date', classes: 'border-emerald-800/60 bg-emerald-950/30 text-emerald-300' }
      : { label: 'Source changed — regenerate', classes: 'border-amber-700/60 bg-amber-950/30 text-amber-200' }

  return (
    <section aria-labelledby="mesh2d-source-heading" className="flex flex-col gap-2">
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

      {error && <p role="alert" className="rounded border border-red-800/60 bg-red-950/30 px-2 py-1.5 text-[10px] leading-snug text-red-300">{error}</p>}
      <button
        type="button"
        disabled={missing || current}
        onClick={() => regenerate(source.flattenTolerance)}
        className="min-h-9 w-full rounded border border-blue-700 bg-blue-950/30 px-3 py-2 text-xs font-medium text-blue-200 transition-colors hover:bg-blue-900/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:border-gray-700 disabled:bg-gray-800/40 disabled:text-gray-500"
      >
        {current ? 'Mesh2D is up to date' : 'Regenerate Mesh2D'}
      </button>
      <p className="text-[10px] leading-snug text-gray-600">
        Earcut 3.2.4 · {layer.mesh2d!.geometry.topology.triangleIndices.length / 3} triangles
      </p>
    </section>
  )
}
