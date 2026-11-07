import {
  useCallback, useRef,
  type RefObject, type MutableRefObject, type Dispatch, type SetStateAction,
} from 'react'
import type { ChronoScene, Layer, BezierPath } from '@/lib/types'
import type { Guide } from '@/lib/snap/AlignmentGuides'
import type { SnapEngine } from '@/lib/snap/SnapEngine'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { ActiveDrag } from '../types/canvasDragTypes'
import { updateLayerProperty } from '@/lib/editor/autoKeyframe'
import { makeUpdateLayerCmd } from '@/lib/editor/commands-layer'
import { makeCloneCmd, type CloneArrayCommand } from '@/lib/editor/commands-clone'
import { bezierPathBounds } from '@/lib/renderer'
import { moveAnchor, moveInHandle, moveOutHandle } from '@/lib/path/pathOps'
import { moveSplinePoint, moveSplineHandle } from '@/lib/spline'
import { applyAxisLock } from '@/lib/canvas/math/moveMath'
import { clampMoveToComposition } from '@/lib/canvas/math/moveBounds'
import { wrapAngle180, angleDegFromPivot, rotatePointAroundPivot } from '@/lib/canvas/math/rotateMath'
import { rotationFromPointer } from '@/lib/canvas/math/rotationGesture'
import { scaleFactorFromDelta, clampScale, scaleTransformAroundPivot } from '@/lib/canvas/math/scaleMath'
import { calculateAnchorMove } from '@/lib/canvas/math/anchorMath'
import { calculateResize } from '@/lib/canvas/math/resizeMath'

/** Smallest allowed layer dimension (composition px). */
const MIN_SIZE = 4

interface SnapState {
  master: boolean; grid: boolean; objects: boolean
  points: boolean; guides: boolean; pixel: boolean; size: number
}

export interface UseCanvasDragOptions {
  canvasRef: RefObject<HTMLCanvasElement>
  compositionRef: { current: { width: number; height: number } }
  sceneRef: { current: ChronoScene }
  editorRef: { current: EditorStateReturn }
  snapRef: { current: SnapState }
  engineRef: RefObject<SnapEngine | null>
  guidesRef: { current: Guide[] }
  readScale: () => { sx: number; sy: number }
  setGuides: (g: Guide[]) => void
  setDragHud: Dispatch<SetStateAction<{ x: number; y: number; label: string } | null>>
  setDragOverrides: Dispatch<SetStateAction<Map<string, number>>>
  onAfterLayerCommit?: (prev: Layer, next: Layer) => void
  onSelectLayer: (id: string | null, shiftHeld?: boolean) => void
}

export interface UseCanvasDragReturn {
  dragRef: MutableRefObject<ActiveDrag | null>
  /** Attach the window pointer listeners after assigning dragRef.current. */
  startDrag: () => void
}

/**
 * Core transform/drag engine: owns the active drag ref and the window-level
 * pointermove / pointerup handlers for every drag kind (move, resize, rotate,
 * scale, anchor, path point, spline point/handle, new-anchor draw). The
 * handlers are referentially STABLE and read all live state from refs, so the
 * window listeners never churn mid-drag. Geometry is delegated to the pure
 * lib/canvas/math modules.
 */
