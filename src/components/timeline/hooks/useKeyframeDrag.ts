'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Timeline, TimelineSettings } from '@/lib/types'
import { buildSnapTargets, snapToTargets } from '@/lib/timeline/snapping'
import { createLatestFrameScheduler } from '@/lib/timeline/latestFrameScheduler'

/** One keyframe participating in a drag (leading or follower). */
export interface DragSnapshot {
  kfId: string
  trackTarget: string
  timelineId: string
  originalMs: number
}

interface DragState {
  /** The kf the user actually grabbed — its snapped position drives the delta */
  leader: DragSnapshot
  /** All selected kfs (always includes leader) — moved together as one delta */
  group:  DragSnapshot[]
  snapTargets: number[]
  /** Min / max delta the group can tolerate without any member leaving [0, durationMs] */
  minDelta: number
  maxDelta: number
}

interface Params {
  timeline: Timeline | null
  frameRate: number
  settings: TimelineSettings
  clientXToMs: (clientX: number) => number
  durationMs: number
  onBegin: () => void
  /** Map of kfId → previewMs for the whole moving group */
  onPreview: (moves: Record<string, number>) => void
  /** Called once on pointerUp — host commits a single bulk move command */
  onCommit:  (moves: Array<{ kfId: string; trackTarget: string; timelineId: string; fromMs: number; toMs: number }>) => void
  onCancel: () => void
  /** Pointer-down then up with no real movement = a click. The host handles
   *  selection here (toggle), since beginDrag preventDefaults the native click. */
  onLoneClick?: (kfId: string, shiftHeld: boolean) => void
}

interface DragReturn {
  /** Attach to each keyframe's pointerdown — pass the full selection group */
  beginDrag: (
    e: React.PointerEvent<HTMLElement>,
    leader: DragSnapshot,
    group: DragSnapshot[],
  ) => void
  previewMs:       Record<string, number>
  snapIndicatorMs: number | null
}

/**
 * Pointer-capture keyframe drag with snap and bulk move support.
 *
 * Performance contract:
 *   • Snap targets are built ONCE at beginDrag — never during pointermove.
 *   • Pointermove updates refs (no setState), then schedules an rAF to flush
 *     the preview map — at most one setState per frame regardless of mouse rate.
 *
 * Multi-select contract:
 *   • The "leader" is the kf the user clicked. Its snapped target drives the
 *     delta. All other group members shift by the same delta.
 *   • The delta is clamped so no group member is pushed outside [0, durationMs].
 *   • If the selection has only one member, behaviour matches single-kf drag.
 */
