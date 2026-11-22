'use client'
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { Model3DData, Model3DResource } from '@/lib/model3d/types'
import type { ModelGizmo, ModelInspection, ModelResourceLookup, ModelSelection, ModelViewCamera } from '@/lib/model3d/inspection/types'
import { cameraGesture } from '@/lib/model3d/source/cameraGesture'
import { inspectionPointerMode, modelViewPreset, modelViewPresetForKey, type ModelViewPreset } from '@/lib/model3d/inspection/viewPresets'
import { PointerGestureSession } from '@/components/canvas/interactions/PointerGestureSession'
import { ModelGizmoSession } from './ModelGizmoSession'
import { ModelViewportTools } from './ModelViewportTools'
import { ModelSelectionControls, ModelSelectionRegion, type ModelSelectionStyle } from './ModelSelectionControls'
import { SelectionRegionSession } from '@/components/canvas/interactions/SelectionRegionSession'
import { selectionModeForModifiers, type SelectionMode, type SelectionRegion } from '@/lib/selection/selectionGesture'
import type { SelectionContainMode } from '@/lib/selection/canvasShapes'
import { modelSelectionFromKey, modelSelectionKey } from '@/lib/model3d/inspection/modelSelection'
import { ModelViewCube } from './ModelViewCube'
import { modelViewportToolForKey, type ModelViewportTool } from '@/lib/model3d/inspection/viewportTools'
import { transformSelection, type ModelAxis, type ModelTransformTool } from '@/lib/model3d/inspection/transformSelection'
import { PRIMITIVE_SELECTION_INSTANCE, type PrimitiveKind } from '@/lib/model3d/modeling/poly/primitiveSource'
import type { ModelWorkspace } from './modelWorkspaces'
import type { ModelClipEditor } from '../ModelContentTimeline'
import { panCamera, rollCamera, zoomCamera } from '@/lib/model3d/inspection/cameraNavigation'
import { formatModelLength, modelMeasurement, type ModelMeasurementSettings } from '@/lib/model3d/measurement/modelMeasurement'
import { visibleGridStep } from '@/lib/model3d/measurement/gridSpacing'
import { ModelViewportSettings } from './ModelViewportSettings'
import { ModelAddMenu, type ModelAddAsset } from './ModelAddMenu'
import { ModelTransformOverlay } from './ModelTransformOverlay'
import { viewportFrameSize, type ViewportFrame } from '@/lib/model3d/inspection/viewportFrame'
import type { PolyEditSelection, PolyProjection } from '@/lib/model3d/modeling/poly/editSelection'
import { primitiveMeshSnapshot } from '@/lib/model3d/modeling/poly/meshSnapshot'
import { ModelPolyOverlay } from './ModelPolyOverlay'
import { SCENE_OBJECT_SELECTION_INSTANCE, viewFromCamera } from '@/lib/model3d/source/modelSceneObjects'
/** Model-only inspection surface inside the common shell. View camera/selection
 * are ephemeral. Only the explicit Use view action commits an authored camera.
 * All pointer owners are disposed on scope change/unmount; no playback rAF here. */
