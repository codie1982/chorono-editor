'use client'
import { useEffect, useState } from 'react'
import type { ChronoScene, Layer } from '@/lib/types'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import type { SplinePathData, SplinePointType, SplinePrimitiveKind } from '@/lib/types/spline'
import type { OverrideMap } from '@/lib/evaluator'
import { setSegmentType, setSplinePointType, setContourClosed, reverseContour } from '@/lib/spline'
import { splineEdgePath } from '@/lib/spline/selection'
import { PathSampler } from '@/lib/path/PathSampler'
import { materializeLayerOverrides } from '@/lib/render/materializeOverrides'
import { drivenSplineEditReason } from '@/lib/spline/edit/authoringGuard'
import SplinePointInspector from '../SplinePointInspector'
import { SplineModeControls } from './SplineModeControls'
import { splineEditCommand, type SplineEditOperation } from './commands'
import type { SplineEditController } from './useSplineEditSelection'
import { useSplineTopologyActions } from './useSplineTopologyActions'
import { SplineTopologyControls } from './SplineTopologyControls'
import { SplineTransformControls } from './SplineTransformControls'
import { SplineDrawingControls } from './SplineDrawingControls'
import { SplineAttachControls } from './SplineAttachControls'
import { restructureSplinePaths } from '@/lib/spline/edit/pathStructure'
import { useBooleanOperationActions } from '../booleanPreview/useBooleanOperationActions'
import { splineSelectionPoints, transformSplineSelection } from '@/lib/spline/selection'
import { DocumentationHelp } from '../help/DocumentationHelp'
import type { SplineFilletController } from './fillet/useSplineFillet'
import { SplineEditToolbox } from './tools/SplineEditToolbox'
import { splineEditTools, splinePointTypes } from './tools/splineEditTools'
import type { SplineChamferController } from './chamfer/useSplineChamfer'
import type { SplineOutlineController } from './outline/useSplineOutline'

interface Props {
  layer: Layer; controller: SplineEditController; getScene(): ChronoScene
  dispatchCommand(command: EditorCommand): void
  overrides?: OverrideMap
  timeMs?: number
  onSelectLayer?(id: string | null): void
  isTransactionActive?(): boolean
  disabled?: boolean
  drawingLine?: boolean
  autoClose?: boolean
  onAutoClose?(value: boolean): void
  onDraw?(kind: SplinePrimitiveKind, endpointId?: string): void
  /** Host cancels any drawing tool before enabling existing-object picking. */
  onBeginAttach?(): void
  fillet?: SplineFilletController
  chamfer?: SplineChamferController
  /** False when a containing dock keeps mode toggles above its modifier list. */
  modeControls?: boolean
  outline?: SplineOutlineController
}
const selectClass = 'w-full rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-xs text-gray-100 focus-visible:outline focus-visible:outline-blue-300'
/** Contextual native inspector over one existing spline layer. Selection and
 * mode are UI-only; source mutations reuse granular helpers and guarded native
 * commands. Edge lengths describe the displayed local curve (32 subdivisions),
 * never world scaling. Object is a SubShape, including all its contours/holes.
 * Root transforms and shared paint belong to Properties; this panel owns only
 * source geometry, topology and the active sub-object selection. */
