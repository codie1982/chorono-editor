import { useEffect, useRef, useState, type RefObject } from 'react'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { TrajectoryModel, TrajectoryNode, TrajectoryHit, MotionCurveHandle } from '@/lib/timeline/trajectory'
import { hitTrajectory, projectTrajectoryPosition } from '@/lib/timeline/trajectory'
import { moveTrajectoryHandle, setTrajectoryPoint, setTrajectorySegmentEasing, setTrajectoryNodeCurve, type TrajectoryEditResult } from '@/lib/timeline/trajectory/commands'
import type { MenuItem } from '@/components/ui/ContextMenu'
import { canvasPointerWorld } from '../interactions/canvasCoordinates'
import { MotionKeyDragSession } from './MotionKeyDragSession'

interface Options {
  model: TrajectoryModel; editor: EditorStateReturn; canvasRef?: RefObject<HTMLCanvasElement>; zoom: number; enabled: boolean
  onSelect: (ids: Set<string>) => void; onSeek?: (timeMs: number) => void; onWarning: (message: string) => void
}

/** UI adapter over native trajectory commands. Hover/menu are transient; every
 * gesture freezes one source baseline and uses the shared release/cancel owner.
 * Local key times/IDs are never inferred from rounded labels. Pan/unmount or a
 * changed Timeline/layer cancels capture before any source can be committed. */
export function useMotionCurveEditing(options: Options) {
  const latest = useRef(options); latest.current = options
  const [hover, setHover] = useState<TrajectoryHit | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; hit?: TrajectoryHit; node?: TrajectoryNode } | null>(null)
  const session = useRef<MotionKeyDragSession | null>(null), { model } = options
  const signal = options.editor.getDocumentSignal()
  useEffect(() => {
    setHover(null); setMenu(null)
    return () => { session.current?.cancel(false, 'motion-curve-scope-change'); session.current = null }
  }, [model.timelineId, model.layerId, options.enabled, signal])
  /** Apply one prepared edit and publish only native directly addressed keys. */
  const apply = (prepare: () => TrajectoryEditResult, time?: number) => {
    try {
      const result = prepare(); if (result.command) options.editor.dispatchCommand(result.command)
      options.onSelect(new Set(result.selectedIds)); if (time != null) options.onSeek?.(time)
      if (result.diagnostics.length) options.onWarning(result.diagnostics.join(' '))
    } catch (error) { options.onWarning(error instanceof Error ? error.message : String(error)) }
    setMenu(null)
  }
  const scope = { timelineId: model.timelineId, layerId: model.layerId }
  const move = (event: React.PointerEvent<SVGPolylineElement>) => {
    const canvas = options.canvasRef?.current
    if (options.enabled && canvas) setHover(hitTrajectory(model, canvasPointerWorld(canvas, event.clientX, event.clientY), 10 / options.zoom))
  }
  const context = (event: React.MouseEvent, node?: TrajectoryNode) => {
    if (!options.enabled || !options.canvasRef?.current) return
    event.preventDefault(); event.stopPropagation()
    const hit = node ? undefined : hitTrajectory(model, canvasPointerWorld(options.canvasRef.current, event.clientX, event.clientY), 10 / options.zoom) ?? undefined
    if (node || hit) setMenu({ x: event.clientX, y: event.clientY, hit, node })
  }
  const items: MenuItem[] = menu?.hit ? [
    { kind: 'action', label: 'Add keyframe here', onSelect: () => {
      const hit = menu.hit!, sample = model.context && projectTrajectoryPosition(model.context, hit.timeMs)
      if (sample) apply(() => setTrajectoryPoint(options.editor.getScene(), { ...scope, timeMs: hit.timeMs, worldPoint: sample.world }), hit.timeMs)
    } },
    { kind: 'separator' },
    ...(['linear', 'easeIn', 'easeOut', 'easeInOut', 'hold', 'customBezier'] as const).map((type, i) => ({
      kind: 'action' as const, label: ['Set segment Linear', 'Set segment Ease In', 'Set segment Ease Out', 'Set segment Ease In Out', 'Set segment Hold', 'Set segment Bezier'][i],
      onSelect: () => apply(() => setTrajectorySegmentEasing(options.editor.getScene(), { ...scope, startMs: menu.hit!.startMs, endMs: menu.hit!.endMs,
        easing: type === 'customBezier' ? { type, bezier: { cx1: 1 / 3, cy1: 1 / 3, cx2: 2 / 3, cy2: 2 / 3 } } : { type } }), menu.hit!.startMs),
    })),
  ] : menu?.node ? (['aligned', 'broken'] as const).map(mode => ({ kind: 'action' as const, label: mode === 'aligned' ? 'Bezier · aligned handles' : 'Corner Bezier · independent handles',
    onSelect: () => apply(() => setTrajectoryNodeCurve(options.editor.getScene(), { ...scope, timeMs: menu.node!.timeMs, mode }), menu.node!.timeMs) })) : []

  /** Handles use the stable canvas for capture; preview changes cannot replace
   * the DOM owner and the latest pointer-up position is sampled by the session. */
  const beginHandle = (event: React.PointerEvent<SVGCircleElement>, handle: MotionCurveHandle) => {
    const canvas = options.canvasRef?.current
    if (!options.enabled || event.button !== 0 || !canvas || options.editor.isTransactionActive()) return
    event.preventDefault(); event.stopPropagation()
    const origin = canvasPointerWorld(canvas, event.clientX, event.clientY)
    options.editor.beginTransaction()
    session.current = new MotionKeyDragSession({ startClientX: event.clientX, startClientY: event.clientY }, {
      getEditor: () => latest.current.editor, eventTarget: window,
      diagnostics: { owner: 'motion-key', details: { ...scope, handle: handle.side, timeMs: handle.timeMs } },
      preview: (base, sample) => {
        const point = canvasPointerWorld(canvas, sample.clientX, sample.clientY)
        const result = moveTrajectoryHandle(base, { ...scope, handle, world: { x: handle.world.x + point.x - origin.x, y: handle.world.y + point.y - origin.y } })
        return { ...result, scene: result.command ? result.command.execute(base) : base }
      },
      show: () => {}, commit: (_base, preview) => {
        if (preview.command) latest.current.editor.commitTransaction(preview.command)
        latest.current.onSelect(new Set(preview.selectedIds))
      }, clear: () => { session.current = null }, warning: message => latest.current.onWarning(message),
    }, { pointerId: event.pointerId, currentTarget: canvas })
  }
  return { hover, clearHover: () => setHover(null), move, context, menu, items, closeMenu: () => setMenu(null), beginHandle }
}
