'use client'
import { useState } from 'react'
import type { SplinePathData } from '@/lib/types/spline'
import { sampleContourEdges } from '@/lib/spline/modeling/sampleContour'
import { SPLINE_INTERPOLATION_LIMITS } from '@/lib/spline/sampling/interpolation'
import { CalculationNumberInput } from '../inputs/CalculationNumberInput'
import type { SplineComponentTool } from './tools/splineComponentTools'

/** Selection-property UI over the shared native Interpolation action. Draft
 * input is local UI state; only Apply/Default creates one source command.
 * Remount on selection/authored-value changes so Undo and mixed selections never
 * show a previous Object's value. Samples are derived, never source vertices. */
export function SplineObjectInterpolationControls({ data, ids, tool }: { data: SplinePathData; ids: readonly string[]; tool?: SplineComponentTool }) {
  const values = ids.map(id => data.subShapes[id]?.interpolation?.tolerancePx ?? null)
  return <InterpolationSettings key={`${ids.join(',')}:${values.join(',')}`} data={data} ids={ids} values={values} tool={tool} />
}

/** Bounded derived readout uses the production sampler. Degenerate contours
 * report an explanation; no draft setting is committed by measurement. */
function InterpolationSettings({ data, ids, values, tool }: { data: SplinePathData; ids: readonly string[]; values: (number | null)[]; tool?: SplineComponentTool }) {
  const mixed = values.some(value => value !== values[0]), current = mixed ? null : values[0]
  const [draft, setDraft] = useState(current ?? SPLINE_INTERPOLATION_LIMITS.defaultTolerancePx)
  let samples = 0, diagnostic = ''
  try {
    for (const id of ids.flatMap(id => data.subShapes[id]?.contourIds ?? [])) {
      const sampled = sampleContourEdges(data, id)
      samples += sampled.edges.reduce((sum, edge) => sum + edge.points.length - 1, 0) + (sampled.contour.closed ? 0 : 1)
      if (samples > 8192) throw new Error('Select fewer Objects for the sample count.')
    }
  } catch (error) { diagnostic = error instanceof Error ? error.message : String(error) }
  const change = (value: number) => { if (Number.isFinite(value) && value >= .01 && value <= 10) setDraft(value) }
  return <fieldset disabled={!tool || tool.disabled} aria-label="Object interpolation" className="space-y-2 rounded border border-gray-700 p-2">
    <legend className="px-1 font-medium">Interpolation</legend>
    <p>Current: {mixed ? 'Mixed' : current == null ? 'Default (automatic)' : `${current} local px`}</p>
    <label className="block space-y-1"><span>Tolerance (local px)</span><CalculationNumberInput aria-label="Object interpolation tolerance" min={.01} max={10} step="any" value={draft}
      className="w-full min-w-0 rounded border border-gray-600 bg-gray-800 px-2 py-1.5" onCalculate={change} onChange={event => { if (event.target.value !== '') change(+event.target.value) }} /></label>
    <div className="flex flex-wrap gap-2"><button type="button" title={tool?.reason} className="rounded border border-gray-600 px-2 py-1.5 disabled:opacity-40" onClick={() => tool?.run({ tolerancePx: draft })}>Apply interpolation</button>
      <button type="button" title={tool?.reason} className="rounded border border-gray-600 px-2 py-1.5 disabled:opacity-40" onClick={() => tool?.run({ tolerancePx: null })}>Use default interpolation</button></div>
    <p className="text-gray-400">Lower tolerance gives finer samples. Source vertices and visible curves stay unchanged. Mesh conversion uses the finer Object/conversion setting.</p>
    <p aria-live="polite" className="text-gray-400">{diagnostic || `${samples} derived sample points across ${ids.length} selected Objects.`}</p>
    {tool?.reason && <p className="text-gray-400">{tool.reason}</p>}
  </fieldset>
}
