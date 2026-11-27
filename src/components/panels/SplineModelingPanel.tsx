'use client'

import { useState } from 'react'
import { DocumentationHelp } from '@/components/help/DocumentationHelp'
import type { ChronoScene, Layer } from '@/lib/types'
import type { SplinePathData } from '@/lib/types/spline'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import { makeAddLayerCmd, makeUpdateLayerCmd } from '@/lib/editor/commands-layer'
import { computeSplineBounds } from '@/lib/spline/geometry/computeSplineBounds'
import { splineToPathDefinition } from '@/lib/spline/splineToPath'
import { pathToSvgString } from '@/lib/geometry'
import { createOffsetOutline, type OffsetDirection } from '@/lib/spline/modeling/offsetOutline'
import { treatSplineCorners } from '@/lib/spline/modeling/cornerTreatment'
import { assertContourAnimationSafe } from '@/lib/spline/modeling/animationGuard'
import { modeledSplineLayer } from '@/lib/spline/modeling/modelingLayer'

export const SPLINE_MODELING_OPERATIONS = [
  { id: 'offset', label: 'Offset' },
  { id: 'outline', label: 'Outline' },
  { id: 'chamfer', label: 'Chamfer' },
  { id: 'fillet', label: 'Fillet' },
] as const

export type SplineModelingOperation = typeof SPLINE_MODELING_OPERATIONS[number]['id']
type Mode = SplineModelingOperation
export interface SplineModelingPanelProps {
  layer: Layer | null
  selectedPointId: string | null
  getScene: () => ChronoScene
  getRevision: () => number
  getDocumentSignal: () => AbortSignal
  isTransactionActive: () => boolean
  dispatchCommand: (command: EditorCommand) => void
  onSelectLayer: (id: string) => void
  onClearPoint: () => void
  /** Controlled operation for hosts that provide their own operation picker. */
  operation?: Mode
}
interface Preview { data: SplinePathData; source: Layer; revision: number; document: AbortSignal; mode: Mode; contourId: string }

/**
 * Owns the temporary modeling preview and its Apply/Cancel session. Preview
 * stays out of scene/history. Apply checks the captured source, document and
 * revision, then dispatches exactly one undoable command. Corner operations
 * replace one contour; offset/outline create a sibling spline layer so source
 * geometry and animation remain untouched. State is per mounted panel.
 */
export default function SplineModelingPanel(props: SplineModelingPanelProps) {
  return <SplineModelingSettings key={JSON.stringify([props.layer?.id, props.operation])} {...props} />
}

