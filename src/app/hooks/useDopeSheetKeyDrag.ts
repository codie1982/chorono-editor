import { useState, useCallback, useRef, useEffect } from 'react'
import type { Keyframe } from '@/lib/types'

export interface DragSnapshot {
  kfId: string
  trackTarget: string
  originalMs: number
}

interface Props {
  selectedKfIds: Set<string>
  tracks: any[] // Track[]
  onDragStart: (snapshots: DragSnapshot[]) => void
  onDragMove: (delta: number, snapshots: DragSnapshot[]) => void
  onDragEnd: (delta: number, snapshots: DragSnapshot[]) => void
  onCancel: () => void
  snapEnabled: boolean
  durationMs: number
}

export function useDopeSheetKeyDrag({
  selectedKfIds,
  tracks,
  onDragStart,
  onDragMove,
  onDragEnd,
  onCancel,
  snapEnabled,
  durationMs,
}: Props) {
  const [isDragging, setIsDragging] = useState(false)
  const [previewMs, setPreviewMs] = useState<Record<string, number>>({})
  const [snapTarget, setSnapTarget] = useState<number | null>(null)

  const dragStartRef = useRef<{ clientX: number; snapshots: DragSnapshot[] } | null>(null)

  // Build snapshots of selected keys (called when drag starts)
  const buildSnapshots = useCallback(() => {
    const snapshots: DragSnapshot[] = []

    for (const track of tracks) {
      if (!track.keyframes) continue
      for (const kf of track.keyframes) {
        if (selectedKfIds.has(kf.id)) {
          snapshots.push({
            kfId: kf.id,
            trackTarget: track.target,
            originalMs: kf.timeMs,
          })
        }
      }
    }

    return snapshots
  }, [selectedKfIds, tracks])

  // Calculate snap target (grid or frame)
  const calculateSnapTarget = useCallback(
    (deltaMs: number, snapshots: DragSnapshot[]) => {
      if (!snapEnabled) return 0

      // Snap to nearest 10ms (frame at 100fps, or grid)
      const snapInterval = 10
      const firstKey = snapshots[0]
      if (!firstKey) return 0

      const newTime = Math.max(0, Math.min(durationMs, firstKey.originalMs + deltaMs))
      const snapped = Math.round(newTime / snapInterval) * snapInterval
      return snapped - firstKey.originalMs
    },
    [snapEnabled, durationMs],
  )

  // Pointer down handler
  const handlePointerDown = useCallback(
    (e: React.PointerEvent, kfId: string) => {
      if (!selectedKfIds.has(kfId)) return

      e.preventDefault()
      const snapshots = buildSnapshots()
      if (snapshots.length === 0) return

      setIsDragging(true)
      dragStartRef.current = {
        clientX: e.clientX,
        snapshots,
      }

      onDragStart(snapshots)
    },
    [selectedKfIds, buildSnapshots, onDragStart],
  )

  // Pointer move handler (via effect, triggered by window events)
  useEffect(() => {
    if (!isDragging || !dragStartRef.current) return

    const { clientX: startX, snapshots } = dragStartRef.current

    const handleMove = (e: PointerEvent) => {
      const pxDelta = e.clientX - startX
      const deltaMs = pxDelta * 10 // Adjust scale (10ms per pixel)

      // Apply snap if enabled
      const snappedDelta = snapEnabled ? calculateSnapTarget(deltaMs, snapshots) : deltaMs

      // Clamp delta to keep all keys in valid range
      let clampedDelta = snappedDelta
      for (const snap of snapshots) {
        const newTime = snap.originalMs + clampedDelta
        if (newTime < 0) clampedDelta = Math.max(clampedDelta, -snap.originalMs)
        if (newTime > (durationMs - 1)) clampedDelta = Math.min(clampedDelta, durationMs - 1 - snap.originalMs)
      }

      // Update preview
      const next: Record<string, number> = {}
      for (const snap of snapshots) {
        next[snap.kfId] = snap.originalMs + clampedDelta
      }
      setPreviewMs(next)
      setSnapTarget(snapEnabled ? calculateSnapTarget(clampedDelta, snapshots) : null)

      onDragMove(clampedDelta, snapshots)
    }

    const handleUp = (e: PointerEvent) => {
      const pxDelta = e.clientX - startX
      const deltaMs = pxDelta * 10
      const snappedDelta = snapEnabled ? calculateSnapTarget(deltaMs, snapshots) : deltaMs

      onDragEnd(snappedDelta, snapshots)
      setIsDragging(false)
      setPreviewMs({})
      setSnapTarget(null)
      dragStartRef.current = null
    }

    const handleCancel = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel()
        setIsDragging(false)
        setPreviewMs({})
        setSnapTarget(null)
        dragStartRef.current = null
      }
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('keydown', handleCancel)

    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('keydown', handleCancel)
    }
  }, [isDragging, snapEnabled, calculateSnapTarget, durationMs, onDragMove, onDragEnd, onCancel])

  return {
    isDragging,
    previewMs,
    snapTarget,
    handlePointerDown,
  }
}