export function useCanvasDrag(opts: UseCanvasDragOptions): UseCanvasDragReturn {
  const {
    canvasRef, compositionRef, sceneRef, editorRef, snapRef, engineRef, guidesRef,
    readScale, setGuides, setDragHud, setDragOverrides,
    onAfterLayerCommit, onSelectLayer,
  } = opts

  const dragRef = useRef<ActiveDrag | null>(null)

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const { width: cw, height: ch } = compositionRef.current
    // Compute the on-screen → composition scale LIVE from the canvas rect.
    // The cached pxScale only refreshes on zoom/width/height changes, so any
    // OTHER layout shift (panel toggle, window resize, mid-pan transition)
    // leaves it stale — dragging then runs at the wrong scale and objects
    // "escape" the cursor or snap back. Reading the rect each move keeps the
    // delta exact; the cache is only a fallback if the canvas is unmounted.
    const { sx, sy } = readScale()
    const dx = (e.clientX - drag.startClientX) * sx
    const dy = (e.clientY - drag.startClientY) * sy

    const snapState = snapRef.current
    // Each snap type is independently gated on the master Enable Snapping.
    //   objects → snap moving layer edges/centres to OTHER layers + canvas
    //   points  → snap moving layer corner points to other layers' corners
    //             (currently shares the snapRect target set with objects)
    //   grid    → snap to the visible composition grid (uses gridSize)
    //   pixel   → round final position / size to integer composition px
    //   guides  → user-placed ruler guides (no ruler-guide UI yet — wired
    //             as a future-proof flag, no behaviour change today)
    const snap = {
      master:  snapState.master,
      objects: snapState.master && snapState.objects,
      points:  snapState.master && snapState.points,
      guides:  snapState.master && snapState.guides,
      grid:    snapState.master && snapState.grid,
      pixel:   snapState.master && snapState.pixel,
      size:    snapState.size,
      // Legacy alias preserved for the anchor branch which only knows about
      // grid snap (anchor doesn't align to other layers — it's a pivot).
      enabled: snapState.master && snapState.grid,
    }

    if (drag.kind === 'move') {
      // Compute delta from the PRIMARY layer's drag — apply that delta to
      // every layer in movingLayers (multi-select preserves relative spacing).
      // Use baseX/baseY (the DISPLAYED position at drag start) so a keyframed
      // layer drags from where it's shown, not its static transform value.
      const primaryMover = drag.movingLayers.find(m => m.id === drag.layerId)
      const primaryOx = primaryMover?.baseX ?? drag.originalLayer.transform.x
      const primaryOy = primaryMover?.baseY ?? drag.originalLayer.transform.y
      // Shift held → constrain to the dominant axis (Figma / Illustrator
      // standard — user just drags in the direction they want and Shift
      // locks it). Cleaner than separate "Ctrl=horizontal, Ctrl+Shift=
      // vertical" mappings: one key, intuitive, no need to remember which
      // modifier means which axis.
      // Hard axis lock from Move-mode arrows beats Shift's dominant-axis logic.
      const { dx: dxLocked, dy: dyLocked } = applyAxisLock(dx, dy, drag.axisLock, e.shiftKey)
      let pnx = primaryOx + dxLocked
      let pny = primaryOy + dyLocked

      // ── BL-26: delegate the object → grid → pixel chain to SnapEngine ──
      // The engine reads master + per-type toggles + grid size from its
      // settings (kept fresh by the engineRef useEffect above). Same math
      // as before, just routed through one place so vertex / segment snap
      // (BL-27) can plug into the same pipeline.
      const movingIds = new Set(drag.movingLayers.map(m => m.id))
      const otherRects = sceneRef.current.layers
        .filter(l => !movingIds.has(l.id) && !l.hidden && l.type !== 'audio' && l.size)
        .map(l => ({
          id: l.id, x: l.transform.x, y: l.transform.y,
          width: l.size!.width, height: l.size!.height,
        }))
      const snapped = engineRef.current!.snapRect(
        { x: pnx + (drag.boundsOffsetX ?? 0), y: pny + (drag.boundsOffsetY ?? 0), width: drag.width, height: drag.height },
        { canvasWidth: cw, canvasHeight: ch, otherLayers: otherRects },
      )
      pnx = snapped.point.x - (drag.boundsOffsetX ?? 0)
      pny = snapped.point.y - (drag.boundsOffsetY ?? 0)
      // Guide overlay — clear if the engine returned none, otherwise show.
      if (snapped.guides.length > 0) setGuides(snapped.guides)
      else if (guidesRef.current.length > 0) setGuides([])

      const clamped = clampMoveToComposition(
        pnx, pny, drag.width, drag.height, cw, ch, drag.boundsOffsetX, drag.boundsOffsetY,
      )
      pnx = clamped.x
      pny = clamped.y
      const actualDx = pnx - primaryOx
      const actualDy = pny - primaryOy

      let next = sceneRef.current
      // Drag overrides force the canvas to show the cursor-follow position even
      // when the layer's transform.x/y is keyframed — without them the renderer
      // evaluates the timeline track and the layer appears frozen at its
      // keyframed value while only the snap guides move. (Preview only; the
      // commit path / auto-key still decides whether a keyframe is written.)
      const nextDragOverrides = new Map<string, number>()
      for (const { id, baseX, baseY } of drag.movingLayers) {
        const nx = baseX + actualDx
        const ny = baseY + actualDy
        next = updateLayerProperty(next, id, 'transform.x', nx)
        next = updateLayerProperty(next, id, 'transform.y', ny)
        nextDragOverrides.set(`layers.${id}.transform.x`, nx)
        nextDragOverrides.set(`layers.${id}.transform.y`, ny)
      }
      editorRef.current.previewTransaction(next)
      setDragOverrides(nextDragOverrides)
      const cloneTag = drag.cloneMode
        ? (drag.cloneMode === 'instance' ? '⧉ Instance   ' : '⧉ Copy   ')
        : ''
      setDragHud({
        x: e.clientX, y: e.clientY,
        label: `${cloneTag}X ${Math.round(pnx)}   Y ${Math.round(pny)}`,
      })
      return
    }

    if (drag.kind === 'pathPoint') {
      const orig = drag.originalLayer
      if (!orig.path) return
      const a = orig.path.anchors[drag.anchorIndex]
      if (!a) return

      let nextPath: BezierPath
      if (drag.part === 'anchor') {
        nextPath = moveAnchor(orig.path, drag.anchorIndex, dx, dy)
      } else if (drag.part === 'inHandle') {
        const baseX = a.inX ?? a.x
        const baseY = a.inY ?? a.y
        nextPath = moveInHandle(orig.path, drag.anchorIndex, baseX + dx, baseY + dy)
      } else {
        const baseX = a.outX ?? a.x
        const baseY = a.outY ?? a.y
        nextPath = moveOutHandle(orig.path, drag.anchorIndex, baseX + dx, baseY + dy)
      }

      const nextScene: ChronoScene = {
        ...sceneRef.current,
        layers: sceneRef.current.layers.map((l) => l.id !== drag.layerId ? l : { ...l, path: nextPath }),
      }
      editorRef.current.previewTransaction(nextScene)
      return
    }

    // BL-73 Sprint 4 — drag a spline point (handles follow) or a bezier handle
    // (smooth/bezier continuity applied). Always mutate from the drag-start
    // snapshot so the delta is absolute, not accumulated.
    if (drag.kind === 'splinePoint' || drag.kind === 'splineHandle') {
      const orig = drag.originalLayer
      if (orig.type !== 'spline' || !orig.spline) return
      const localDelta = drag.worldToLocal.applyToVector({ x: dx, y: dy })
      const nextSpline = drag.kind === 'splinePoint'
        ? moveSplinePoint(orig.spline, drag.pointId, drag.startX + localDelta.x, drag.startY + localDelta.y)
        : moveSplineHandle(orig.spline, drag.pointId, drag.handleKind, drag.startX + localDelta.x, drag.startY + localDelta.y)
      const nextScene: ChronoScene = {
        ...sceneRef.current,
        layers: sceneRef.current.layers.map((l) => l.id !== drag.layerId ? l : { ...l, spline: nextSpline }),
      }
      editorRef.current.previewTransaction(nextScene)
      return
    }

    // BL-66 — Pen Tool, new anchor being placed: drag distance turns a corner
    // anchor into a smooth one with outHandle at the cursor (inHandle mirrored).
    if (drag.kind === 'newAnchorDraw') {
      const layer = sceneRef.current.layers.find(l => l.id === drag.layerId)
      if (!layer?.path) return
      const dragDist = Math.hypot(e.clientX - drag.startClientX, e.clientY - drag.startClientY)
      // Cursor in layer-local coordinates (dx,dy already in composition px).
      const handleX = drag.anchorX + dx
      const handleY = drag.anchorY + dy
      const anchors = layer.path.anchors.slice()
      if (dragDist > 5) {
        anchors[drag.anchorIndex] = {
          x: drag.anchorX, y: drag.anchorY,
          outX: handleX, outY: handleY,
          inX: 2 * drag.anchorX - handleX,
          inY: 2 * drag.anchorY - handleY,
          pointType: 'smooth',
        }
      } else {
        anchors[drag.anchorIndex] = {
          x: drag.anchorX, y: drag.anchorY,
          pointType: 'corner',
        }
      }
      const nextScene: ChronoScene = {
        ...sceneRef.current,
        layers: sceneRef.current.layers.map((l) =>
          l.id !== drag.layerId ? l : { ...l, path: { ...layer.path!, anchors } },
        ),
      }
      editorRef.current.previewTransaction(nextScene)
      // Subtle HUD so the user sees the handle length
      setDragHud({
        x: e.clientX, y: e.clientY,
        label: dragDist > 5 ? `Smooth · ${Math.round(dragDist)}px` : 'Corner',
      })
      return
    }

    if (drag.kind === 'scaleAxis') {
      // Sensitivity — 100 composition px of drag doubles the scale.
      // Positive drag (right/down) = bigger; negative = smaller. Shift =
      // uniform regardless of which arrow was grabbed. Scale is floored at
      // MIN_SCALE below so a layer can't flip past zero / vanish.
      const axis = e.shiftKey ? 'both' : drag.axis
      const { factorX, factorY } = scaleFactorFromDelta(dx, dy, axis)

      if (drag.multiLayerOrigins && drag.multiLayerOrigins.length > 0
          && drag.pivotX != null && drag.pivotY != null) {
        // BL-03: multi-select scale around common pivot. Each layer's
        // position-offset from pivot is multiplied by the factor so layers
        // both grow AND spread out (or shrink and pull in).
        let scene = sceneRef.current
        for (const o of drag.multiLayerOrigins) {
          const { x: nx, y: ny } = scaleTransformAroundPivot(
            o.originalX, o.originalY,
            o.originalLayer.transform.anchorX, o.originalLayer.transform.anchorY,
            drag.pivotX, drag.pivotY, factorX, factorY,
          )
          const nsx = clampScale(o.originalScaleX, factorX)
          const nsy = clampScale(o.originalScaleY, factorY)
          scene = updateLayerProperty(scene, o.layerId, 'transform.x',      nx)
          scene = updateLayerProperty(scene, o.layerId, 'transform.y',      ny)
          scene = updateLayerProperty(scene, o.layerId, 'transform.scaleX', nsx)
          scene = updateLayerProperty(scene, o.layerId, 'transform.scaleY', nsy)
        }
        editorRef.current.previewTransaction(scene)
        setDragHud({
          x: e.clientX, y: e.clientY,
          label: `${(factorX * 100).toFixed(0)}% × ${(factorY * 100).toFixed(0)}%  (${drag.multiLayerOrigins.length} layers)`,
        })
      } else {
        const o = drag.originalLayer.transform
        const nsx = clampScale(o.scaleX, factorX)
        const nsy = clampScale(o.scaleY, factorY)
        let next = updateLayerProperty(sceneRef.current, drag.layerId, 'transform.scaleX', nsx)
        next     = updateLayerProperty(next,             drag.layerId, 'transform.scaleY', nsy)
        editorRef.current.previewTransaction(next)
        setDragHud({
          x: e.clientX, y: e.clientY,
          label: `SX ${nsx.toFixed(2)}   SY ${nsy.toFixed(2)}`,
        })
      }
      return
    }

    if (drag.kind === 'rotate') {
      // Pointer angle from pivot → delta vs. start angle. Shift = snap to 15°.
      const rect = canvasRef.current!.getBoundingClientRect()
      const wx = (e.clientX - rect.left) * (compositionRef.current.width  / rect.width)
      const wy = (e.clientY - rect.top)  * (compositionRef.current.height / rect.height)
      const single = drag.gesture ? rotationFromPointer(drag.gesture, { x: wx, y: wy }, e.shiftKey) : null
      const curAngle = angleDegFromPivot(drag.anchorWorldX, drag.anchorWorldY, wx, wy)
      let delta = single?.delta ?? (curAngle - drag.startAngle)
      if (!single && e.shiftKey) delta = Math.round(delta / 15) * 15

      if (drag.multiLayerOrigins && drag.multiLayerOrigins.length > 0) {
        // BL-03: multi-select rotation around common pivot.
        let scene = sceneRef.current
        for (const o of drag.multiLayerOrigins) {
          // Anchor of this layer at drag start (its rotation pivot for translation)
          const ax = o.originalX + o.originalLayer.transform.anchorX
          const ay = o.originalY + o.originalLayer.transform.anchorY
          const { x: nx, y: ny } = rotatePointAroundPivot(ax, ay, drag.anchorWorldX, drag.anchorWorldY, delta)
          // Apply rotated translation + cumulative rotation
          const rot = wrapAngle180(o.originalRotation + delta)
          scene = updateLayerProperty(scene, o.layerId, 'transform.x', nx - o.originalLayer.transform.anchorX)
          scene = updateLayerProperty(scene, o.layerId, 'transform.y', ny - o.originalLayer.transform.anchorY)
          scene = updateLayerProperty(scene, o.layerId, 'transform.rotationDeg', rot)
        }
        editorRef.current.previewTransaction(scene)
        setDragHud({
          x: e.clientX, y: e.clientY,
          label: `${delta.toFixed(1)}°  (${drag.multiLayerOrigins.length} layers)`,
        })
      } else {
        // Single-layer (existing) behavior
        const nextRot = single?.rotationDeg ?? wrapAngle180(drag.originalRotation + delta)
        const next = updateLayerProperty(sceneRef.current, drag.layerId, 'transform.rotationDeg', nextRot)
        editorRef.current.previewTransaction(next)
        setDragOverrides(new Map([[`layers.${drag.layerId}.transform.rotationDeg`, nextRot]]))
        setDragHud({
          x: e.clientX, y: e.clientY,
          label: `${nextRot.toFixed(1)}°`,
        })
      }
      return
    }

    if (drag.kind === 'anchor') {
      // The cursor and snapping use composition coordinates; anchor values
      // live in geometry-local coordinates. The helper maps through the
      // displayed parent/rotation/scale and compensates x/y so the artwork
      // stays pinned while the pivot follows the cursor.
      const orig = drag.displayTransform
      const { anchorX: nAX, anchorY: nAY, x: nX, y: nY } = calculateAnchorMove({
        x: orig.x, y: orig.y,
        anchorX: orig.anchorX, anchorY: orig.anchorY,
        rotationDeg: orig.rotationDeg, scaleX: orig.scaleX, scaleY: orig.scaleY,
        dx, dy,
        parentWorld: drag.parentWorld,
        snapGrid: snap.grid, snapPixel: snap.pixel, gridSize: snap.size,
      })

      const nextScene: ChronoScene = {
        ...sceneRef.current,
        layers: sceneRef.current.layers.map((l) => l.id !== drag.layerId ? l : {
          ...l,
          transform: { ...l.transform, anchorX: nAX, anchorY: nAY, x: nX, y: nY },
        }),
      }
      editorRef.current.previewTransaction(nextScene)
      setDragOverrides(new Map([
        [`layers.${drag.layerId}.transform.x`, nX],
        [`layers.${drag.layerId}.transform.y`, nY],
      ]))
      setDragHud({
        x: e.clientX, y: e.clientY,
        label: `Anchor  ${Math.round(nAX)}, ${Math.round(nAY)}`,
      })
      return
    }

    // ── Resize ────────────────────────────────────────────────────────────
    // calculateResize owns the geometry: per-handle deltas, Cmd/Ctrl aspect
    // lock, min-size + pixel snap + composition-bounds clamp, and keeping the
    // anchor's proportional position across the resize.
    const layer = drag.originalLayer
    if (!layer.size) return
    const proportional = e.metaKey || e.ctrlKey  // Cmd/Ctrl → aspect-lock

    const { x: nx, y: ny, width: nw, height: nh, anchorX: nax, anchorY: nay } = calculateResize({
      x: layer.transform.x, y: layer.transform.y,
      width: layer.size.width, height: layer.size.height,
      anchorX: layer.transform.anchorX, anchorY: layer.transform.anchorY,
      handle: drag.handle,
      dx, dy,
      proportional,
      snapPixel: snap.pixel,
      minSize: MIN_SIZE,
      boundsWidth: cw, boundsHeight: ch,
    })

    const nextScene: ChronoScene = {
      ...sceneRef.current,
      layers: sceneRef.current.layers.map((l) => l.id !== drag.layerId ? l : {
        ...l,
        transform: { ...l.transform, x: nx, y: ny, anchorX: nax, anchorY: nay },
        size: { width: nw, height: nh },
      }),
    }
    editorRef.current.previewTransaction(nextScene)
    setDragHud({
      x: e.clientX, y: e.clientY,
      label: `W ${Math.round(nw)}   H ${Math.round(nh)}`,
    })
  }, [readScale])

  const handlePointerUp = useCallback(() => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup',   handlePointerUp)
    // Clear alignment guides + drag HUD once the drag is over
    setGuides([])
    setDragHud(null)
    // Drop the move-drag preview overrides — the committed scene (and auto-key,
    // if active) now drives what the canvas shows.
    setDragOverrides((prev) => (prev.size > 0 ? new Map() : prev))

    const ed = editorRef.current
    const finalLayer = ed.scene.layers.find((l) => l.id === drag.layerId)
    if (!finalLayer) { ed.cancelTransaction(); return }

    // Path point drag — commit if path actually changed
    if (drag.kind === 'pathPoint') {
      const pChanged = JSON.stringify(finalLayer.path) !== JSON.stringify(drag.originalLayer.path)
      if (!pChanged) { ed.cancelTransaction(); return }
      ed.commitTransaction(makeUpdateLayerCmd(drag.layerId, finalLayer, drag.originalLayer))
      onAfterLayerCommit?.(drag.originalLayer, finalLayer)
      return
    }

    // BL-73 Sprint 4 — spline point / handle drag commit.
    if (drag.kind === 'splinePoint' || drag.kind === 'splineHandle') {
      const changed = JSON.stringify(finalLayer.spline) !== JSON.stringify(drag.originalLayer.spline)
      if (!changed) { ed.cancelTransaction(); return }
      ed.commitTransaction(makeUpdateLayerCmd(drag.layerId, finalLayer, drag.originalLayer))
      onAfterLayerCommit?.(drag.originalLayer, finalLayer)
      return
    }

    // BL-66 — New anchor placement commit. The preview already holds the
    // final shape (corner or smooth with handles); just commit the diff.
    // Anchor pivot is auto-centred on the path AABB so rotate / scale gizmos
    // pivot around the path's visual centre instead of canvas origin.
    if (drag.kind === 'newAnchorDraw') {
      const pChanged = JSON.stringify(finalLayer.path) !== JSON.stringify(drag.originalLayer.path)
      if (!pChanged) { ed.cancelTransaction(); return }
      let committed = finalLayer
      if (finalLayer.path && finalLayer.path.anchors.length > 0) {
        const bb = bezierPathBounds(finalLayer.path)
        committed = {
          ...finalLayer,
          transform: {
            ...finalLayer.transform,
            anchorX: bb.x + bb.width  / 2,
            anchorY: bb.y + bb.height / 2,
          },
        }
      }
      ed.commitTransaction(makeUpdateLayerCmd(drag.layerId, committed, drag.originalLayer))
      onAfterLayerCommit?.(drag.originalLayer, committed)
      return
    }

    if (drag.kind === 'rotate') {
      // BL-03: multi-select rotate → batch every changed layer into a single
      // undo step (similar to the multi-move branch below).
      if (drag.multiLayerOrigins && drag.multiLayerOrigins.length > 0) {
        const ops: { layerId: string; next: Layer; prev: Layer }[] = []
        for (const o of drag.multiLayerOrigins) {
          const fl = ed.scene.layers.find((l) => l.id === o.layerId)
          if (!fl) continue
          const orig = o.originalLayer
          const changed =
            fl.transform.x !== orig.transform.x ||
            fl.transform.y !== orig.transform.y ||
            fl.transform.rotationDeg !== orig.transform.rotationDeg
          if (changed) ops.push({ layerId: o.layerId, next: fl, prev: orig })
        }
        if (ops.length === 0) { ed.cancelTransaction(); return }
        const cmds = ops.map((op) => makeUpdateLayerCmd(op.layerId, op.next, op.prev))
        ed.commitTransaction({
          label: `Rotate ${ops.length} Layers`,
          execute: (s) => cmds.reduce((sc, c) => c.execute(sc), s),
          undo:    (s) => cmds.slice().reverse().reduce((sc, c) => c.undo(sc), s),
        })
        return
      }
      const rChanged = finalLayer.transform.rotationDeg !== drag.originalLayer.transform.rotationDeg
      if (!rChanged) { ed.cancelTransaction(); return }
      ed.commitTransaction(makeUpdateLayerCmd(drag.layerId, finalLayer, drag.originalLayer))
      onAfterLayerCommit?.(drag.originalLayer, finalLayer)
      return
    }

    // BL-03: Multi-layer scale → batch one undo step (same pattern as
    // multi-rotate + multi-move).
    if (drag.kind === 'scaleAxis' && drag.multiLayerOrigins && drag.multiLayerOrigins.length > 0) {
      const ops: { layerId: string; next: Layer; prev: Layer }[] = []
      for (const o of drag.multiLayerOrigins) {
        const fl = ed.scene.layers.find((l) => l.id === o.layerId)
        if (!fl) continue
        const orig = o.originalLayer
        const changed =
          fl.transform.x      !== orig.transform.x ||
          fl.transform.y      !== orig.transform.y ||
          fl.transform.scaleX !== orig.transform.scaleX ||
          fl.transform.scaleY !== orig.transform.scaleY
        if (changed) ops.push({ layerId: o.layerId, next: fl, prev: orig })
      }
      if (ops.length === 0) { ed.cancelTransaction(); return }
      const cmds = ops.map((op) => makeUpdateLayerCmd(op.layerId, op.next, op.prev))
      ed.commitTransaction({
        label: `Scale ${ops.length} Layers`,
        execute: (s) => cmds.reduce((sc, c) => c.execute(sc), s),
        undo:    (s) => cmds.slice().reverse().reduce((sc, c) => c.undo(sc), s),
      })
      return
    }

    // Clone-drag commit → for each dragged original, create a clone at the
    // dragged offset. commitTransaction applies the command to the BASE scene
    // (originals at their start positions, no clones), so the originals stay
    // put and the clones land at the drop position. ONE undo step.
    if (drag.kind === 'move' && drag.cloneMode) {
      const mode = drag.cloneMode
      const cloneCmds: CloneArrayCommand[] = []
      for (const { id, originalLayer } of drag.movingLayers) {
        const moved = ed.scene.layers.find((l) => l.id === id)
        if (!moved) continue
        const offX = moved.transform.x - originalLayer.transform.x
        const offY = moved.transform.y - originalLayer.transform.y
        cloneCmds.push(makeCloneCmd({
          source: originalLayer, count: 1, offsetX: offX, offsetY: offY,
          timeline: null, allLayers: ed.scene.layers,
          duplicateAnimation: false, mode,
        }))
      }
      if (cloneCmds.length === 0) { ed.cancelTransaction(); return }
      const verb = mode === 'instance' ? 'Instance' : 'Clone'
      const combined: CloneArrayCommand = cloneCmds.length === 1
        ? cloneCmds[0]
        : {
            label: `${verb} ${cloneCmds.length} layers`,
            execute: (s) => cloneCmds.reduce((sc, c) => c.execute(sc), s),
            undo:    (s) => cloneCmds.slice().reverse().reduce((sc, c) => c.undo(sc), s),
            layerMetadata: Object.assign({}, ...cloneCmds.map((c) => c.layerMetadata)),
            result: {
              label: `${verb} ${cloneCmds.length} layers`,
              createdLayerIds: cloneCmds.flatMap((c) => c.result.createdLayerIds),
              createdTrackTargets: cloneCmds.flatMap((c) => c.result.createdTrackTargets),
              suggestedSelection: cloneCmds.flatMap((c) => c.result.suggestedSelection),
            },
          }
      ed.commitTransaction(combined)
      // Select the primary clone so the user keeps working on the new copy.
      const primaryCloneId = cloneCmds[0].result.suggestedSelection[0]
        ?? cloneCmds[0].result.createdLayerIds[0]
      if (primaryCloneId) onSelectLayer(primaryCloneId)
      return
    }

    // Multi-layer move → batch one undo step
    if (drag.kind === 'move' && drag.movingLayers.length > 1) {
      const moved: { layerId: string; next: Layer; prev: Layer }[] = []
      for (const { id, originalLayer } of drag.movingLayers) {
        const fl = ed.scene.layers.find(l => l.id === id)
        if (!fl) continue
        if (fl.transform.x !== originalLayer.transform.x ||
            fl.transform.y !== originalLayer.transform.y) {
          moved.push({ layerId: id, next: fl, prev: originalLayer })
        }
      }
      if (moved.length === 0) { ed.cancelTransaction(); return }
      const cmds = moved.map(m => makeUpdateLayerCmd(m.layerId, m.next, m.prev))
      // Lazy-load batch builder so this file's bundle stays cool.
      import('@/lib/editor/commands-batch').then(({ makeBatchCmd }) => {
        ed.commitTransaction(makeBatchCmd(`Move ${moved.length} layers`, cmds))
        moved.forEach((m) => onAfterLayerCommit?.(m.prev, m.next))
      }).catch(() => {
        // Fallback: commit primary only
        ed.commitTransaction(cmds[0])
        onAfterLayerCommit?.(moved[0].prev, moved[0].next)
      })
      return
    }

    // Only commit if something actually changed. Anchor lives on the
    // transform too — must be included or anchor-only drags get reverted.
    const orig = drag.originalLayer
    const tChanged =
      finalLayer.transform.x       !== orig.transform.x ||
      finalLayer.transform.y       !== orig.transform.y ||
      finalLayer.transform.anchorX !== orig.transform.anchorX ||
      finalLayer.transform.anchorY !== orig.transform.anchorY ||
      finalLayer.transform.rotationDeg !== orig.transform.rotationDeg ||
      finalLayer.transform.scaleX  !== orig.transform.scaleX ||
      finalLayer.transform.scaleY  !== orig.transform.scaleY
    const sChanged = !!finalLayer.size && !!orig.size && (
      finalLayer.size.width  !== orig.size.width ||
      finalLayer.size.height !== orig.size.height
    )
    if (!tChanged && !sChanged) { ed.cancelTransaction(); return }
    ed.commitTransaction(makeUpdateLayerCmd(drag.layerId, finalLayer, orig))
    onAfterLayerCommit?.(orig, finalLayer)
  }, [handlePointerMove, onAfterLayerCommit, onSelectLayer])

  // Attach the window-level pointer listeners for an in-progress drag. Callers
  // assign dragRef.current = <ActiveDrag> first, then call this.
  const startDrag = useCallback(() => {
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup',   handlePointerUp)
  }, [handlePointerMove, handlePointerUp])

  return { dragRef, startDrag }
}
