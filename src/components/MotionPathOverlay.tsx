'use client'
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { ChronoScene, Layer } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { buildTrajectoryModel, prepareTrajectoryContext, projectTrajectoryPosition, type TrajectoryModel, type TrajectoryNode } from '@/lib/timeline/trajectory'
import { moveTrajectoryNodes, setTrajectoryPoint } from '@/lib/timeline/trajectory/commands'
import { MotionKeyToolbar } from './canvas/motion/MotionKeyToolbar'
import { MotionKeyInspector } from './canvas/motion/MotionKeyInspector'
import { MotionDrawingPanel } from './canvas/motion/MotionDrawingPanel'
import { useMotionKeyActions } from './canvas/motion/useMotionKeyActions'
import { useMotionDrawing } from './canvas/motion/useMotionDrawing'
import { useMotionKeyDrag, motionPointerWorld } from './canvas/motion/useMotionKeyDrag'
import { useMotionKeyboard } from './canvas/motion/useMotionKeyboard'
import { isMotionNodeSelected, selectMotionNode, trajectoryNodeRef, type MotionEditorMode } from './canvas/motion/types'

export interface MotionPathOverlayProps {
  layer: Layer
  scene: ChronoScene
  zoom: number
  /** Active timeline's exact local authoring time, milliseconds. */
  currentTimeMs: number
  editor: EditorStateReturn
  /** Retained for existing callers; native canvas dimensions own projection. */
  compositionWidth: number
  timelineId?: string
  selectedKeyframeIds?: ReadonlySet<string>
  onSelectKeyframes?: (ids: Set<string>) => void
  onSeek?: (localMs: number) => void
  canvasRef?: RefObject<HTMLCanvasElement>
  /** Positioned, unscaled viewport host for controls. Missing/unattached hosts
   * keep controls inline; trajectory geometry always stays in composition space. */
  controlsHostRef?: RefObject<HTMLElement>
  mode?: MotionEditorMode
  onModeChange?: (mode: MotionEditorMode) => void
  onEditingChange?: (editing: boolean) => void
  onEditPathSource?: (sourceId: string) => void
  onEditProgressTiming?: (layerId: string) => void
  snapWorldPoint?: (point: { x: number; y: number }) => { x: number; y: number }
}

/** Editable native position trajectory on one explicit timeline. Geometry path
 * authoring and Follow Path progress remain separate source models. Toolbar and
 * numeric actions are keyboard/single-pointer alternatives to spatial dragging.
 * Read-only drivers still show diagnostics/preview without writing output back
 * into their inputs. Draft routes and shared pointer sessions never serialize UI
 * state; editor commands own atomic source/key history and stable identities. */
