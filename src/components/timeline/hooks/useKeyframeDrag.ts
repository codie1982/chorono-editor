'use client'
import { useCallback, useRef, useState } from 'react'
import type { Timeline, TimelineSettings } from '@/lib/types'
import { buildSnapTargets, snapToTargets } from '@/lib/timeline/snapping'

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
  const dragRef        = useRef<DragState | null>(null)
  const pendingMsRef   = useRef<number | null>(null)
  const rafScheduledRef = useRef(false)

  const [previewMs,       setPreviewMs]       = useState<Record<string, number>>({})
  const [snapIndicatorMs, setSnapIndicatorMs] = useState<number | null>(null)

  // ── Pointer event handlers — installed via window addEventListener ────────
  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!dragRef.current) return
    const drag = dragRef.current
    const rawMs = params.clientXToMs(e.clientX)
    const { timeMs: leaderRaw, snappedTo } = snapToTargets(
      rawMs, drag.snapTargets, e.metaKey || e.ctrlKey,
    )

    // Compute the leader's intended delta, then clamp so no group member escapes [0,duration]
    let delta = leaderRaw - drag.leader.originalMs
    delta = Math.max(drag.minDelta, Math.min(drag.maxDelta, delta))
    pendingMsRef.current = drag.leader.originalMs + delta

    if (rafScheduledRef.current) return
    rafScheduledRef.current = true
    requestAnimationFrame(() => {
      rafScheduledRef.current = false
      if (!dragRef.current) return

      const moves: Record<string, number> = {}
      for (const m of dragRef.current.group) {
        moves[m.kfId] = m.originalMs + delta
      }
      setPreviewMs(moves)
      setSnapIndicatorMs(snappedTo != null && delta === leaderRaw - drag.leader.originalMs ? snappedTo : null)
      params.onPreview(moves)
    })
  }, [params])

  const handlePointerUp = useCallback((e: PointerEvent) => {
    if (!dragRef.current) return
    const drag = dragRef.current
    const finalLeaderMs = pendingMsRef.current ?? drag.leader.originalMs
    const delta = finalLeaderMs - drag.leader.originalMs

    dragRef.current        = null
    pendingMsRef.current   = null
    rafScheduledRef.current = false
    setPreviewMs({})
    setSnapIndicatorMs(null)

    const target = e.target as HTMLElement
    try { target.releasePointerCapture(e.pointerId) } catch { /* already released */ }

    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup',   handlePointerUp)
    window.removeEventListener('keydown',     handleKeyDown)

    // If user didn't really move (e.g. a click), don't commit a no-op
    if (Math.abs(delta) < 0.5) {
      params.onCancel()
      return
    }

    const moves = drag.group.map((m) => ({
      kfId:        m.kfId,
      trackTarget: m.trackTarget,
      timelineId:  m.timelineId,
      fromMs:      m.originalMs,
      toMs:        m.originalMs + delta,
    }))
    params.onCommit(moves)
  }, [handlePointerMove, params])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !dragRef.current) return
    e.preventDefault()
    dragRef.current        = null
    pendingMsRef.current   = null
    rafScheduledRef.current = false
    setPreviewMs({})
    setSnapIndicatorMs(null)
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup',   handlePointerUp)
    window.removeEventListener('keydown',     handleKeyDown)
    params.onCancel()
  }, [handlePointerMove, handlePointerUp, params])

  const beginDrag = useCallback((
    e: React.PointerEvent<HTMLElement>,
    leader: DragSnapshot,
    group: DragSnapshot[],
  ) => {
    if (e.button !== 0) return
    if (!params.timeline) return
    e.stopPropagation()
    e.preventDefault()

    // Make sure leader is in group (callers should pass it, but be defensive)
    const fullGroup = group.some((g) => g.kfId === leader.kfId) ? group : [leader, ...group]

    // Compute delta clamps: no group member may go below 0 or above durationMs
    const minOriginal = fullGroup.reduce((m, g) => Math.min(m, g.originalMs), Infinity)
    const maxOriginal = fullGroup.reduce((m, g) => Math.max(m, g.originalMs), -Infinity)
    const minDelta = -minOriginal
    const maxDelta = params.durationMs - maxOriginal

    dragRef.current = {
      leader, group: fullGroup,
      snapTargets: buildSnapTargets(
        params.timeline, params.frameRate, params.settings,
        // Exclude every group member so the leader doesn't snap to a follower's old position
        leader.kfId,
      ),
      minDelta, maxDelta,
    }
    pendingMsRef.current = leader.originalMs
    params.onBegin()

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup',   handlePointerUp)
    window.addEventListener('keydown',     handleKeyDown)
  }, [params, handlePointerMove, handlePointerUp, handleKeyDown])

  return { beginDrag, previewMs, snapIndicatorMs }
}