export function ModelViewport({ model, resource, lookup, selection, selections, isolated, onSelect, onSelectMany, camera, onCamera, onUseView, workspace,
  onMeasurementChange, sourceDisabled, onSelectAll, onDeleteSelected, onOpenContextMenu,
  addAssets, candidate, onCandidate, canAddPrimitive, canAddModel, canAddSceneObject, onAddPrimitive, onAddModel, onAddCamera, onAddLight, editSelection, onEditPick, onExitEditMode, outputAspect = 1 }: {
  model: ModelClipEditor; resource?: Model3DResource; lookup: ModelResourceLookup; selection?: ModelSelection; selections: readonly ModelSelection[]; isolated?: readonly ModelSelection[];
  onSelect(s?: ModelSelection, mode?: SelectionMode): void; onSelectMany(s: readonly ModelSelection[], mode: SelectionMode): void;
  camera: ModelViewCamera; onCamera(c: ModelViewCamera): void; onUseView(camera: ModelViewCamera): void; workspace: ModelWorkspace
  onMeasurementChange(patch: Partial<ModelMeasurementSettings>): void; sourceDisabled: boolean; outputAspect?: number
  onSelectAll(): void; onDeleteSelected(): void; onOpenContextMenu(target: ModelSelection | undefined, x: number, y: number): void
  addAssets: readonly ModelAddAsset[]; canAddPrimitive: boolean; canAddModel: boolean; canAddSceneObject: boolean
  candidate: string; onCandidate(id: string): void
  onAddPrimitive(kind: PrimitiveKind): void; onAddModel(assetId: string): void
  onAddCamera(projection: 'perspective' | 'orthographic'): void; onAddLight(kind: 'directional' | 'point' | 'spot'): void
  editSelection?: PolyEditSelection; onEditPick?(ids: readonly string[], mode: SelectionMode): void
  onExitEditMode?(): void
}) {
  const canvas = useRef<HTMLCanvasElement>(null), host = useRef<HTMLDivElement>(null), area = useRef<HTMLDivElement>(null), addHost = useRef<HTMLDivElement>(null), latest = useRef(model)
  latest.current = model
  const [areaSize, setAreaSize] = useState({ width: 600, height: 400 }), [gizmo, setGizmo] = useState<ModelGizmo | null>(null), [error, setError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false), [showAdd, setShowAdd] = useState(false), [showGrid, setShowGrid] = useState(true)
  const [cameraPreview, setCameraPreview] = useState('inspection')
  const [safeArea, setSafeArea] = useState(false), [frameShape, setFrameShape] = useState<ViewportFrame>('fill')
  const [clipNear, setClipNear] = useState(.001), [clipFar, setClipFar] = useState(10000)
  const [hoveredAxis, setHoveredAxis] = useState<ModelAxis | null>(null), [activeAxis, setActiveAxis] = useState<ModelAxis | null>(null)
  const size = viewportFrameSize(areaSize.width, areaSize.height, frameShape, outputAspect)
  const [tool, setTool] = useState<ModelViewportTool>('select')
  const [selectionStyle, setSelectionStyle] = useState<ModelSelectionStyle>('box'), [containment, setContainment] = useState<SelectionContainMode>('touching')
  const [selectionRegion, setSelectionRegion] = useState<SelectionRegion | null>(null)
  const [polyProjection, setPolyProjection] = useState<PolyProjection | null>(null)
  const gesture = useRef<{ dispose?(): void; cancel(...args: never[]): void } | null>(null)
  const nativeGesture = useRef<{ start: ModelViewCamera } | null>(null)
  const currentCamera = useRef(camera), currentOnCamera = useRef(onCamera)
  const data = model.previewLayer.model3d!, measurement = modelMeasurement(data)
  const previewSource = data.sceneObjects?.objects.find(object => object.kind === 'camera' && object.id === cameraPreview)
  const viewedCamera = previewSource?.kind === 'camera' ? viewFromCamera(previewSource) : camera
  currentCamera.current = viewedCamera; currentOnCamera.current = onCamera
  const emitCamera = (next: ModelViewCamera) => { currentCamera.current = next; setCameraPreview('inspection'); currentOnCamera.current(next) }
  const gridVisible = workspace !== 'render' && showGrid
  const view: ModelInspection = { camera: viewedCamera, selection, selections, isolated, showGrid: gridVisible, grid: measurement, clipNear, clipFar }
  useEffect(() => {
    if (!showAdd) return
    const outside = (event: globalThis.PointerEvent) => { if (!addHost.current?.contains(event.target as Node)) setShowAdd(false) }
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') { setShowAdd(false); addHost.current?.querySelector<HTMLButtonElement>('[aria-label="Add 3D object"]')?.focus() } }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [showAdd])
  useEffect(() => {
    const observer = new ResizeObserver(entries => { const r = entries[0].contentRect; setAreaSize({ width: Math.max(1, r.width), height: Math.max(1, r.height) }) })
    if (area.current) observer.observe(area.current)
    return () => { observer.disconnect(); gesture.current?.cancel(); gesture.current?.dispose?.(); nativeGesture.current = null }
  }, [])
  useEffect(() => {
    const element = canvas.current
    if (!element) return
    // Safari exposes trackpad pinch/rotate as GestureEvent. Other desktop
    // browsers commonly deliver pinch as Ctrl+wheel.
    const start = (event: Event) => { if (!resource) return; event.preventDefault(); nativeGesture.current = { start: currentCamera.current }; host.current?.focus({ preventScroll: true }) }
    const change = (event: Event) => {
      const state = nativeGesture.current, value = event as Event & { scale?: number; rotation?: number }
      if (!state) return
      event.preventDefault()
      emitCamera(rollCamera(zoomCamera(state.start, value.scale ?? 1), value.rotation ?? 0))
    }
    const end = (event: Event) => { if (nativeGesture.current) event.preventDefault(); nativeGesture.current = null }
    const wheel = (event: WheelEvent) => {
      if (!resource) return
      event.preventDefault()
      if (nativeGesture.current) return
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.height : 1
      const current = currentCamera.current
      if (!event.ctrlKey && event.shiftKey) {
        const dx = event.deltaX || event.deltaY
        const dy = event.deltaX ? event.deltaY : 0
        emitCamera(panCamera(current, -dx * unit, -dy * unit, size.height))
      }
      else emitCamera(zoomCamera(current, Math.exp(-event.deltaY * unit * .001)))
    }
    element.addEventListener('gesturestart', start, { passive: false })
    element.addEventListener('gesturechange', change, { passive: false })
    element.addEventListener('gestureend', end, { passive: false })
    element.addEventListener('wheel', wheel, { passive: false })
    return () => { element.removeEventListener('gesturestart', start); element.removeEventListener('gesturechange', change); element.removeEventListener('gestureend', end); element.removeEventListener('wheel', wheel) }
  }, [resource, size.height])
  useEffect(() => {
    const element = canvas.current, ctx = element?.getContext('2d')
    if (!element || !ctx || !resource) return
    const ratio = Math.min(devicePixelRatio || 1, 2048 / Math.max(size.width, size.height))
    element.width = Math.ceil(size.width * ratio); element.height = Math.ceil(size.height * ratio)
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, size.width, size.height)
    try {
      resource.draw(ctx, data, size.width, size.height, lookup, view)
      setGizmo(editSelection?.mode !== 'object' && editSelection ? null : resource.inspector?.gizmo(data, size.width, size.height, view, lookup) ?? null)
      setPolyProjection(editSelection ? resource.inspector?.poly?.project(data, editSelection.objectId, size.width, size.height, view, lookup) ?? null : null)
      setError(null)
    }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); setGizmo(null); setPolyProjection(null) }
  }, [resource, data, size.width, size.height, viewedCamera, selection, selections, isolated, lookup, workspace, showGrid, clipNear, clipFar, editSelection?.objectId, editSelection?.mode])
  const frame = () => {
    try { const result = resource?.inspector?.frame(data, view, lookup); if (result) emitCamera({ ...viewedCamera, targetX: result.target.x, targetY: result.target.y, targetZ: result.target.z, distance: result.distance, orthoHeight: result.orthoHeight }) }
    catch (failure) { setError(String(failure)) }
  }
  const preset = (name: ModelViewPreset) => emitCamera(modelViewPreset(viewedCamera, name))
  const chooseTool = (next: ModelViewportTool) => { gesture.current?.cancel(); gesture.current = null; setTool(next); host.current?.focus({ preventScroll: true }) }
  const transformTool: ModelTransformTool | null = tool === 'move' || tool === 'rotate' || tool === 'scale' ? tool : tool === 'select' ? 'move' : null
  const primitive = selection?.instanceId === PRIMITIVE_SELECTION_INSTANCE
  const nudge = (axis: ModelAxis, event: KeyboardEvent<HTMLButtonElement>) => {
    if (!transformTool || !selection) return
    const direction = event.key === 'ArrowUp' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowDown' || event.key === 'ArrowLeft' ? -1 : 0
    if (!direction) return
    event.preventDefault(); event.stopPropagation()
    const delta = transformTool === 'move' ? direction * .1 : transformTool === 'rotate' ? direction * 15 : direction > 0 ? 1.05 : 1 / 1.05
    try { model.playback.handlePause(); model.updateLayer({ ...model.previewLayer, model3d: transformSelection(data, selection, transformTool, axis, delta) }); setError(null) }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
  }
  const beginGizmo = (axis: ModelAxis, projected: ModelGizmo, event: ReactPointerEvent<Element>) => {
    if (event.button || !selection || !transformTool || selection.instanceId !== SCENE_OBJECT_SELECTION_INSTANCE && !data.content || gesture.current) return
    event.preventDefault(); event.stopPropagation(); setActiveAxis(axis); setHoveredAxis(axis)
    gesture.current = new ModelGizmoSession({ pointerId: event.pointerId, currentTarget: event.currentTarget, clientX: event.clientX, clientY: event.clientY },
      model, () => latest.current, selection, transformTool, axis, projected, () => { gesture.current = null; setActiveAxis(null) })
  }
  return <div className="flex flex-col flex-1 min-h-0 min-w-0">
    <ModelViewportTools tool={tool} onChange={chooseTool}>
      {tool === 'select' && <ModelSelectionControls style={selectionStyle} onStyle={setSelectionStyle} containment={containment} onContainment={setContainment} />}
    </ModelViewportTools>
    <div ref={area} className="relative flex-1 min-h-48 min-w-0 overflow-hidden bg-[#080f1c]">
    <div ref={host} className="absolute overflow-hidden bg-gray-900 outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
      style={{ width: size.width, height: size.height, left: (areaSize.width - size.width) / 2, top: (areaSize.height - size.height) / 2 }}
      onContextMenu={e => e.preventDefault()} tabIndex={0}
      onKeyDown={e => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Escape' && editSelection) { e.preventDefault(); onExitEditMode?.(); return }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); if (!editSelection || editSelection.mode === 'object') onSelectAll(); else {
          const object = data.modeling?.objects.find(value => value.id === editSelection.objectId)
          if (object) { const mesh = primitiveMeshSnapshot(object.geometry); onEditPick?.(editSelection.mode === 'vertex' ? mesh.vertices.map(v => v.id)
            : editSelection.mode === 'edge' ? mesh.edges.map(edge => edge.id) : editSelection.mode === 'border' ? mesh.edges.filter(edge => edge.halfEdgeIds.length === 1).map(edge => edge.id)
              : mesh.faces.map(face => face.id), 'replace') }
        } return }
        if ((e.key === 'Delete' || e.key === 'Backspace') && !sourceDisabled && selections.length) { e.preventDefault(); if (!editSelection) onDeleteSelected(); return }
        if (e.key === 'ContextMenu' || e.shiftKey && e.key === 'F10') {
          e.preventDefault(); const rect = e.currentTarget.getBoundingClientRect()
          onOpenContextMenu(selection, rect.left + 24, rect.top + 24); return
        }
        if (e.altKey || e.ctrlKey || e.metaKey) return
        const nextTool = modelViewportToolForKey(e.key)
        if (nextTool) { e.preventDefault(); e.stopPropagation(); chooseTool(nextTool); return }
        const action = modelViewPresetForKey(e.key)
        if (!action) return
        e.preventDefault(); e.stopPropagation(); action === 'frame' ? frame() : preset(action)
      }}>
      <canvas ref={canvas} id="model-detail-canvas" aria-label="3D model view" className={`absolute inset-0 w-full h-full touch-none ${tool === 'pan' ? 'cursor-grab' : tool === 'orbit' ? 'cursor-move' : 'cursor-default'}`} onPointerDown={e => {
        if (!resource || gesture.current) return
        e.preventDefault(); host.current?.focus({ preventScroll: true })
        const start = { x: e.clientX, y: e.clientY }, bounds = e.currentTarget.getBoundingClientRect(), original = currentCamera.current
        if (!editSelection && tool === 'select' && e.button === 0) {
          const mode = selectionModeForModifiers(e)
          const hit = resource.inspector?.pick(data, e.clientX - bounds.left, e.clientY - bounds.top, size.width, size.height, view, lookup)
          if (!hit) {
            gesture.current = new SelectionRegionSession(start, selectionStyle, mode, {
              eventTarget: window, world: point => ({ x: point.x - bounds.left, y: point.y - bounds.top }),
              current: () => latest.current.previewLayer.model3d === data && currentCamera.current === viewedCamera,
              query: region => new Set((resource.inspector?.selectRegion(data, region, containment, size.width, size.height, view, lookup) ?? []).map(modelSelectionKey)),
              show: setSelectionRegion,
              select: (keys, selectionMode) => onSelectMany(Array.from(keys, modelSelectionFromKey), selectionMode),
              closed: () => { gesture.current = null },
            }, { pointerId: e.pointerId, currentTarget: e.currentTarget })
            return
          }
        }
        const mode = e.button === 0 && !e.shiftKey && !e.altKey && !e.ctrlKey
          ? tool === 'pan' ? 'pan' : tool === 'orbit' ? 'orbit' : null
          : inspectionPointerMode(e.button, e.shiftKey, e.altKey, e.ctrlKey)
        let moved = false
        const move = (x: number, y: number) => {
          const dx = x - start.x, dy = y - start.y; if (Math.hypot(dx, dy) < 3 && !moved) return
          moved = true
          if (!mode) return
          const next = cameraGesture({ ...data, camera: original } as Model3DData, dx, dy, mode).camera
          emitCamera({ ...original, ...next })
        }
        gesture.current = new PointerGestureSession({ eventTarget: window, move: p => move(p.clientX, p.clientY),
          up: p => {
            move(p.clientX, p.clientY)
            if (!moved && e.button === 0 && tool !== 'pan' && tool !== 'orbit') {
              if (editSelection && editSelection.mode !== 'object') {
                const id = resource.inspector?.poly?.pick(data, editSelection.objectId, editSelection.mode, p.clientX - bounds.left, p.clientY - bounds.top, size.width, size.height, view, lookup)
                onEditPick?.(id ? [id] : [], selectionModeForModifiers(e))
              } else if (!editSelection) onSelect(resource.inspector?.pick(data, p.clientX - bounds.left, p.clientY - bounds.top, size.width, size.height, view, lookup) ?? undefined, selectionModeForModifiers(e))
            }
            if (!moved && e.button === 2) onOpenContextMenu(resource.inspector?.pick(data, p.clientX - bounds.left, p.clientY - bounds.top, size.width, size.height, view, lookup) ?? undefined, p.clientX, p.clientY)
            gesture.current = null
          },
          cancel: () => { emitCamera(original); gesture.current = null }, error: failure => setError(String(failure)), diagnostics: { owner: 'model3d.inspection' },
        }, { pointerId: e.pointerId, currentTarget: e.currentTarget, button: e.button })
      }} />
      <ModelSelectionRegion region={selectionRegion} width={size.width} height={size.height} />
      {editSelection && data.modeling?.objects.find(object => object.id === editSelection.objectId) && <ModelPolyOverlay
        mesh={primitiveMeshSnapshot(data.modeling.objects.find(object => object.id === editSelection.objectId)!.geometry)}
        projection={polyProjection} selection={editSelection} width={size.width} height={size.height} />}
      {gizmo && selection && <ModelTransformOverlay gizmo={gizmo} camera={viewedCamera} tool={transformTool} primitive={primitive}
        canTransform={!!transformTool && (!!data.content || selection.instanceId === SCENE_OBJECT_SELECTION_INSTANCE)} width={size.width} height={size.height} hoveredAxis={hoveredAxis} activeAxis={activeAxis}
        onHover={setHoveredAxis} onBegin={beginGizmo} onNudge={nudge} />}
      {safeArea && <div className="pointer-events-none absolute z-[5] inset-[5%] border border-dashed border-slate-100/70" aria-label="90 percent camera safe area" />}
      <ModelViewCube camera={viewedCamera} onCamera={emitCamera} />
      <div ref={addHost} className="absolute left-2 top-2 z-20 flex flex-col gap-1" role="toolbar" aria-label="Viewport menu">
        <button type="button" aria-label="Add 3D object" title="Add 3D object" aria-expanded={showAdd} aria-controls="model3d-add-menu"
          className="flex h-8 w-8 items-center justify-center rounded border border-slate-500 bg-slate-900/90 text-white hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-cyan-300"
          onClick={() => { setShowSettings(false); setShowAdd(value => !value) }}><AddObjectIcon /></button>
        <button type="button" aria-label="Viewport settings" title="Viewport settings" aria-expanded={showSettings} aria-controls="model3d-viewport-settings"
          className="flex h-8 w-8 items-center justify-center rounded border border-slate-500 bg-slate-900/90 text-white hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-cyan-300"
          onClick={() => { setShowAdd(false); setShowSettings(value => !value) }}><SettingsIcon /></button>
        {showAdd && <div id="model3d-add-menu"><ModelAddMenu assets={addAssets} candidate={candidate} onCandidate={onCandidate}
          canAddPrimitive={canAddPrimitive} canAddModel={canAddModel} canAddSceneObject={canAddSceneObject} viewportWidth={size.width}
          onAddPrimitive={kind => { try { onAddPrimitive(kind); setShowAdd(false); setError(null) } catch (failure) { setError(String(failure)) } }}
          onAddModel={id => { try { onAddModel(id); setShowAdd(false); setError(null) } catch (failure) { setError(String(failure)) } }}
          onAddCamera={projection => { try { onAddCamera(projection); setShowAdd(false); setError(null) } catch (failure) { setError(String(failure)) } }}
          onAddLight={kind => { try { onAddLight(kind); setShowAdd(false); setError(null) } catch (failure) { setError(String(failure)) } }} /></div>}
      </div>
      {showSettings && <div id="model3d-viewport-settings"><ModelViewportSettings settings={measurement} showGrid={showGrid} gridAvailable={workspace !== 'render'} onShowGrid={setShowGrid}
        onChange={onMeasurementChange} disabled={sourceDisabled || !resource?.inventory}
        cameraPreview={cameraPreview} onCameraPreview={setCameraPreview} cameras={data.sceneObjects?.objects.filter(object => object.kind === 'camera') ?? []}
        safeArea={safeArea} onSafeArea={setSafeArea}
        clipNear={clipNear} clipFar={clipFar} onClipNear={setClipNear} onClipFar={setClipFar}
        frame={frameShape} onFrame={setFrameShape} onUseView={() => onUseView(viewedCamera)} onFrameSelection={frame} /></div>}
      {gridVisible && <p aria-label="Visible grid spacing" className="pointer-events-none absolute bottom-2 left-2 rounded bg-gray-950/85 px-2 py-1 text-xs text-slate-200">
        1 major square = {formatModelLength(visibleGridStep(viewedCamera, size.width, size.height, measurement.gridBaseMeters), measurement)}
      </p>}
      {!resource && <p className="absolute top-4 left-4 text-sm text-gray-400">Preparing 3D source…</p>}
      {error && <p role="alert" className="absolute bottom-2 left-2 right-2 text-xs text-amber-200 bg-gray-950 p-2">{error}</p>}
    </div>
    </div>
  </div>
}

/** Cube with a small plus marks creation of a scene object. */
function AddObjectIcon() {
  return <svg aria-hidden="true" width="19" height="19" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 2 7 4v6M9 2 2 6v8l7 4 4-2M2 6l7 4 7-4M9 10v8" />
    <path d="M16 13v6m-3-3h6" stroke="#67e8f9" strokeWidth="1.8" />
  </svg>
}

/** Compact settings glyph below the viewport's Add object control. */
function SettingsIcon() {
  return <svg aria-hidden="true" width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8.5 2h3l.5 2 1.6.7 1.8-1 2.1 2.1-1 1.8.7 1.6 2 .5v3l-2 .5-.7 1.6 1 1.8-2.1 2.1-1.8-1-1.6.7-.5 2h-3l-.5-2-1.6-.7-1.8 1-2.1-2.1 1-1.8-.7-1.6-2-.5v-3l2-.5.7-1.6-1-1.8 2.1-2.1 1.8 1L8 4l.5-2Z" />
    <circle cx="10" cy="10" r="2.5" />
  </svg>
}