/** Keeps draft settings and previews scoped to the mounted layer and operation. */
function SplineModelingSettings(props: SplineModelingPanelProps) {
  const { layer } = props
  const [localMode, setMode] = useState<Mode>('offset')
  const mode = props.operation ?? localMode
  const [amount, setAmount] = useState(10)
  const [direction, setDirection] = useState<OffsetDirection>('outward')
  const [contourId, setContourId] = useState('')
  const [pointIds, setPointIds] = useState<string[]>([])
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState('')
  const help = <DocumentationHelp topic="editor/canvas/spline-modeling#use-the-spline-modeling-panel-in-v04" compact />
  if (!layer || layer.type !== 'spline' || !layer.spline) return (
    <div className="flex items-center justify-between gap-2 p-3 text-xs text-gray-400">
      <p>Select a spline layer to model its contours.</p>
      {help}
    </div>
  )
  const spline = layer.spline
  const contours = Object.values(spline.contours)
  const activeId = spline.contours[contourId] ? contourId : contours[0]?.id
  const contour = activeId ? spline.contours[activeId] : null
  const closed = contour?.closed ?? false
  const cornerMode = mode === 'chamfer' || mode === 'fillet'
  const activePoints = pointIds.filter(id => contour?.pointIds.includes(id))
  const eligiblePoints = contour?.pointIds.filter((id, index) =>
    !spline.points[id]?.locked && (closed || (index > 0 && index < contour.pointIds.length - 1))) ?? []
  const change = (run: () => void) => { run(); setPreview(null); setError('') }

  const plan = () => {
    try {
      if (!activeId) throw new Error('Select a contour.')
      if (layer.locked || layer.frozen || layer.hidden || layer.instanceOf) throw new Error('Unlock and show the source spline before modeling.')
      if (props.isTransactionActive()) throw new Error('Finish the current edit before previewing.')
      const source = props.getScene().layers.find(item => item.id === layer.id)
      if (source !== layer) throw new Error('Spline changed. Select it again.')
      let data: SplinePathData
      if (cornerMode) {
        assertContourAnimationSafe(props.getScene(), layer.id, spline, activeId)
        data = treatSplineCorners(spline, { contourId: activeId, pointIds: activePoints.length ? activePoints :
          props.selectedPointId && eligiblePoints.includes(props.selectedPointId) ? [props.selectedPointId] : [], amount, mode })
      } else {
        const applicableDirection = closed
          ? (direction === 'left' || direction === 'right' ? 'outward' : direction)
          : (direction === 'outward' || direction === 'inward' ? 'right' : direction)
        data = createOffsetOutline(spline, { contourId: activeId, distance: amount, direction: applicableDirection, mode })
      }
      setPreview({ data, source: layer, revision: props.getRevision(), document: props.getDocumentSignal(), mode, contourId: activeId })
      setError('')
    } catch (cause) { setPreview(null); setError(cause instanceof Error ? cause.message : String(cause)) }
  }

  const apply = () => {
    if (!preview) return
    try {
      const scene = props.getScene()
      if (preview.document.aborted || props.getRevision() !== preview.revision || scene.layers.find(item => item.id === preview.source.id) !== preview.source || props.isTransactionActive()) {
        throw new Error('Spline source changed after preview. Preview again before applying.')
      }
      if (preview.mode === 'chamfer' || preview.mode === 'fillet') {
        assertContourAnimationSafe(scene, preview.source.id, preview.source.spline!, preview.contourId)
        props.dispatchCommand(makeUpdateLayerCmd(preview.source.id, { spline: preview.data }, preview.source))
        props.onClearPoint()
      } else {
        const next = modeledSplineLayer(preview.source, preview.data, preview.mode)
        props.dispatchCommand(makeAddLayerCmd(next))
        props.onSelectLayer(next.id)
      }
      setPreview(null); setError('')
    } catch (cause) { setPreview(null); setError(cause instanceof Error ? cause.message : String(cause)) }
  }

  const selectCorner = (id: string) => change(() => setPointIds(previous => previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id]))
  const previewBounds = preview ? computeSplineBounds(preview.data) : null
  const sourceBounds = computeSplineBounds(spline)
  const x0 = Math.min(sourceBounds.x, previewBounds?.x ?? sourceBounds.x)
  const y0 = Math.min(sourceBounds.y, previewBounds?.y ?? sourceBounds.y)
  const x1 = Math.max(sourceBounds.x + sourceBounds.width, (previewBounds?.x ?? sourceBounds.x) + (previewBounds?.width ?? sourceBounds.width))
  const y1 = Math.max(sourceBounds.y + sourceBounds.height, (previewBounds?.y ?? sourceBounds.y) + (previewBounds?.height ?? sourceBounds.height))
  const pad = Math.max(4, (Math.max(x1 - x0, y1 - y0)) * 0.08)

  return <div className={`space-y-3 text-xs text-gray-200 ${props.operation ? '' : 'h-full overflow-auto bg-gray-900 p-3'}`} data-panel="spline-modeling">
    <div className="flex items-center justify-between gap-2">
      <h3 className="font-semibold text-sm">{props.operation ? SPLINE_MODELING_OPERATIONS.find(item => item.id === mode)?.label : 'Spline Modeling'}</h3>
      {help}
    </div>
    <p className="text-gray-400">{cornerMode ? 'Apply updates the source contour.' : 'Apply creates a separate spline layer.'}</p>
    <label className="block space-y-1">Contour
      <select aria-label="Spline contour" value={activeId ?? ''} onChange={event => change(() => { setContourId(event.target.value); setPointIds([]) })}
        className="block w-full rounded border border-gray-700 bg-gray-800 p-1.5">
        {contours.map((item, index) => <option key={item.id} value={item.id}>Contour {index + 1} · {item.closed ? 'closed' : 'open'}</option>)}
      </select>
    </label>
    {!props.operation && <label className="block space-y-1">Operation
      <select aria-label="Spline modeling operation" value={mode} onChange={event => change(() => setMode(event.target.value as Mode))}
        className="block w-full rounded border border-gray-700 bg-gray-800 p-1.5">
        {SPLINE_MODELING_OPERATIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
    </label>}
    <label className="block space-y-1">{mode === 'fillet' ? 'Radius' : 'Distance'} (local px)
      <input aria-label="Spline modeling amount" type="number" min="0.01" max="10000" step="0.5" value={amount}
        onChange={event => change(() => setAmount(Number(event.target.value)))} className="block w-full rounded border border-gray-700 bg-gray-800 p-1.5" />
    </label>
    {!cornerMode && <label className="block space-y-1">Direction
      <select aria-label="Offset direction" value={closed ? ['outward', 'inward'].includes(direction) ? direction : 'outward' : ['left', 'right'].includes(direction) ? direction : 'right'}
        onChange={event => change(() => setDirection(event.target.value as OffsetDirection))} className="block w-full rounded border border-gray-700 bg-gray-800 p-1.5">
        {(closed ? ['outward', 'inward'] : ['left', 'right']).map(item => <option key={item} value={item}>{item}</option>)}
      </select>
    </label>}
    {cornerMode && <div className="space-y-1">
      <div className="flex justify-between"><span>Corner points</span><button className="text-blue-300" onClick={() => change(() => setPointIds(eligiblePoints))}>Select all</button></div>
      <div className="max-h-36 overflow-auto rounded border border-gray-700 p-1">
        {contour?.pointIds.map((id, index) => <label key={id} className="flex gap-2 p-1 hover:bg-gray-800">
          <input type="checkbox" disabled={!eligiblePoints.includes(id)} checked={activePoints.includes(id)} onChange={() => selectCorner(id)} />
          <span>Point {index + 1} · {Math.round(spline.points[id].x)}, {Math.round(spline.points[id].y)}{id === props.selectedPointId ? ' · canvas selection' : ''}</span>
        </label>)}
      </div>
      {props.selectedPointId && eligiblePoints.includes(props.selectedPointId) && <button className="text-blue-300" onClick={() => selectCorner(props.selectedPointId!)}>Toggle canvas point</button>}
    </div>}
    <div className="flex gap-2"><button onClick={plan} className="rounded bg-blue-700 px-3 py-1.5 hover:bg-blue-600">Preview</button>
      <button onClick={apply} disabled={!preview} className="rounded bg-emerald-700 px-3 py-1.5 disabled:opacity-40">Apply</button>
      <button onClick={() => { setPreview(null); setError('') }} disabled={!preview && !error} className="rounded bg-gray-700 px-3 py-1.5 disabled:opacity-40">Cancel</button></div>
    {error && <p role="alert" className="text-amber-300">{error}</p>}
    {preview && <div className="space-y-1"><div className="text-gray-400">Source (gray) · preview (cyan)</div>
      <svg aria-label="Spline modeling preview" viewBox={`${x0 - pad} ${y0 - pad} ${Math.max(1, x1 - x0 + 2 * pad)} ${Math.max(1, y1 - y0 + 2 * pad)}`}
        className="h-44 w-full rounded border border-gray-700 bg-gray-950">
        <path d={pathToSvgString(splineToPathDefinition(spline))} fill="none" stroke="#64748b" strokeWidth="1" />
        <path d={pathToSvgString(splineToPathDefinition(preview.data))} fill="none" stroke="#22d3ee" strokeWidth="1.5" />
      </svg></div>}
    <p className="text-[11px] text-gray-500">Curves are approximated at 0.25 local px for these modeling operations. Apply creates one Undo step.</p>
  </div>
}