export function SplineEditInspector({ layer, controller, getScene, dispatchCommand, overrides, disabled, drawingLine = false, autoClose = false, onAutoClose, onDraw, onBeginAttach, timeMs = 0, onSelectLayer, isTransactionActive, outline, chamfer, fillet, modeControls = true }: Props) {
  const [warning, setWarning] = useState('')
  const booleanActions = useBooleanOperationActions({ layerId: layer.id, getScene, dispatch: dispatchCommand,
    disabled, isTransactionActive, timeMs, overrides, nonDestructive: controller.nonDestructive, onMaterialized: controller.focusResult, selectedObjectIds: () => controller.bank.object,
    onSelectLayer: onSelectLayer ? id => onSelectLayer(id) : undefined, warning: setWarning })
  const tools = splineEditTools({ layer, scene: getScene(), mode: controller.mode, active: controller.active, disabled, busy: isTransactionActive?.(), controllers: { chamfer, fillet, offset: outline } })
  const topology = useSplineTopologyActions({ layer, controller, getScene, dispatch: dispatchCommand, timeMs, overrides, disabled, onSelectLayer, isTransactionActive, warning: setWarning })
  const structurePaths = (kind: 'compound' | 'separate') => {
    try {
      if (disabled || isTransactionActive?.()) return
      const scene = getScene(), current = scene.layers.find(item => item.id === layer.id)
      if (!current?.spline || current.spline !== layer.spline) throw new Error('Spline changed. Select current paths again.')
      const result = restructureSplinePaths(current.spline, controller.bank.object, kind)
      const command = splineEditCommand(scene, layer.id, { kind: 'topology' }, () => result.data, kind === 'compound' ? 'Compound Path' : 'Separate Paths')
      if (command) dispatchCommand(command)
      controller.focusResult({ layerId: layer.id, mode: 'object', ids: result.ids, ghosts: controller.sourceGhosts })
      setWarning('')
    } catch (error) { setWarning(error instanceof Error ? error.message : String(error)) }
  }
  const object = controller.mode === 'object' && controller.ids.length === 1 ? layer.spline?.subShapes[controller.ids[0]] : undefined
  const [name, setName] = useState(object?.name ?? '')
  useEffect(() => { setName(object?.name ?? '') }, [object?.id, object?.name])
  useEffect(() => { setWarning('') }, [layer.id, controller.mode, controller.active])
  if (!layer.spline || controller.layerId !== layer.id) return null
  const data = layer.spline, ids = controller.ids, readonly = !!disabled || !!layer.locked || !!layer.frozen || !!layer.hidden || !!layer.instanceOf
  const apply = (operation: SplineEditOperation, edit: (source: SplinePathData) => SplinePathData, label?: string) => {
    if (readonly) return
    try {
      const source = getScene()
      if (source.layers.find(item => item.id === layer.id)?.spline !== data) throw new Error('Spline changed. Select again from the current source.')
      const command = splineEditCommand(source, layer.id, operation, edit, label)
      if (command) dispatchCommand(command)
      setWarning('')
    } catch (error) { setWarning(error instanceof Error ? error.message : String(error)) }
  }
  const displayed = materializeLayerOverrides(layer, overrides ?? new Map()).spline ?? data
  const edges = ids.map(id => data.segments[id]).filter(Boolean)
  const edgeType = edges.length && edges.every(edge => edge.type === edges[0].type) ? edges[0].type : ''
  const points = ids.map(id => data.points[id]).filter(Boolean)
  const pointType = points.length && points.every(point => point.type === points[0].type) ? points[0].type : ''
  const contours = object?.contourIds.map(id => data.contours[id]).filter(Boolean) ?? []
  return <section aria-label="Spline edit properties" data-spline-mode={controller.mode} className="space-y-3 text-xs text-gray-300">
    {modeControls && <>
      <div className="flex items-center gap-2"><h3 className="font-semibold">Edit mode</h3><DocumentationHelp topic="editor/canvas/splines" /></div>
      <SplineModeControls controller={controller} disabled={readonly} />
    </>}
    {!controller.active ? <p className="text-gray-400">Point edits vertices, Edge edits segments, Object selects a complete Spline element.</p> : <>
      <h4 className="font-semibold">Selection properties</h4>
      <p aria-live="polite">{ids.length} {controller.mode}{ids.length === 1 ? '' : 's'} selected</p>
      {controller.mode === 'point' && (ids.length === 1 ? <SplinePointInspector layer={layer} pointId={ids[0]} dispatchCommand={dispatchCommand}
        readOnlyReason={readonly ? 'Source editing is unavailable in this context.' : drivenSplineEditReason(layer, getScene(), 'points', ids[0])}
        onDelete={() => topology.perform({ kind: 'delete' })} onApply={(next, kind, id) => apply(kind === 'topology' ? { kind } : { kind, ids: [id] }, () => next)} />
        : ids.length > 1 ? <label className="block space-y-1">Point type<select aria-label="Selected spline point type" disabled={readonly} value={pointType} className={selectClass}
          onChange={event => apply({ kind: 'topology' }, source => ids.reduce((next, id) => setSplinePointType(next, id, event.target.value as SplinePointType), source), 'Set spline point types')}>
          <option value="" disabled>Mixed</option>{splinePointTypes.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
        </select><span className="block text-gray-400">Select one point to edit its position and handles.</span></label> : <p>Click a point or drag an empty area to select points.</p>)}
      {controller.mode === 'edge' && (edges.length ? <div className="space-y-2">
        <label className="block space-y-1">Segment type<select aria-label="Spline segment type" disabled={readonly} value={edgeType} className={selectClass}
          onChange={event => apply({ kind: 'topology' }, source => ids.reduce((next, id) => setSegmentType(next, id, event.target.value as 'line' | 'cubic'), source), 'Set spline segment types')}>
          <option value="" disabled>Mixed</option><option value="line">Line</option><option value="cubic">Curve · cubic</option>{edgeType === 'quadratic' && <option value="quadratic" disabled>Curve · quadratic</option>}
        </select></label>
        {edges.length === 1 && <><p className="break-all">From: {edges[0].fromPointId}<br />To: {edges[0].toPointId}</p>
          <p>Length (local px, sampled): {new PathSampler().buildLengthTable(splineEdgePath(displayed, edges[0].id)).totalLength.toFixed(2)}</p></>}
      </div> : <p>Click a segment or drag an empty area to select edges.</p>)}
      {controller.mode === 'object' && <div className="space-y-2">
        <div role="group" aria-label="Spline objects" className="max-h-36 overflow-auto space-y-1">
          {Object.values(data.subShapes).map(sub => <button key={sub.id} type="button" aria-label={`Select spline object ${sub.name}`} aria-pressed={ids.includes(sub.id)}
            className={`block w-full rounded border px-2 py-1.5 text-left focus-visible:outline focus-visible:outline-blue-300 ${ids.includes(sub.id) ? 'border-blue-400 bg-blue-950' : 'border-gray-700 hover:bg-gray-800'}`}
            onClick={event => controller.select([sub.id], event.shiftKey || event.ctrlKey || event.metaKey ? 'toggle' : 'replace')}>{sub.name || sub.kind}</button>)}
        </div>
        {object && <><label className="block space-y-1">Object name<input aria-label="Spline object name" className={selectClass} disabled={readonly} value={name}
          onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
          onBlur={() => { if (name.trim() && name !== object.name) apply({ kind: 'metadata' }, source => ({ ...source, subShapes: { ...source.subShapes, [object.id]: { ...source.subShapes[object.id], name: name.trim() } } }), 'Rename spline object') }} /></label>
          <p className="break-all">ID: {object.id}<br />Kind: {object.kind} · {object.source}<br />Contours: {contours.length} · {contours.every(c => c.closed) ? 'Closed' : contours.some(c => c.closed) ? 'Mixed open/closed' : 'Open'}</p>
          <div className="flex flex-wrap gap-2"><button type="button" disabled={readonly} className={selectClass + ' !w-auto'} onClick={() => apply({ kind: 'topology' }, source => contours.reduce((next, contour) => setContourClosed(next, contour.id, !contours.every(c => c.closed)), source), 'Set spline closure')}>{contours.every(c => c.closed) ? 'Open contours' : 'Close contours'}</button>
            <button type="button" disabled={readonly} className={selectClass + ' !w-auto'} onClick={() => apply({ kind: 'topology' }, source => contours.reduce((next, contour) => reverseContour(next, contour.id), source), 'Reverse spline object')}>Reverse direction</button></div>
        </>}
      </div>}
      {!!ids.length && <details className="rounded border border-gray-700 p-2"><summary className="cursor-pointer font-medium">Selection actions</summary>
        <div className="mt-3"><SplineTopologyControls scene={getScene()} layer={layer} controller={controller} actions={topology} disabled={readonly} /></div>
      </details>}
      <SplineEditToolbox mode={controller.mode} actions={tools} chamfer={chamfer} fillet={fillet} outline={outline} />
      {controller.mode === 'object' && <SplineAttachControls controller={controller} disabled={readonly} onBegin={onBeginAttach} booleanActions={booleanActions} onStructure={structurePaths} />}
      {!!ids.length && <SplineTransformControls key={`${layer.id}:${controller.mode}:${ids.join(',')}`} disabled={readonly} onApply={transform => {
        const points = splineSelectionPoints(data, controller.mode, ids)
        apply({ kind: 'geometry', ids: Array.from(points) }, source => transformSplineSelection(source, points, transform), 'Transform spline selection')
      }} />}
      {onDraw && onAutoClose && <details open={drawingLine || undefined} className="rounded border border-gray-700 p-2"><summary className="cursor-pointer font-medium">Draw new spline elements</summary>
        <div className="mt-3"><SplineDrawingControls drawingLine={drawingLine} data={data} controller={controller} autoClose={autoClose} onAutoClose={onAutoClose} onDraw={(kind, endpoint) => { controller.setAttaching(false); onDraw(kind, endpoint) }} disabled={readonly} /></div>
      </details>}
      {!!ids.length && <p className="text-gray-400">Shift / Ctrl / Cmd adds or removes items. Drag an empty area for a selection region.</p>}
    </>}
    {warning && <p role="alert" className="text-amber-300">{warning}</p>}
  </section>
}
