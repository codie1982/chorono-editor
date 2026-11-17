import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { ChronoScene } from '@/lib/types'
import { layersInSelectionRegion, type SelectionFrameOptions } from '@/lib/selection/canvasShapes'
import type { SelectionMode, SelectionRegion, SelectionRegionStyle } from '@/lib/selection/selectionGesture'
import { SelectionRegionSession } from '../interactions/SelectionRegionSession'
import type { PointerGestureStart } from '../interactions/PointerGestureSession'

export type SelectionTool = SelectionRegionStyle
export type SelectionOverlay = SelectionRegion
export type { SelectionMode } from '@/lib/selection/selectionGesture'

export interface UseSelectionToolsOptions {
  canvasRef: RefObject<HTMLCanvasElement>
  sceneRef: RefObject<ChronoScene>
  width: number; height: number
  frame?: SelectionFrameOptions
  selectionContainMode: 'inside' | 'touching'
  onSelectByGeometry?: (layerIds: Set<string>, mode: SelectionMode) => void
  /** Optional sub-object query using the same pinned region/native lifecycle. */
  query?: (region: SelectionRegion) => Set<string>
  /** A hidden/disabled or changed editing scope cancels without applying. */
  enabled?: boolean
  contextKey?: string
}

export interface UseSelectionToolsReturn {
  selectionOverlay: SelectionOverlay | null
  /** Live gesture ownership, including the below-threshold pointer-down phase. */
  isSelectionActive: () => boolean
  beginSelectionDrag: (tool: SelectionTool, mode: SelectionMode, cx: number, cy: number,
    pointerId: number, pointer?: PointerGestureStart) => void
}

/** React adapter over one shared native-pointer region session. Pins the
 * displayed scene, frame, containment and style until release; source/frame
 * changes cancel rather than selecting stale geometry. Every start uses the
 * native canvas rect (including pan/zoom); preview stays in composition pixels.
 * Unmount, mode/scope change and disabling release capture/listeners. Selection
 * is UI-only and never opens a source transaction or writes Undo history.
 */
export function useSelectionTools(opts: UseSelectionToolsOptions): UseSelectionToolsReturn {
  const latest = useRef(opts); latest.current = opts
  const session = useRef<SelectionRegionSession | null>(null)
  const [selectionOverlay, setSelectionOverlay] = useState<SelectionOverlay | null>(null)
  const beginSelectionDrag = useCallback((tool: SelectionTool, mode: SelectionMode, cx: number, cy: number,
    pointerId: number, pointer?: PointerGestureStart) => {
    const start = latest.current, canvas = start.canvasRef.current, source = start.sceneRef.current
    if (start.enabled === false || !canvas || !source || !start.onSelectByGeometry || session.current) return
    const rect = canvas.getBoundingClientRect()
    const startClient = { x: rect.left + cx * rect.width / start.width, y: rect.top + cy * rect.height / start.height }
    session.current = new SelectionRegionSession(startClient, tool, mode, {
      eventTarget: window,
      world: point => {
        const area = canvas.getBoundingClientRect()
        return { x: (point.x - area.left) * start.width / area.width, y: (point.y - area.top) * start.height / area.height }
      },
      current: () => latest.current.enabled !== false && latest.current.contextKey === start.contextKey && latest.current.sceneRef.current === source
        && latest.current.frame?.timeMs === start.frame?.timeMs && latest.current.frame?.overrides === start.frame?.overrides,
      query: region => start.query ? start.query(region) : layersInSelectionRegion(source, region, start.selectionContainMode, start.frame),
      show: setSelectionOverlay,
      select: (ids, selectionMode) => latest.current.onSelectByGeometry?.(ids, selectionMode),
      closed: () => { session.current = null },
    }, pointer ?? { pointerId, currentTarget: canvas })
  }, [])
  useEffect(() => () => session.current?.cancel(), [opts.contextKey, opts.enabled])
  return { selectionOverlay, beginSelectionDrag, isSelectionActive: () => session.current !== null }
}
