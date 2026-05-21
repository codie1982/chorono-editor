import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react'
import type { ChronoScene, Layer } from '@/lib/types'

/** Drag phase callback fired to the host runtime during a preview-mode drag. */
export type PreviewDragCallback = (
  layerId: string,
  phase:   'start' | 'move' | 'end',
  dx:      number,
  dy:      number,
  progress: number,
) => void

export interface UsePreviewDragOptions {
  scene: ChronoScene
  onLayerDragInPreview?: PreviewDragCallback
  /** Live on-screen → composition scale (see SceneCanvas.readScale). */
  readScale: () => { sx: number; sy: number }
  /** Owned by SceneCanvas (shared with the move-drag path + renderer). */
  setDragOverrides: Dispatch<SetStateAction<Map<string, number>>>
}

export interface UsePreviewDragReturn {
  beginPreviewDrag: (
    layer: Layer,
    startClientX: number,
    startClientY: number,
    cx: number,
    cy: number,
  ) => void
}

/**
 * Preview-mode drag: fires dragStart/Move/End on draggable layers and writes a
 * TEMPORARY override map entry so the dragged layer visibly follows the cursor
 * (no scene mutation — pure render-time override). When the layer's dragConfig
 * scrubs a timeline, position is driven by its keyframes instead of the cursor.
 */
export function usePreviewDrag(opts: UsePreviewDragOptions): UsePreviewDragReturn {
  const { scene, onLayerDragInPreview, readScale, setDragOverrides } = opts

  const previewDragRef = useRef<{
    layerId: string
    startClientX: number; startClientY: number
    range: number
    axis: 'x' | 'y' | 'both'
    originalX: number
    originalY: number
    /** When true, drag scrubs a timeline — the layer's position is driven by
     *  its own keyframes (NOT the cursor). We skip the visual cursor-follow
     *  override so the authored animation can play through. */
    scrubMode: boolean
  } | null>(null)

  const handlePreviewDragMove = useCallback((e: PointerEvent) => {
    const d = previewDragRef.current
    if (!d) return
    const { sx, sy } = readScale()
    const rawDx = (e.clientX - d.startClientX) * sx
    const rawDy = (e.clientY - d.startClientY) * sy
    // Apply axis filter
    const dx = d.axis === 'y' ? 0 : rawDx
    const dy = d.axis === 'x' ? 0 : rawDy

    // 👉 Visual feedback:
    //    – Free-drag mode:  override transform with cursor position
    //    – Scrub mode:      let the layer's KEYFRAMES drive the position
    //                       (the timeline scrub upstream moves the cursor,
    //                       so the layer's authored animation plays through)
    if (!d.scrubMode) {
      setDragOverrides(new Map([
        [`layers.${d.layerId}.transform.x`, d.originalX + dx],
        [`layers.${d.layerId}.transform.y`, d.originalY + dy],
      ]))
    }

    if (onLayerDragInPreview) {
      const dist     = d.axis === 'both' ? Math.hypot(dx, dy) : Math.abs(d.axis === 'x' ? dx : dy)
      const progress = Math.max(0, Math.min(1, dist / Math.max(1, d.range)))
      onLayerDragInPreview(d.layerId, 'move', dx, dy, progress)
    }
  }, [onLayerDragInPreview, readScale, setDragOverrides])

  const handlePreviewDragUp = useCallback((e: PointerEvent) => {
    const d = previewDragRef.current
    if (!d) return
    previewDragRef.current = null
    window.removeEventListener('pointermove', handlePreviewDragMove)
    window.removeEventListener('pointerup',   handlePreviewDragUp)
    // Clear the visual override — when preview exits / re-enters, layer
    // returns to its authored position.
    setDragOverrides(new Map())
    if (onLayerDragInPreview) {
      const { sx, sy } = readScale()
      const rawDx = (e.clientX - d.startClientX) * sx
      const rawDy = (e.clientY - d.startClientY) * sy
      const dx = d.axis === 'y' ? 0 : rawDx
      const dy = d.axis === 'x' ? 0 : rawDy
      const dist     = d.axis === 'both' ? Math.hypot(dx, dy) : Math.abs(d.axis === 'x' ? dx : dy)
      const progress = Math.max(0, Math.min(1, dist / Math.max(1, d.range)))
      onLayerDragInPreview(d.layerId, 'end', dx, dy, progress)
    }
  }, [handlePreviewDragMove, onLayerDragInPreview, readScale, setDragOverrides])

  const beginPreviewDrag = useCallback((
    layer: Layer, startClientX: number, startClientY: number, _cx: number, _cy: number,
  ) => {
    const cfg = layer.dragConfig ?? {}

    // ── Auto-detect scrub setup from the layer's OWN animation tracks ────
    // When the layer is keyframed on a timeline AND has a scrubsTimeline
    // pointing at that timeline, we infer:
    //   • axis     = whichever of transform.x / transform.y is animated
    //   • range    = absolute value delta across the animation (e.g. 0→200 → 200)
    //   • scrubMode = true (layer position will be driven by keyframes,
    //                       not by cursor follow)
    let axis:  'x' | 'y' | 'both' = cfg.axis ?? 'both'
    let range: number             = cfg.range ?? 200
    let scrubMode                 = false

    if (cfg.scrubsTimeline) {
      const tl = scene.timelines.find(t => t.id === cfg.scrubsTimeline)
      if (tl) {
        scrubMode = true
        const xTrack = tl.tracks.find(t => t.target === `layers.${layer.id}.transform.x`)
        const yTrack = tl.tracks.find(t => t.target === `layers.${layer.id}.transform.y`)
        const xValues = xTrack?.keyframes.map(k => Number(k.value)) ?? []
        const yValues = yTrack?.keyframes.map(k => Number(k.value)) ?? []
        const xRange  = xValues.length > 1 ? Math.max(...xValues) - Math.min(...xValues) : 0
        const yRange  = yValues.length > 1 ? Math.max(...yValues) - Math.min(...yValues) : 0
        if (xRange > 0 && yRange > 0) { axis = 'both'; range = Math.hypot(xRange, yRange) }
        else if (xRange > 0)          { axis = 'x';    range = xRange }
        else if (yRange > 0)          { axis = 'y';    range = yRange }
        // If layer has no keyframes on this timeline, keep explicit cfg values.
      }
    }

    previewDragRef.current = {
      layerId: layer.id,
      startClientX, startClientY,
      range, axis,
      originalX: layer.transform.x,
      originalY: layer.transform.y,
      scrubMode,
    }
    if (onLayerDragInPreview) onLayerDragInPreview(layer.id, 'start', 0, 0, 0)
    window.addEventListener('pointermove', handlePreviewDragMove)
    window.addEventListener('pointerup',   handlePreviewDragUp)
  }, [scene, onLayerDragInPreview, handlePreviewDragMove, handlePreviewDragUp])

  return { beginPreviewDrag }
}
