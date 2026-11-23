'use client'
import { useEffect, useState } from 'react'
import type { ChronoScene, Layer } from '@/lib/types'
import { splineContinuation } from '@/lib/spline'
import { CalculationNumberInput } from '../inputs/CalculationNumberInput'
import type { SplineEditController } from './useSplineEditSelection'
import type { SplineTopologyActions } from './useSplineTopologyActions'
import { splineVertexTypes } from './tools/splineVertexTypes'
import type { SplineVertexType } from '@/lib/spline/edit/addVertex'

const button = 'rounded border border-gray-600 px-2 py-1.5 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed'
/** Compact mode-owned topology controls. Settings are transient UI values;
 * Weld tolerance is composition px, Simplify tolerance is layer-local px,
 * Refine is normalized parameter and Divide is equal-parameter parts. Runtime
 * safety stays in native commands; panel/menu share controller preferences. */
export function SplineTopologyControls({ scene, layer, controller, actions, disabled }: {
  scene: ChronoScene; layer: Layer; controller: SplineEditController; actions: SplineTopologyActions; disabled?: boolean
}) {
  const [tolerance, setTolerance] = useState(5), [parts, setParts] = useState(2), [refine, setRefine] = useState(50), [split, setSplit] = useState(50)
  const [copyX, setCopyX] = useState(20), [copyY, setCopyY] = useState(20), [sourceId, setSourceId] = useState('')
  const sourceExists = scene.layers.some(item => item.id === sourceId && item.id !== layer.id && item.type === 'spline' && item.spline)
  useEffect(() => { if (!sourceExists && sourceId) setSourceId('') }, [sourceExists, sourceId, layer.id])
  const ids = controller.ids, pointPair = ids.length === 2 && ids.every(id => splineContinuation(layer.spline!, id))
  return <details className="rounded border border-gray-700 p-2"><summary className="cursor-pointer select-none">Topology · {controller.mode}</summary>
    <fieldset disabled={disabled} className="space-y-2 pt-2">
    {controller.mode === 'object' && <><TopologyNumber label="Simplify tolerance (local px)" value={controller.simplifyTolerancePx} min={.001} max={1000} onChange={controller.setSimplifyTolerancePx} />
      <p className="text-gray-400">Simplify preserves sharp turns (≥30°) and hole ownership. Smooth changes handles while keeping anchors fixed.</p></>}
    {controller.mode === 'edge' && <label className="block space-y-1">New vertex type<select aria-label="New vertex type" className="w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5" value={controller.vertexType}
      onChange={event => controller.setVertexType(event.target.value as SplineVertexType)}>{splineVertexTypes.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select>
      <span className="block text-gray-400">Preserve keeps the exact curve. Corner / mirrored Bézier may reshape the edge.</span>
    </label>}
    {controller.mode === 'edge' && <TopologyNumber label="Split position (%)" value={split} min={.01} max={99.99} onChange={setSplit} />}
    <div className="flex flex-wrap gap-2">{actions.componentTools.map(tool => <span key={tool.id} title={tool.reason ?? tool.description}>
      <button type="button" className={button + (tool.active ? ' border-orange-400 bg-orange-950' : '')} disabled={tool.disabled} aria-pressed={tool.id === 'trim' || tool.id === 'extend' || tool.id === 'addVertex' ? !!tool.active : undefined} aria-describedby={`spline-tool-${tool.id}`} onClick={() => tool.run({ t: split / 100 })}>{tool.label}</button>
      <span id={`spline-tool-${tool.id}`} className="sr-only">{tool.reason ?? tool.description}</span>
    </span>)}</div>
    {controller.edgeTool && <div role="status" className="rounded border border-orange-700 p-2 text-orange-200">
      {controller.edgeTool === 'addVertex' ? 'Add Vertex: keep clicking edges to insert points. Each click has its own Undo.' : controller.edgeTool === 'trim' ? 'Trim: click the part between intersections to remove it.' : 'Extend: click a terminal edge near the open end to extend.'} Esc cancels.
      <button type="button" className={button + ' ml-2'} onClick={() => controller.setEdgeTool(null)}>Cancel edge tool</button>
    </div>}
    {Array.from(new Set(actions.componentTools.flatMap(tool => tool.reason ? [tool.reason] : []))).map(reason => <p key={reason} className="text-gray-400">{reason}</p>)}
    {controller.mode === 'point' && <>
      <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={!pointPair} onClick={() => actions.perform({ kind: 'connect' })}>Join / Connect endpoints</button>
        <button type="button" className={button} disabled={!pointPair} onClick={() => actions.perform({ kind: 'weld', tolerancePx: tolerance })}>Weld endpoints</button></div>
      <TopologyNumber label="Weld tolerance (composition px)" value={tolerance} min={0} onChange={setTolerance} />
      <p className="text-gray-400">Select two open endpoints. Weld keeps the first point; Connect adds a straight bridge.</p>
    </>}
    {controller.mode === 'edge' && <>
      <div className="grid grid-cols-2 gap-2"><TopologyNumber label="Refine position (%)" value={refine} min={.01} max={99.99} onChange={setRefine} />
        <TopologyNumber label="Divide parts" value={parts} min={2} max={64} onChange={setParts} /></div>
      <div className="flex gap-2"><button type="button" disabled={!ids.length} className={button} onClick={() => actions.perform({ kind: 'refine', t: refine / 100 })}>Refine edges</button>
        <button type="button" disabled={!ids.length} className={button} onClick={() => actions.perform({ kind: 'divide', parts })}>Divide edges</button></div>
      <p className="text-gray-400">Refine/Divide preserve curves. Delete cuts the path into open contours.</p>
    </>}
    {controller.mode === 'object' && <>
      <div className="grid grid-cols-2 gap-2"><TopologyNumber label="Object copy offset X (local px)" value={copyX} onChange={setCopyX} /><TopologyNumber label="Object copy offset Y (local px)" value={copyY} onChange={setCopyY} /></div>
      <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={!ids.length} onClick={() => actions.perform({ kind: 'copy', x: copyX, y: copyY })}>Copy objects</button>
        <button type="button" className={button} disabled={!ids.length || !actions.canDetach} onClick={() => actions.perform({ kind: 'detach' })}>Detach to new layer</button></div>
      <label className="block space-y-1">Attach source layer<select aria-label="Attach spline source" className="w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5" value={sourceExists ? sourceId : ''} onChange={event => setSourceId(event.target.value)}>
        <option value="">Choose a static spline…</option>{scene.layers.filter(item => item.id !== layer.id && item.type === 'spline' && item.spline).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      <button type="button" className={button} disabled={!sourceExists} onClick={() => actions.perform({ kind: 'attach', sourceId })}>Attach layer</button>
      <p className="text-gray-400">Attach removes the source layer and uses this layer’s shared paint. Animated/referenced sources stay separate. Detach preserves outer animation on a sibling layer.</p>
    </>}
    <button type="button" className={button + ' text-red-300'} disabled={!ids.length} onClick={() => actions.perform({ kind: 'delete' })}>Delete selected {controller.mode}s</button>
  </fieldset></details>
}
/** Shared calculation input; finite bounded values never enter source/Undo
 * until an explicit topology action. Integer Divide is validated by the solver. */
function TopologyNumber({ label, value, onChange, min, max }: { label: string; value: number; onChange(value: number): void; min?: number; max?: number }) {
  const change = (number: number) => { if (Number.isFinite(number) && (min === undefined || number >= min) && (max === undefined || number <= max)) onChange(number) }
  return <label className="block min-w-0 space-y-1"><span>{label}</span><CalculationNumberInput aria-label={label} value={value} min={min} max={max} step="any"
    className="min-w-0 w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5" onCalculate={change} onChange={event => { if (event.target.value !== '') change(+event.target.value) }} /></label>
}
