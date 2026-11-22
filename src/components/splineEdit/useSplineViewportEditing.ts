'use client'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { ChronoScene, Layer } from '@/lib/types'
import type { OverrideMap } from '@/lib/evaluator'
import type { ShortcutContext } from '@/lib/shortcuts'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { pickSplineElement, splineIdsInRegion, type SplinePick } from '@/lib/spline/selection'
import type { SelectionRegion } from '@/lib/selection/selectionGesture'
import { splineSelectionPoints, splineSelectionPivot, transformSplineSelection } from '@/lib/spline/selection'
import { drivenSplineTransformReason } from '@/lib/spline/edit/authoringGuard'
import { drivenSplineEditReason, editableSplineLayer } from '@/lib/spline/edit/authoringGuard'
import { splineTopologyCommand } from '@/lib/editor/spline/topologyCommand'
import { resolveSplineEditGeometry } from '../canvas/splineEditGeometry'
import type { UseCanvasDragReturn } from '../canvas/hooks/useCanvasDrag'
import { hasVisibleKeyboardScope } from '@/lib/shortcuts/keyboardScope'
import type { SplineEditController } from './useSplineEditSelection'
import { splineEditCommand } from './commands'
import { hitTestLayersAt } from '@/lib/renderer'
import { useSplineAttachPicking } from './useSplineAttachPicking'

interface Options {
  controller: SplineEditController; layer: Layer | null | undefined; scene: ChronoScene; editor: EditorStateReturn
  canvasRef: RefObject<HTMLCanvasElement>; overrides?: OverrideMap; timeMs: number; zoom: number
  enabled: boolean; panMode: boolean; toolMode?: string; containment: 'inside' | 'touching'
  drag: Pick<UseCanvasDragReturn, 'dragRef' | 'startDrag'>
  isSelecting?: () => boolean
  getContext?: () => ShortcutContext
  warning(message: string): void
}
export interface SplineMenuState { x: number; y: number; target: SplinePick | null }
/** Browser interaction adapter for one layer's sub-object context. Point drags
 * reuse CanvasDragSession and its source/document/terminal-event protection.
 * Edge/Object picking never falls through to root movement. The existing region
 * session is supplied this adapter's query; no second pointer listener owner is
 * introduced. Add Spline consumes existing-layer picks through the shared
 * topology action owner, one guarded Attach/Undo per source; it never draws or
 * starts a transform/region. Pan/hidden/detail/timeline scopes cannot edit source. */