export default function MotionPathOverlay(props: MotionPathOverlayProps) {
  const { scene, layer, editor, zoom, currentTimeMs, timelineId = '', canvasRef } = props
  const [internalMode, setInternalMode] = useState<MotionEditorMode>('off')
  const mode = props.mode ?? internalMode
  const [localSelection, setLocalSelection] = useState<Set<string>>(new Set())
  const selection = props.selectedKeyframeIds ?? localSelection
  const [warning, setWarning] = useState('')
  const [duplicateMs, setDuplicateMs] = useState(1000 / Math.max(1, scene.composition.frameRate))
  const [addStep, setAddStep] = useState(1)
  const [stepUnit, setStepUnit] = useState<'frames' | 'ms'>('frames')
  const [controlsHost, setControlsHost] = useState<HTMLElement | null>(null)
  // Parent refs attach after rendering. Recheck on each commit so a reused ref
  // also follows host replacement without subscribing to canvas pan or zoom.
  useEffect(() => {
    const next = props.controlsHostRef?.current ?? null
    if (next !== controlsHost) setControlsHost(next)
  })
  const documentSignal = editor.getDocumentSignal()
  const contextKey = `${timelineId}:${layer.id}:${mode}`
  const dragging = editor.isTransactionActive()
  const model = useMemo<TrajectoryModel>(() => {
    if (mode !== 'off') return buildTrajectoryModel(scene, timelineId, layer.id, { maxSamples: dragging ? 64 : 256 })
    const prepared = prepareTrajectoryContext(scene, timelineId, layer.id)
    return { context: prepared.ok ? prepared.context : null, timelineId, layerId: layer.id,
      durationMs: prepared.ok ? prepared.context.timeline.durationMs : 0,
      capability: prepared.ok ? prepared.context.capability : { editable: false, kind: 'none', diagnostics: prepared.diagnostics },
      nodes: [], segments: [] }
  }, [scene, timelineId, layer.id, mode, dragging])
  const selectedNodes = useMemo(() => model.nodes.filter(node => isMotionNodeSelected(node, selection)), [model.nodes, selection])
  const changeMode = useCallback((next: MotionEditorMode) => {
    if (props.mode === undefined) setInternalMode(next)
    props.onModeChange?.(next); setWarning('')
  }, [props.mode, props.onModeChange])
  const select = useCallback((ids: Set<string>) => {
    if (!props.selectedKeyframeIds) setLocalSelection(ids)
    props.onSelectKeyframes?.(ids)
  }, [props.selectedKeyframeIds, props.onSelectKeyframes])
  const editingCallback = useRef(props.onEditingChange); editingCallback.current = props.onEditingChange
  useEffect(() => {
    editingCallback.current?.(mode !== 'off')
    return () => editingCallback.current?.(false)
  }, [mode])
  useEffect(() => { setLocalSelection(new Set()); setWarning('') }, [timelineId, layer.id, documentSignal])
  const actions = useMotionKeyActions({ editor, timelineId, layerId: layer.id, selectedNodes,
    onSelect: select, onSeek: props.onSeek, onWarning: setWarning })
  const drawing = useMotionDrawing({ scene, editor, timelineId, layerId: layer.id, durationMs: model.durationMs,
    localTimeMs: currentTimeMs, contextKey, documentSignal, apply: actions.apply, onWarning: setWarning })
  const drag = useMotionKeyDrag({ editor, timelineId, layerId: layer.id, canvasRef, contextKey,
    documentSignal, onSelect: select, onWarning: setWarning, snapWorldPoint: props.snapWorldPoint })
  const moveSelected = useCallback((dx: number, dy: number) => actions.apply(() => moveTrajectoryNodes(editor.getScene(), {
    timelineId, layerId: layer.id, nodes: selectedNodes.map(trajectoryNodeRef), deltaWorld: { x: dx, y: dy },
  })), [actions.apply, editor, timelineId, layer.id, selectedNodes])
  const cancel = useCallback(() => { drag.cancel(); drawing.clear(); changeMode('select') }, [drag.cancel, drawing.clear, changeMode])
  useMotionKeyboard({ active: mode !== 'off', canEdit: model.capability.editable,
    hasSelection: selectedNodes.length > 0, move: moveSelected, remove: actions.remove, cancel })
  const preview = useMemo(() => drawing.previewScene ? buildTrajectoryModel(drawing.previewScene, timelineId, layer.id) : null,
  [drawing.previewScene, timelineId, layer.id])
  const head = mode !== 'off' && model.context ? projectTrajectoryPosition(model.context, currentTimeMs) : null
  const pick = (node: TrajectoryNode, shift = false) => {
    const next = selectMotionNode(selection, node, shift)
    select(next); props.onSeek?.(node.timeMs)
    return next
  }
  const beginNode = (node: TrajectoryNode) => (event: React.PointerEvent<SVGGElement>) => {
    if (event.button !== 0 || editor.isTransactionActive()) return
    event.stopPropagation(); event.preventDefault()
    const next = pick(node, event.shiftKey)
    if (event.shiftKey || !model.capability.editable) return
    drag.begin(event, [node, ...model.nodes.filter(item => item.id !== node.id && isMotionNodeSelected(item, next))])
  }
  const place = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || !model.capability.editable || !canvasRef?.current || (mode !== 'add' && mode !== 'draw')) return
    event.preventDefault(); event.stopPropagation()
    try {
      const raw = motionPointerWorld(canvasRef.current, event.clientX, event.clientY), point = props.snapWorldPoint?.(raw) ?? raw
      if (mode === 'draw') drawing.add(point)
      else if (actions.apply(() => setTrajectoryPoint(editor.getScene(), { timelineId, layerId: layer.id, timeMs: currentTimeMs, worldPoint: point }))) {
        const step = stepUnit === 'frames' ? addStep * 1000 / Math.max(1, scene.composition.frameRate) : addStep
        if (Number.isFinite(step) && step > 0) props.onSeek?.(Math.min(model.durationMs, currentTimeMs + step))
      }
    } catch (error) { setWarning(error instanceof Error ? error.message : String(error)) }
  }
  const active = mode !== 'off', editable = model.capability.editable && !!canvasRef?.current
  const diagnostics = model.capability.diagnostics.map(item => item.message)
  const lines = preview?.segments ?? model.segments
  const controls = <div className="absolute left-2 top-2 z-[65] overflow-y-auto rounded-md border border-slate-600 bg-slate-900/95 p-2 text-white shadow-xl pointer-events-auto"
      style={{ maxWidth: 'min(720px, calc(100% - 16px))', maxHeight: 'calc(100% - 16px)' }}
      onPointerDown={event => event.stopPropagation()} onContextMenu={event => event.stopPropagation()} data-motion-controls>
      <MotionKeyToolbar mode={mode} onModeChange={changeMode} timelineId={timelineId} selectedCount={selectedNodes.length} editable={editable}
        duplicateMs={duplicateMs} onDuplicateMs={setDuplicateMs} onDuplicate={() => actions.duplicate(duplicateMs)} onDelete={actions.remove} />
      {active && <>
        <p className="mt-1 text-xs text-slate-300">{mode === 'draw' ? 'Place route points, set timing, then Apply. Source stays unchanged during preview.'
          : mode === 'add' ? `Click to set a position key at ${currentTimeMs.toFixed(2)} ms.` : 'Click a key to select and seek. Shift adds/removes; drag or use arrows to move selected keys.'}</p>
        {!!model.nodes.length && <label className="mt-2 flex items-center gap-2 text-xs text-slate-300">Key time
          <select aria-label="Select motion key time" className="max-w-64 rounded border border-slate-600 bg-slate-950 px-2 py-1 text-white"
            value={selectedNodes.length === 1 ? selectedNodes[0].id : ''} onChange={event => {
              const node = model.nodes.find(item => item.id === event.target.value)
              if (node) { select(new Set(node.keyIds)); props.onSeek?.(node.timeMs) }
            }}><option value="">Choose a key…</option>{model.nodes.map(node => <option key={node.id} value={node.id}>{node.timeMs.toFixed(2)} ms · {node.world.x.toFixed(1)}, {node.world.y.toFixed(1)}</option>)}</select>
        </label>}
        {mode === 'add' && <div className="mt-2 flex items-center gap-2 text-xs"><label>Advance after key
          <input aria-label="Motion key advance" type="number" min={0} step="any" value={addStep} onChange={event => setAddStep(Number(event.target.value))}
            className="ml-2 w-16 rounded border border-slate-600 bg-slate-950 px-1 py-1" /></label>
          <select aria-label="Motion key advance unit" value={stepUnit} onChange={event => setStepUnit(event.target.value as 'frames' | 'ms')}
            className="rounded border border-slate-600 bg-slate-950 px-1 py-1"><option value="frames">frames</option><option value="ms">ms</option></select></div>}
        {selectedNodes.length === 1 && mode === 'select' && <MotionKeyInspector node={selectedNodes[0]} durationMs={model.durationMs}
          disabled={!model.capability.editable} onApply={actions.numeric} />}
        {mode === 'draw' && <MotionDrawingPanel settings={drawing.settings} onChange={drawing.setSettings} pointCount={drawing.points.length}
          durationMs={model.durationMs} canApply={drawing.canApply} onApply={drawing.apply} onClear={drawing.clear} onCancel={cancel} />}
        {layer.followPath && <div className="mt-2 flex gap-2 text-xs">
          <button type="button" className="rounded border border-slate-500 px-2 py-1 disabled:opacity-40" disabled={!props.onEditPathSource}
            onClick={() => props.onEditPathSource?.(layer.followPath!.pathLayerId)}>Edit Path Source</button>
          <button type="button" className="rounded border border-slate-500 px-2 py-1 disabled:opacity-40" disabled={!props.onEditProgressTiming}
            onClick={() => props.onEditProgressTiming?.(layer.id)}>Edit Progress Timing</button></div>}
        {(warning || drawing.warning || diagnostics.length > 0) && <p role="status" className="mt-2 max-w-xl text-xs text-amber-300">
          {!model.capability.editable ? 'Read only. ' : ''}{[warning, drawing.warning, ...diagnostics].filter(Boolean).join(' ')}</p>}
      </>}
    </div>
  return <>
    {controlsHost ? createPortal(controls, controlsHost) : controls}
    {active && <svg className="absolute inset-0 z-40 overflow-visible" style={{ width: '100%', height: '100%',
      pointerEvents: mode === 'add' || mode === 'draw' ? 'auto' : 'none', cursor: mode === 'add' || mode === 'draw' ? 'crosshair' : undefined }}
      aria-label="Motion trajectory" data-testid="motion-input-surface" onPointerDown={place}>
      {lines.map((samples, index) => <polyline key={index} points={samples.map(sample => `${sample.world.x * zoom},${sample.world.y * zoom}`).join(' ')}
        fill="none" stroke={preview ? '#fbbf24' : '#7dd3fc'} strokeWidth={2} strokeDasharray={preview ? '5 3' : undefined} pointerEvents="none" />)}
      {drawing.points.map((point, index) => <circle key={`draft-${index}`} cx={point.x * zoom} cy={point.y * zoom} r={4} fill="#fbbf24" pointerEvents="none" />)}
      {model.nodes.map(node => <g key={node.id} data-motion-node-id={node.id} data-motion-time-ms={node.timeMs}
        transform={`translate(${node.world.x * zoom} ${node.world.y * zoom})`} role="button" tabIndex={mode === 'select' ? 0 : -1}
        aria-label={`Motion key ${node.timeMs.toFixed(2)} milliseconds`} aria-pressed={isMotionNodeSelected(node, selection)}
        style={{ pointerEvents: mode === 'select' ? 'all' : 'none', cursor: model.capability.editable ? 'grab' : 'pointer' }}
        onPointerDown={beginNode(node)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); pick(node, event.shiftKey) } }}>
        <title>{node.timeMs.toFixed(2)} ms · world {node.world.x.toFixed(2)}, {node.world.y.toFixed(2)}</title>
        <circle r={12} fill="transparent" />
        <rect x={isMotionNodeSelected(node, selection) ? -6 : -5} y={isMotionNodeSelected(node, selection) ? -6 : -5}
          width={isMotionNodeSelected(node, selection) ? 12 : 10} height={isMotionNodeSelected(node, selection) ? 12 : 10}
          transform="rotate(45)" fill={isMotionNodeSelected(node, selection) ? '#38bdf8' : '#0f172a'} stroke="#e0f2fe" strokeWidth={2} />
      </g>)}
      {head && <circle cx={head.world.x * zoom} cy={head.world.y * zoom} r={4} fill="#2563eb" stroke="white" strokeWidth={1.5} pointerEvents="none" />}
    </svg>}
  </>
}
