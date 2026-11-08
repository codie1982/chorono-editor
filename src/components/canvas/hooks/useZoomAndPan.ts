import {
  useCallback, useLayoutEffect, useMemo, useRef, useState,
  type RefObject, type Dispatch, type SetStateAction,
} from 'react'
import type { ChronoScene } from '@/lib/types'
import { clamp } from '@/lib/canvas/math/coordinateMath'
import type { OverrideMap } from '@/lib/evaluator'
import { resolveLayerWorldBounds } from '@/lib/geometry/resolveLayerWorldBounds'

export const MIN_ZOOM  = 0.1
export const MAX_ZOOM  = 8
export const ZOOM_STEP = 1.25

interface Vec2 { x: number; y: number }

export interface UseZoomAndPanOptions {
  /** Composition dimensions. */
  width: number
  height: number
  /** Inner padding (px) subtracted from the container when measuring fit area. */
  padding: number
  /** The scrolling viewport container (also used to measure available size). */
  containerRef: RefObject<HTMLDivElement>
  scene: ChronoScene
  selectedLayerId: string | null
  timeMs?: number
  overrides?: OverrideMap
}

export interface UseZoomAndPanReturn {
  zoom: number
  setZoom: Dispatch<SetStateAction<number>>
  pan: Vec2
  setPan: Dispatch<SetStateAction<Vec2>>
  maxSide: { w: number; h: number }
  panToCentre: (cx: number, cy: number, z: number) => Vec2
  fitAll: () => void
  fitWidth: () => void
  fitHeight: () => void
  actualSize: () => void
  zoomTo: (z: number) => void
  fitSelection: () => void
  centreSelection: () => void
  zoomIn: () => void
  zoomOut: () => void
  beginPan: (e: React.PointerEvent) => void
  handleWheel: (e: React.WheelEvent<HTMLDivElement>) => void
  /** Live drag ref — read .current during render for the grabbing cursor. */
  panDragRef: RefObject<{
    startClientX: number; startClientY: number; startPan: Vec2
  } | null>
}

/**
 * Owns the canvas viewport: zoom level, pan offset, fit/centre presets, wheel
 * zoom, and the pan drag. Pure view concern — no scene mutation, no layer
 * interaction — so it's fully decoupled from the drag/transform system.
 */
export function useZoomAndPan(opts: UseZoomAndPanOptions): UseZoomAndPanReturn {
  const { width, height, padding, containerRef, scene, selectedLayerId, timeMs = 0, overrides } = opts

  const [zoom, setZoom] = useState(1)
  const [maxSide, setMaxSide] = useState({ w: 0, h: 0 })
  const [pan, setPan] = useState<Vec2>({ x: 0, y: 0 })
  const panDragRef = useRef<{
    startClientX: number; startClientY: number; startPan: Vec2
  } | null>(null)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      setMaxSide({ w: r.width - padding * 2, h: r.height - padding * 2 })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [containerRef, padding])

  const fitZoom = useMemo(() => {
    if (maxSide.w <= 0 || maxSide.h <= 0) return 1
    return Math.min(maxSide.w / width, maxSide.h / height, MAX_ZOOM)
  }, [maxSide, width, height])

  // Pan offset (display px) that places (cx, cy) in composition coords at the
  // centre of the viewport, given a zoom level. Reverses the flex centring.
  const panToCentre = useCallback((cx: number, cy: number, z: number): Vec2 => ({
    x: (width  / 2 - cx) * z,
    y: (height / 2 - cy) * z,
  }), [width, height])

  const fitAll = useCallback(() => {
    setZoom(fitZoom); setPan({ x: 0, y: 0 })
  }, [fitZoom])

  const fitWidth = useCallback(() => {
    if (maxSide.w <= 0) return
    const z = clamp(maxSide.w / width, MIN_ZOOM, MAX_ZOOM)
    setZoom(z); setPan({ x: 0, y: 0 })
  }, [maxSide.w, width])

  const fitHeight = useCallback(() => {
    if (maxSide.h <= 0) return
    const z = clamp(maxSide.h / height, MIN_ZOOM, MAX_ZOOM)
    setZoom(z); setPan({ x: 0, y: 0 })
  }, [maxSide.h, height])

  const actualSize = useCallback(() => {
    setZoom(1); setPan({ x: 0, y: 0 })
  }, [])

  const zoomTo = useCallback((z: number) => {
    setZoom(clamp(z, MIN_ZOOM, MAX_ZOOM)); setPan({ x: 0, y: 0 })
  }, [])

  // Fit selected layer to viewport (with 40px padding) and centre it.
  const fitSelection = useCallback(() => {
    const layer = scene.layers.find((l) => l.id === selectedLayerId)
    if (!layer) return
    const box = resolveLayerWorldBounds(layer, scene, timeMs, overrides)
    if (!box) return
    const PAD = 40
    const z = clamp(
      Math.min((maxSide.w - PAD * 2) / Math.max(1, box.width), (maxSide.h - PAD * 2) / Math.max(1, box.height)),
      MIN_ZOOM, MAX_ZOOM,
    )
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    setZoom(z); setPan(panToCentre(cx, cy, z))
  }, [scene, selectedLayerId, maxSide, panToCentre, timeMs, overrides])

  // Re-centre selected layer in the viewport without changing zoom.
  const centreSelection = useCallback(() => {
    const layer = scene.layers.find((l) => l.id === selectedLayerId)
    if (!layer) return
    const box = resolveLayerWorldBounds(layer, scene, timeMs, overrides)
    if (!box) return
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    setPan(panToCentre(cx, cy, zoom))
  }, [scene, selectedLayerId, zoom, panToCentre, timeMs, overrides])

  const zoomIn  = useCallback(() => setZoom((z) => clamp(z * ZOOM_STEP, MIN_ZOOM, MAX_ZOOM)), [])
  const zoomOut = useCallback(() => setZoom((z) => clamp(z / ZOOM_STEP, MIN_ZOOM, MAX_ZOOM)), [])

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (!(e.metaKey || e.ctrlKey)) return
    e.preventDefault()
    const factor = e.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP
    setZoom((z) => clamp(z * factor, MIN_ZOOM, MAX_ZOOM))
  }, [])

  const handlePanMove = useCallback((e: PointerEvent) => {
    const p = panDragRef.current
    if (!p) return
    setPan({
      x: p.startPan.x + (e.clientX - p.startClientX),
      y: p.startPan.y + (e.clientY - p.startClientY),
    })
  }, [])
  const handlePanUp = useCallback(() => {
    if (!panDragRef.current) return
    panDragRef.current = null
    window.removeEventListener('pointermove', handlePanMove)
    window.removeEventListener('pointerup',   handlePanUp)
  }, [handlePanMove])
  const beginPan = useCallback((e: React.PointerEvent) => {
    panDragRef.current = {
      startClientX: e.clientX, startClientY: e.clientY,
      startPan: { ...pan },
    }
    window.addEventListener('pointermove', handlePanMove)
    window.addEventListener('pointerup',   handlePanUp)
  }, [pan, handlePanMove, handlePanUp])

  return {
    zoom, setZoom, pan, setPan, maxSide,
    panToCentre, fitAll, fitWidth, fitHeight, actualSize, zoomTo,
    fitSelection, centreSelection, zoomIn, zoomOut,
    beginPan, handleWheel, panDragRef,
  }
}
