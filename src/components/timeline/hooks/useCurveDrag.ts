'use client'
import { useRef, useState, useCallback, useEffect } from 'react'
import type { ChronoScene, Keyframe } from '@/lib/types'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { CurveViewport } from '@/lib/timeline/curveMath'
import { nextKfId } from '@/lib/defaults'
import {
  applyCurveKeyframeChanges, curveChangesCollide, curveDragPosition, makeCurveKeyframeChangesCmd,
  curveDragTimeLimits,
  type CurveKeyframeChange,
} from '@/lib/timeline/curveEditing'

interface Member { target: string; keyframe: Keyframe; viewport: CurveViewport; duplicate?: boolean }
interface DragSession {
  timelineId: string
  base: ChronoScene
  leader: Member
  members: Member[]
  pointerX: number; pointerY: number; pointerId: number
  captured: Element
  lockedAxis: 'x' | 'y' | null
  pending: CurveKeyframeChange[]
  timeLimits: { min: number; max: number }
  onCancel?: () => void
}

interface UseCurveDragArgs {
  editor: EditorStateReturn
  timelineId: string | null
  getTrackViewport: (target: string) => CurveViewport
  clientToLocal: (clientX: number, clientY: number) => { x: number; y: number }
  onDragStart?: () => void
  onDragEnd?: () => void
  onWarning?: (message: string) => void
}

/** Captures scene, track ranges and grab offsets once. Preview, cancellation,
 * duplication and both edit axes belong to the same editor transaction. */