export function useKeyframeDrag(params: Params): DragReturn {
  const paramsRef = useRef(params)
  paramsRef.current = params
  const dragRef = useRef<DragState | null>(null)
  const pendingMsRef = useRef<number | null>(null)
  const removeListeners = useRef<() => void>(() => {})
  const [previewMs,       setPreviewMs]       = useState<Record<string, number>>({})
  const [snapIndicatorMs, setSnapIndicatorMs] = useState<number | null>(null)
  const scheduler = useRef<ReturnType<typeof createLatestFrameScheduler<{ delta: number; snap: number | null }>> | null>(null)
  if (!scheduler.current) {
    scheduler.current = createLatestFrameScheduler(({ delta, snap }) => {
      const active = dragRef.current
      if (!active) return
      const moves: Record<string, number> = {}
      for (const item of active.group) moves[item.kfId] = item.originalMs + delta
      setPreviewMs(moves)
      setSnapIndicatorMs(snap)
      paramsRef.current.onPreview(moves)
    })
  }

  const cancelDrag = useCallback((updateUI = true) => {
    scheduler.current?.cancel()
    removeListeners.current()
    const active = dragRef.current
    dragRef.current = null
    pendingMsRef.current = null
    if (updateUI) { setPreviewMs({}); setSnapIndicatorMs(null) }
    if (active) paramsRef.current.onCancel()
  }, [])

  // A panel/timeline change cannot leave a transaction or queued rAF alive.
  useEffect(() => {
    setPreviewMs({})
    setSnapIndicatorMs(null)
    return () => cancelDrag(false)
  }, [params.timeline?.id, cancelDrag])

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const rawMs = paramsRef.current.clientXToMs(e.clientX)
    const { timeMs: leaderRaw, snappedTo } = snapToTargets(
      rawMs, drag.snapTargets, e.metaKey || e.ctrlKey,
    )

    let delta = leaderRaw - drag.leader.originalMs
    delta = Math.max(drag.minDelta, Math.min(drag.maxDelta, delta))
    pendingMsRef.current = drag.leader.originalMs + delta
    scheduler.current!.push({
      delta,
      snap: snappedTo != null && delta === leaderRaw - drag.leader.originalMs ? snappedTo : null,
    })
  }, [])

  const handlePointerUp = useCallback((e: PointerEvent) => {
    if (!dragRef.current) return
    const drag = dragRef.current
    // Paint the same newest sample that the command will commit, even when
    // pointerup arrives before the next animation frame.
    scheduler.current!.flush()
    const finalLeaderMs = pendingMsRef.current ?? drag.leader.originalMs
    const delta = finalLeaderMs - drag.leader.originalMs

    dragRef.current        = null
    pendingMsRef.current   = null
    setPreviewMs({})
    setSnapIndicatorMs(null)

    removeListeners.current()

    // If user didn't really move (e.g. a click), don't commit a no-op.
    // Route it to the host as a click so selection (toggle) still works —
    // beginDrag preventDefaulted the native click event.
    if (Math.abs(delta) < 0.5) {
      paramsRef.current.onLoneClick?.(drag.leader.kfId, e.shiftKey)
      paramsRef.current.onCancel()
      return
    }

    const moves = drag.group.map((m) => ({
      kfId:        m.kfId,
      trackTarget: m.trackTarget,
      timelineId:  m.timelineId,
      fromMs:      m.originalMs,
      toMs:        m.originalMs + delta,
    }))
    paramsRef.current.onCommit(moves)
  }, [])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !dragRef.current) return
    e.preventDefault()
    cancelDrag()
  }, [cancelDrag])

  const beginDrag = useCallback((
    e: React.PointerEvent<HTMLElement>,
    leader: DragSnapshot,
    group: DragSnapshot[],
  ) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    if (dragRef.current) cancelDrag()
    // preventDefault suppresses the browser's normal focus transfer. Commit
    // any input blur before opening the editor transaction and reading props.
    e.currentTarget.focus({ preventScroll: true })
    const current = paramsRef.current
    if (!current.timeline) return

    // Make sure leader is in group (callers should pass it, but be defensive)
    const fullGroup = group.some((g) => g.kfId === leader.kfId) ? group : [leader, ...group]

    // Compute delta clamps: no group member may go below 0 or above durationMs
    const minOriginal = fullGroup.reduce((m, g) => Math.min(m, g.originalMs), Infinity)
    const maxOriginal = fullGroup.reduce((m, g) => Math.max(m, g.originalMs), -Infinity)
    const minDelta = -minOriginal
    const maxDelta = current.durationMs - maxOriginal
    const movingIds = new Set(fullGroup.map(item => item.kfId))

    dragRef.current = {
      leader, group: fullGroup,
      snapTargets: current.settings.snapEnabled ? buildSnapTargets(
        { ...current.timeline, tracks: current.timeline.tracks.map(track => ({
          ...track, keyframes: track.keyframes.filter(key => !movingIds.has(key.id)),
        })) }, current.frameRate, current.settings,
      ) : [],
      minDelta, maxDelta,
    }
    pendingMsRef.current = leader.originalMs
    current.onBegin()

    const target = e.currentTarget
    const pointerId = e.pointerId
    try { target.setPointerCapture(pointerId) } catch { /* detached target */ }
    const onPointerCancel = () => cancelDrag()

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup',   handlePointerUp)
    window.addEventListener('keydown',     handleKeyDown)
    window.addEventListener('pointercancel', onPointerCancel)
    removeListeners.current = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('pointercancel', onPointerCancel)
      try { target.releasePointerCapture(pointerId) } catch { /* capture already lost */ }
      removeListeners.current = () => {}
    }
  }, [cancelDrag, handlePointerMove, handlePointerUp, handleKeyDown])

  return { beginDrag, previewMs, snapIndicatorMs }
}