export function useSplineViewportEditing(options: Options) {
  const latest = useRef(options); latest.current = options
  const { controller, layer, scene, timeMs, overrides } = options
  const [hover, setHover] = useState<SplinePick | null>(null)
  const [menu, setMenu] = useState<SplineMenuState | null>(null)
  const selected = controller.active && controller.layerId === layer?.id
  const active = selected && options.enabled
  const geometry = useMemo(() => layer ? resolveSplineEditGeometry(layer, scene, timeMs, overrides) : null, [layer, scene, timeMs, overrides])
  const canPick = active && !options.panMode && options.toolMode !== 'pan' && !!geometry
  const writable = !!layer && !layer.hidden && !layer.locked && !layer.frozen && !layer.instanceOf
  const attachPick = useSplineAttachPicking({ layer, controller, getScene: options.editor.getScene,
    dispatch: options.editor.dispatchCommand, timeMs, overrides, disabled: !canPick || !writable,
    isTransactionActive: options.editor.isTransactionActive, warning: options.warning })
  useEffect(() => { if (controller.attaching && (!canPick || !writable)) controller.setAttaching(false) }, [controller.attaching, controller.setAttaching, canPick, writable])
  useEffect(() => { setHover(null); setMenu(null) }, [controller.layerId, controller.active, controller.mode, controller.attaching, options.enabled, options.panMode, timeMs, options.editor.getDocumentSignal()])
  // Returning from drawing re-enables picking. Keep its rejection visible;
  // only a new edit context/frame clears it, never an enabled-state handover.
  useEffect(() => { options.warning('') }, [controller.layerId, controller.active, controller.mode, options.panMode, timeMs, options.editor.getDocumentSignal()])
  const pick = (x: number, y: number) => canPick && !controller.attaching && geometry ? pickSplineElement(geometry.worldSpline, controller.mode, x, y, 8 / options.zoom) : null
  const selectTarget = (target: SplinePick, toggle: boolean) => {
    const id = target.kind === 'handle' ? target.pointId : target.id
    if (toggle || !controller.ids.includes(id)) controller.select([id], toggle ? 'toggle' : 'replace')
    return id
  }
  /** Body and axis controls share the same validated native geometry gesture;
   * constraints are world axes, converted through the complete parent inverse. */
  const beginGeometry = (pointIds: ReadonlySet<string>, operation: 'move' | 'rotate' | 'scale',
    start: { x: number; y: number }, event: React.PointerEvent, axisLock: 'x' | 'y' | null = null) => {
    if (!canPick || !writable || !geometry || !layer?.spline || options.drag.dragRef.current || options.editor.isTransactionActive()) return
    try {
      editableSplineLayer(scene, layer.id)
      const reason = drivenSplineTransformReason(layer, scene, pointIds)
      if (reason) throw new Error(reason)
      const pivot = splineSelectionPivot(layer.spline, pointIds), startLocal = geometry.worldToLocal.applyToPoint(start)
      if (!pivot || operation !== 'move' && Math.hypot(startLocal.x - pivot.x, startLocal.y - pivot.y) < 1e-6) return
      options.editor.beginTransaction()
      options.drag.dragRef.current = { kind: 'splineGeometry', layerId: layer.id, originalLayer: layer, pointIds: Array.from(pointIds),
        operation, axisLock, startClientX: event.clientX, startClientY: event.clientY, startLocal, pivot, worldToLocal: geometry.worldToLocal }
      options.drag.startDrag(event)
    } catch (error) { options.warning(error instanceof Error ? error.message : String(error)) }
  }
  const pointerDown = (x: number, y: number, event: React.PointerEvent): boolean => {
    if (!canPick) return false
    if (controller.attaching) {
      event.preventDefault(); event.stopPropagation()
      // Skip the target in ordered body hits so overlapping source splines
      // remain pickable without changing hierarchy, visibility or overrides.
      const source = options.editor.getScene()
      const hit = hitTestLayersAt(source, timeMs, x, y, overrides).find(id => id !== layer!.id)
      attachPick(hit ?? null)
      return true
    }
    const target = pick(x, y)
    if (!target) return false // Host starts a sub-object region, never root drag.
    event.preventDefault(); event.stopPropagation()
    const toggle = event.shiftKey || event.ctrlKey || event.metaKey || event.altKey
    const id = selectTarget(target, toggle)
    if (event.altKey) { controller.select([id], 'subtract'); return true }
    if (toggle || !writable || !geometry || !layer?.spline) return true
    if (!['select', 'move', 'pen', 'rotate', 'scale', undefined].includes(options.toolMode)) return true
    if (target.kind === 'edge' || target.kind === 'object' || ['rotate', 'scale'].includes(options.toolMode ?? '')) {
      const selectedIds = controller.ids.includes(id) ? controller.ids : [id]
      const pointIds = splineSelectionPoints(layer.spline, controller.mode, selectedIds)
      beginGeometry(pointIds, options.toolMode === 'rotate' ? 'rotate' : options.toolMode === 'scale' ? 'scale' : 'move', { x, y }, event)
      return true
    }
    const ids = target.kind === 'point' && controller.ids.includes(id) ? controller.ids : [id]
    const reason = target.kind === 'handle' ? drivenSplineEditReason(layer, scene, 'handles', target.id)
      : ids.map(point => drivenSplineEditReason(layer, scene, 'points', point)).find(Boolean)
    if (reason) { options.warning(reason); return true }
    const source = target.kind === 'handle' ? layer.spline.handles[target.id] : layer.spline.points[id]
    if (!source) return true
    options.editor.beginTransaction()
    const base = { layerId: layer.id, originalLayer: layer, startClientX: event.clientX, startClientY: event.clientY,
      startX: source.x, startY: source.y, worldToLocal: geometry.worldToLocal }
    options.drag.dragRef.current = target.kind === 'handle'
      ? { ...base, kind: 'splineHandle', pointId: target.pointId, handleKind: target.handleKind }
      : { ...base, kind: 'splinePoint', pointId: id, pointIds: ids }
    options.drag.startDrag(event)
    return true
  }
  const contextMenu = (x: number, y: number, event: React.MouseEvent): boolean => {
    if (!canPick) return false
    if (controller.attaching) {
      event.preventDefault(); event.stopPropagation(); controller.setAttaching(false); return true
    }
    const target = pick(x, y)
    event.preventDefault(); event.stopPropagation()
    if (target) selectTarget(target, false)
    setMenu({ x: event.clientX, y: event.clientY, target })
    return true
  }
  /** Query is captured by the host's single region gesture. World geometry and
   * the selected edit mode are pinned at its start, not replaced mid-drag. */
  const query = (region: SelectionRegion): Set<string> => geometry ? splineIdsInRegion(geometry.worldSpline, controller.mode, region, options.containment) : new Set()
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const current = latest.current, edit = current.controller
      const target = event.target instanceof Element ? event.target : null
      if (!edit.active || !current.enabled || current.isSelecting?.() || current.editor.isTransactionActive() || hasVisibleKeyboardScope()
        || current.canvasRef.current?.closest('[inert]') || target?.closest('input,textarea,select,[contenteditable=true],[data-editor-input-scope]')
        || current.getContext && current.getContext() !== 'canvas') return
      const navigation = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
      const sourceAction = (event.ctrlKey || event.metaKey) && ['d', 'c', 'v', 'x', 'g'].includes(event.key.toLowerCase())
      if (!['Escape', 'Delete', 'Backspace'].includes(event.key) && !navigation && !sourceAction) return
      event.preventDefault(); event.stopImmediatePropagation()
      if (event.key === 'Escape') { if (edit.attaching) edit.setAttaching(false); else if (edit.ids.length) edit.clear(); else edit.exit(); return }
      if (edit.attaching) { current.warning('Finish Add Spline before editing the selection.'); return }
      if (current.panMode || current.toolMode === 'pan' || sourceAction) { current.warning('This sub-object action is unavailable. Choose Done to use layer commands.'); return }
      if (!edit.ids.length || !current.layer) return
      const delta = event.shiftKey ? 10 : 1
      const dx = event.key === 'ArrowLeft' ? -delta : event.key === 'ArrowRight' ? delta : 0
      const dy = event.key === 'ArrowUp' ? -delta : event.key === 'ArrowDown' ? delta : 0
      try {
        const source = current.editor.getScene()
        const points = splineSelectionPoints(current.layer.spline!, edit.mode, edit.ids)
        // Keyboard deletion uses the same mode-aware owner as Selection actions;
        // an Object/Edge Delete must never fall through to deleting the root.
        const command = navigation ? splineEditCommand(source, current.layer.id, { kind: 'geometry', ids: Array.from(points) },
          data => transformSplineSelection(data, points, { x: dx, y: dy }), 'Nudge spline selection')
          : splineTopologyCommand(source, current.layer.id, edit.mode, edit.ids, { kind: 'delete' }, current.timeMs, current.overrides).command
        if (command) current.editor.dispatchCommand(command)
      } catch (error) { current.warning(error instanceof Error ? error.message : String(error)) }
    }
    window.addEventListener('keydown', keydown, true)
    return () => window.removeEventListener('keydown', keydown, true)
  }, [])
  const movePoints = layer?.spline ? splineSelectionPoints(layer.spline, controller.mode, controller.ids) : new Set<string>()
  const movePivot = canPick && writable && !controller.attaching && ['select', 'move', undefined].includes(options.toolMode)
    && geometry ? splineSelectionPivot(geometry.worldSpline, movePoints) : null
  const moveGizmo = movePivot ? { point: movePivot, start: (axis: 'x' | 'y' | null) => (event: React.PointerEvent) => {
    if (event.button !== 0) return
    event.preventDefault(); event.stopPropagation()
    const canvas = options.canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    beginGeometry(movePoints, 'move', { x: (event.clientX - rect.left) * scene.composition.width / rect.width,
      y: (event.clientY - rect.top) * scene.composition.height / rect.height }, event, axis)
  } } : null
  return { active, selected, canPick, moveGizmo, hover: canPick ? hover : null, menu, closeMenu: () => setMenu(null), pointerDown, contextMenu, query,
    hoverAt: (x: number, y: number) => setHover(pick(x, y)), clearHover: () => setHover(null) }
}
