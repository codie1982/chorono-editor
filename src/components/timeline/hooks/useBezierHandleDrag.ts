'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChronoScene, EasingDefinition, Keyframe } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { CurveViewport } from '@/lib/timeline/curveMath'
import { xToMs, yToValue } from '@/lib/timeline/curveMath'
import { updateKfEasing } from '@/lib/timeline/keyframeOps'
import { makeUpdateEasingCmd } from '@/lib/editor/commands-keyframe'

const DEFAULT_BEZIER = { cx1: 0.42, cy1: 0, cx2: 0.58, cy2: 1 }
interface Args {
  editor: EditorStateReturn
  timelineId: string | null
  getTrackViewport: (target: string) => CurveViewport
  clientToLocal: (x: number, y: number) => { x: number; y: number }
  onDragStart?: () => void
  onDragEnd?: () => void
}
interface Session {
  base: ChronoScene; timelineId: string; target: string
  a: Keyframe; b: Keyframe; handle: 'p1' | 'p2'; viewport: CurveViewport
  original: EasingDefinition; pending: EasingDefinition
  pointerId: number; captured: SVGElement
}

/** Permanent, ref-dispatched listeners are armed before pointerdown. The
 * pending easing is kept outside React state so pointerup cannot lose a move. */
export function useBezierHandleDrag(args: Args) {
  const latest = useRef(args)
  latest.current = args
  const session = useRef<Session | null>(null)
  const [active, setActive] = useState(false)
  const release = (drag: Session) => { try { drag.captured.releasePointerCapture?.(drag.pointerId) } catch { /* released */ } }
  const cancel = useCallback(() => {
    const drag = session.current
    if (!drag) return
    session.current = null
    release(drag)
    latest.current.editor.cancelTransaction()
    setActive(false)
    latest.current.onDragEnd?.()
  }, [])
  const move = useCallback((event: PointerEvent) => {
    const drag = session.current
    if (!drag || event.pointerId !== drag.pointerId) return
    const point = latest.current.clientToLocal(event.clientX, event.clientY)
    const dt = drag.b.timeMs - drag.a.timeMs
    const dv = (drag.b.value as number) - (drag.a.value as number)
    const original = drag.original.bezier ?? DEFAULT_BEZIER
    let cx = Math.max(0, Math.min(1, (xToMs(drag.viewport, point.x) - drag.a.timeMs) / dt))
    let cy = Math.abs(dv) < 1e-12 ? original[drag.handle === 'p1' ? 'cy1' : 'cy2']
      : (yToValue(drag.viewport, point.y) - (drag.a.value as number)) / dv
    const ox = drag.handle === 'p1' ? 0 : 1, oy = ox
    const vx = original[drag.handle === 'p1' ? 'cx1' : 'cx2'] - ox
    const vy = original[drag.handle === 'p1' ? 'cy1' : 'cy2'] - oy
    const length = Math.hypot(vx, vy)
    if (event.shiftKey && length > 1e-6) {
      const weight = ((cx - ox) * vx + (cy - oy) * vy) / (length * length)
      cx = Math.max(0, Math.min(1, ox + weight * vx)); cy = oy + weight * vy
    } else if (event.altKey && length > 1e-6) {
      const newLength = Math.hypot(cx - ox, cy - oy)
      if (newLength > 1e-6) {
        const scale = length / newLength
        cy = oy + (cy - oy) * scale; cx = Math.max(0, Math.min(1, ox + (cx - ox) * scale))
      }
    }
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return
    let bezier = drag.handle === 'p1' ? { ...original, cx1: cx, cy1: cy } : { ...original, cx2: cx, cy2: cy }
    if (drag.a.tangentMode === 'aligned') bezier = drag.handle === 'p1'
      ? { ...bezier, cx2: 1 - cx, cy2: 1 - cy } : { ...bezier, cx1: 1 - cx, cy1: 1 - cy }
    drag.pending = { type: 'customBezier', bezier }
    latest.current.editor.previewTransaction(updateKfEasing(drag.base, drag.timelineId, drag.target, drag.a.id, drag.pending))
  }, [])
  const end = useCallback((event: PointerEvent) => {
    const drag = session.current
    if (!drag || event.pointerId !== drag.pointerId) return
    if (JSON.stringify(drag.original) === JSON.stringify(drag.pending)) { cancel(); return }
    session.current = null
    release(drag)
    latest.current.editor.commitTransaction(makeUpdateEasingCmd(drag.timelineId, drag.target, drag.a.id, drag.original, drag.pending))
    setActive(false)
    latest.current.onDragEnd?.()
  }, [cancel])
  const begin = useCallback((event: React.PointerEvent<SVGElement>, a: Keyframe, b: Keyframe, target: string, handle: 'p1' | 'p2') => {
    if (event.button !== 0 || !latest.current.timelineId || a.easing?.type !== 'customBezier'
        || a.tangentMode === 'linear' || a.tangentMode === 'auto' || b.timeMs <= a.timeMs) return
    cancel()
    event.preventDefault(); event.stopPropagation()
    event.currentTarget.ownerSVGElement?.focus({ preventScroll: true })
    const { editor, timelineId, getTrackViewport } = latest.current
    const viewport = getTrackViewport(target)
    session.current = { base: editor.getScene(), timelineId, target, a, b, handle,
      viewport: { ...viewport, range: { ...viewport.range } }, original: a.easing, pending: a.easing,
      pointerId: event.pointerId, captured: event.currentTarget }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    editor.beginTransaction()
    setActive(true)
    latest.current.onDragStart?.()
  }, [cancel])
  useEffect(() => {
    const onCancel = (event: PointerEvent) => { if (session.current?.pointerId === event.pointerId) cancel() }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && session.current) { event.preventDefault(); cancel() } }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', cancel)
      if (session.current) { release(session.current); session.current = null; latest.current.editor.cancelTransaction() }
    }
  }, [move, end, cancel])
  useEffect(() => { if (session.current && session.current.timelineId !== args.timelineId) cancel() }, [args.timelineId, cancel])
  return { begin, cancel, active }
}