export function useCurveDrag(args: UseCurveDragArgs) {
  const latest = useRef(args)
  latest.current = args
  const dragRef = useRef<DragSession | null>(null)
  const [preview, setPreview] = useState<{ kfId: string; ms: number; value: number } | null>(null)

  const release = (drag: DragSession) => {
    try { drag.captured.releasePointerCapture?.(drag.pointerId) } catch { /* already released */ }
  }

  const cancel = useCallback(() => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    release(drag)
    latest.current.editor.cancelTransaction()
    setPreview(null)
    drag.onCancel?.()
    latest.current.onDragEnd?.()
  }, [])

  const move = useCallback((event: PointerEvent) => {
    const drag = dragRef.current
    if (!drag || event.pointerId !== drag.pointerId) return
    const point = latest.current.clientToLocal(event.clientX, event.clientY)
    const dx = point.x - drag.pointerX, dy = point.y - drag.pointerY
    if (!event.shiftKey) drag.lockedAxis = null
    else if (!drag.lockedAxis && Math.hypot(dx, dy) > 5) drag.lockedAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    const leader = drag.leader
    const position = curveDragPosition(leader.viewport, leader.target, leader.keyframe.timeMs,
      leader.keyframe.value as number, dx, dy, drag.lockedAxis, event.metaKey || event.ctrlKey)
    const deltaMs = Math.max(drag.timeLimits.min, Math.min(drag.timeLimits.max, position.ms - leader.keyframe.timeMs))
    const valueDelta = position.value - (leader.keyframe.value as number)
    const rangeSpan = Math.max(0.0001, leader.viewport.range.max - leader.viewport.range.min)
    const snappedDy = -valueDelta / rangeSpan * leader.viewport.heightPx
    drag.pending = drag.members.map(member => {
      const memberPosition = curveDragPosition(member.viewport, member.target, member.keyframe.timeMs,
        member.keyframe.value as number, dx, snappedDy, drag.lockedAxis, true)
      return { target: member.target, duplicate: member.duplicate,
        keyframe: { ...member.keyframe, timeMs: member.keyframe.timeMs + deltaMs, value: memberPosition.value } }
    })
    const lead = drag.pending.find(change => change.keyframe.id === leader.keyframe.id)!.keyframe
    setPreview({ kfId: lead.id, ms: lead.timeMs, value: lead.value as number })
    latest.current.editor.previewTransaction(applyCurveKeyframeChanges(drag.base, drag.timelineId, drag.pending))
  }, [])

  const end = useCallback((event?: PointerEvent) => {
    const drag = dragRef.current
    if (!drag || (event && event.pointerId !== drag.pointerId)) return
    const changed = drag.pending.some(change => {
      const before = drag.members.find(member => member.keyframe.id === change.keyframe.id)!.keyframe
      return change.keyframe.timeMs !== before.timeMs || change.keyframe.value !== before.value
    })
    if (!changed) { cancel(); return }
    if (curveChangesCollide(drag.base, drag.timelineId, drag.pending)) {
      cancel()
      latest.current.onWarning?.('Move the keyframe to a free time; the drag was cancelled to preserve the existing keys.')
      return
    }
    dragRef.current = null
    release(drag)
    latest.current.editor.commitTransaction(makeCurveKeyframeChangesCmd(drag.base, drag.timelineId, drag.pending))
    setPreview(null)
    latest.current.onDragEnd?.()
  }, [cancel])

  const begin = useCallback((event: React.PointerEvent<SVGElement>, keyframe: Keyframe, target: string,
    options: { duplicate?: boolean; selectedIds?: Set<string>; onCancel?: () => void } = {}): string | null => {
    if (event.button !== 0 || !latest.current.timelineId || typeof keyframe.value !== 'number') return null
    cancel()
    event.stopPropagation()
    event.preventDefault()
    // Focusing commits any input's onBlur draft. Read the scene afterwards
    // so this drag cannot replace that freshly committed value with a stale one.
    event.currentTarget.ownerSVGElement?.focus({ preventScroll: true })
    const { editor, timelineId, getTrackViewport, clientToLocal } = latest.current
    const base = editor.getScene()
    const timeline = base.timelines.find(item => item.id === timelineId)
    const live = timeline?.tracks.find(track => track.target === target)?.keyframes.find(key => key.id === keyframe.id)
    if (!timeline || !live || typeof live.value !== 'number') return null
    const snapshot = (trackTarget: string, key: Keyframe): Member => {
      const viewport = getTrackViewport(trackTarget)
      return { target: trackTarget, keyframe: key, viewport: { ...viewport, range: { ...viewport.range } } }
    }
    const leader = snapshot(target, options.duplicate ? { ...live, id: nextKfId() } : live)
    leader.duplicate = options.duplicate
    const members = !options.duplicate && options.selectedIds?.has(live.id)
      ? timeline.tracks.flatMap(track => track.keyframes.filter(key => options.selectedIds!.has(key.id) && typeof key.value === 'number')
          .map(key => snapshot(track.target, key)))
      : [leader]
    if (!members.some(member => member.keyframe.id === leader.keyframe.id)) members.push(leader)
    const timeLimits = curveDragTimeLimits(members.map(member => member.keyframe.timeMs), timeline.durationMs)
    if (!timeLimits) {
      latest.current.onWarning?.('The selected keys extend outside this animation. Fit them inside its duration before dragging.')
      return null
    }
    const point = clientToLocal(event.clientX, event.clientY)
    const pending = members.map(member => ({ target: member.target, keyframe: member.keyframe, duplicate: member.duplicate }))
    dragRef.current = { timelineId: timeline.id, base, leader, members, pending,
      pointerX: point.x, pointerY: point.y, pointerId: event.pointerId, captured: event.currentTarget,
      lockedAxis: null, timeLimits, onCancel: options.onCancel }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    editor.beginTransaction()
    latest.current.onDragStart?.()
    setPreview({ kfId: leader.keyframe.id, ms: live.timeMs, value: live.value })
    // The source stays in the snapshot. A provisional clone is removed by
    // cancelling this transaction; no Add command is dispatched beforehand.
    if (options.duplicate) editor.previewTransaction(applyCurveKeyframeChanges(base, timeline.id, pending))
    return leader.keyframe.id
  }, [cancel])

  useEffect(() => {
    const onMove = (event: PointerEvent) => move(event)
    const onUp = (event: PointerEvent) => end(event)
    const onCancel = (event: PointerEvent) => { if (dragRef.current?.pointerId === event.pointerId) cancel() }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && dragRef.current) { event.preventDefault(); cancel() } }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', cancel)
      if (dragRef.current) { release(dragRef.current); dragRef.current = null; latest.current.editor.cancelTransaction() }
    }
  }, [move, end, cancel])
  useEffect(() => { if (dragRef.current && dragRef.current.timelineId !== args.timelineId) cancel() }, [args.timelineId, cancel])

  return { begin, move, end, cancel, preview, isDragging: preview !== null }
}
