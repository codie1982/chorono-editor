'use client'
import {
  useRef, useEffect, useCallback, useState, useLayoutEffect, useMemo,
} from 'react'
import type { ChronoScene, Layer, BezierPath } from '@/lib/types'
import { hitTestLayer, hitTestLayersAt, type AssetElementMap } from '@/lib/renderer'
import { canvasRenderer } from '@/lib/render/CanvasRenderer'
import { updateLayerProperty } from '@/lib/editor/autoKeyframe'
import { makeUpdateLayerCmd } from '@/lib/editor/commands-layer'
import { hitTestPath, moveAnchor, moveInHandle, moveOutHandle } from '@/lib/path/pathOps'
import {
  buildSnapTargets, snapRect, type Guide,
} from '@/lib/snap/AlignmentGuides'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'

interface Props {
  scene: ChronoScene
  editor: EditorStateReturn
  timeMs: number
  selectedLayerId: string | null
  /** Multi-selection set — when set has >1 entries, drag operations move
   *  ALL of them together (group-style transform). */
  selectedLayerIds?: Set<string>
  assets: AssetElementMap
  onSelectLayer: (id: string | null) => void
  /** Optional pre-computed override map from the interactive runtime hook
   *  (already merges timeline + param + binding overrides). */
  overrides?:    Map<string, number>
  /** Runtime parameter values for text placeholder + colour resolution. */
  paramValues?:  Map<string, string | number | boolean>
  /** When true, canvas clicks on layers with tappable:true fire a runtime
   *  'click' event INSTEAD of changing selection. Used by RuntimePreviewPanel
   *  to exercise event bindings without leaving the builder. */
  previewMode?:  boolean
  /** Called with the layer id when a tappable layer is clicked in preview mode. */
  onLayerClickInPreview?: (layerId: string) => void
  /** Preview-mode drag events on draggable layers — fires Trigger events. */
  onLayerDragInPreview?: (
    layerId: string,
    phase:   'start' | 'move' | 'end',
    dx:      number,
    dy:      number,
    progress:number,
  ) => void
  /** Optional external control of pan mode — when provided, SceneCanvas reads
   *  from this prop instead of its internal toggle. Lets the top toolbar drive
   *  the canvas tool state without lifting all state. */
  panMode?: boolean
  onPanModeChange?: (next: boolean) => void
  /** External tool mode (select/pan/pen). When 'pen' and a path layer is
   *  selected, canvas clicks insert new anchors instead of starting drags. */
  toolMode?: 'select' | 'pan' | 'pen'
  /** Fullscreen toggle — when provided, FitMenu shows an "⛶ Fullscreen
   *  canvas" item and reflects the current state. */
  fullscreen?: boolean
  onToggleFullscreen?: () => void
}

const PADDING   = 24
const MIN_ZOOM  = 0.1
const MAX_ZOOM  = 8
const ZOOM_STEP = 1.25
const MIN_SIZE  = 4    // smallest allowed layer dimension (px in composition space)

type Handle = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se'

interface MoveState {
  kind: 'move'
  /** Primary (the layer actually clicked). Used for snapshot + selection focus. */
  layerId: string
  originalLayer: Layer
  /** All layers being moved together — primary + multi-selection peers. */
  movingLayers: { id: string; originalLayer: Layer }[]
  startClientX: number
  startClientY: number
  width:  number
  height: number
}

interface ResizeState {
  kind: 'resize'
  layerId: string
  originalLayer: Layer
  handle: Handle
  startClientX: number
  startClientY: number
}

interface AnchorState {
  kind: 'anchor'
  layerId: string
  originalLayer: Layer
  startClientX: number
  startClientY: number
}

/** Rotation drag — rotates the layer around its anchor point. */
interface RotateState {
  kind: 'rotate'
  layerId: string
  originalLayer: Layer
  /** Pointer position at drag start (shared with other drag kinds). */
  startClientX: number
  startClientY: number
  /** Initial angle (degrees) from anchor to pointer at drag start. */
  startAngle: number
  /** Original rotation (degrees) so we can add the delta on top. */
  originalRotation: number
  /** World coords of the layer's anchor (rotation pivot). */
  anchorWorldX: number
  anchorWorldY: number
}

interface PathPointDrag {
  kind: 'pathPoint'
  layerId: string
  originalLayer: Layer
  startClientX: number
  startClientY: number
  /** Index of the anchor being moved in layer.path.anchors */
  anchorIndex: number
  /** Which part of the anchor is being moved */
  part: 'anchor' | 'inHandle' | 'outHandle'
}

type ActiveDrag = MoveState | ResizeState | AnchorState | PathPointDrag | RotateState

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function snapToGrid(v: number, step: number): number {
  if (step <= 0) return v
  return Math.round(v / step) * step
}

const HANDLE_CURSORS: Record<Handle, string> = {
  nw: 'nwse-resize', se: 'nwse-resize',
  ne: 'nesw-resize', sw: 'nesw-resize',
  n:  'ns-resize',   s:  'ns-resize',
  e:  'ew-resize',   w:  'ew-resize',
}

export default function SceneCanvas({
  scene, editor, timeMs, selectedLayerId, selectedLayerIds, assets, onSelectLayer,
  overrides, paramValues, previewMode, onLayerClickInPreview, onLayerDragInPreview,
  panMode: controlledPanMode, onPanModeChange, toolMode,
  fullscreen, onToggleFullscreen,
}: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const { width, height } = scene.composition

  // ── Zoom ──────────────────────────────────────────────────────────────────
  const [zoom, setZoom]       = useState(1)
  const [maxSide, setMaxSide] = useState({ w: 0, h: 0 })

  // ── Snap config (master toggle + per-type) + grid size ──────────────────
  // Master Enable Snapping (Alt+S) overrides everything; per-type checkboxes
  // let the user keep, e.g., guides on while turning grid off. Keeping the
  // structure mirrors SVGator / Figma / Sketch.
  const [snapEnabled,   setSnapEnabled]   = useState(true)   // master
  const [snapToGridOn,  setSnapToGridOn]  = useState(false)  // grid only
  const [snapToObjects, setSnapToObjects] = useState(true)
  const [snapToPoints,  setSnapToPoints]  = useState(true)
  const [snapToGuides,  setSnapToGuides]  = useState(true)
  const [snapToPixel,   setSnapToPixel]   = useState(false)
  const [gridSize, setGridSize]           = useState(20)
  const snapRef = useRef({
    master: true, grid: false, objects: true, points: true, guides: true, pixel: false,
    size: 20,
  })
  useEffect(() => {
    snapRef.current = {
      master: snapEnabled,
      grid:   snapToGridOn,
      objects: snapToObjects,
      points:  snapToPoints,
      guides:  snapToGuides,
      pixel:   snapToPixel,
      size:    gridSize,
    }
  }, [snapEnabled, snapToGridOn, snapToObjects, snapToPoints, snapToGuides, snapToPixel, gridSize])

  // ── View options (rulers + grid front/back) ──────────────────────────────
  const [showRulers,  setShowRulers]  = useState(true)
  const [gridInFront, setGridInFront] = useState(false)
  const [showGuides,  setShowGuides]  = useState(true)

  // ── Alignment guides (canvas-center / edges / other-layer snap) ─────────
  // Active guides are stored in a ref AND state so changes trigger render
  // but inside-pointermove updates don't re-create handler closures.
  const [activeGuides, setActiveGuides] = useState<Guide[]>([])
  const guidesRef = useRef<Guide[]>([])
  const setGuides = (g: Guide[]) => {
    guidesRef.current = g
    setActiveGuides(g)
  }

  // ── Pan mode (move the whole view instead of objects) ───────────────────
  // Controlled (via props) when parent provides it; otherwise self-managed.
  const [internalPanMode, setInternalPanMode] = useState(false)
  const panMode = controlledPanMode ?? internalPanMode
  const setPanMode = (next: boolean | ((p: boolean) => boolean)) => {
    const resolved = typeof next === 'function' ? next(panMode) : next
    if (onPanModeChange) onPanModeChange(resolved)
    else setInternalPanMode(resolved)
  }
  const [pan, setPan]         = useState({ x: 0, y: 0 })
  const panDragRef = useRef<{
    startClientX: number; startClientY: number; startPan: { x: number; y: number }
  } | null>(null)

  // ── Hover preview (red outline of the layer that would be selected) ─────
  const [hoveredLayerId, setHoveredLayerId] = useState<string | null>(null)
  const hoverRafRef = useRef<number | null>(null)

  // ── Fit menu (dropdown opens above the Fit button) ──────────────────────
  const [fitMenuOpen, setFitMenuOpen] = useState(false)
  const fitMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!fitMenuOpen) return
    const close = (e: MouseEvent) => {
      if (fitMenuRef.current && !fitMenuRef.current.contains(e.target as Node)) setFitMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [fitMenuOpen])

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      setMaxSide({ w: r.width - PADDING * 2, h: r.height - PADDING * 2 })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fitZoom = useMemo(() => {
    if (maxSide.w <= 0 || maxSide.h <= 0) return 1
    return Math.min(maxSide.w / width, maxSide.h / height, MAX_ZOOM)
  }, [maxSide, width, height])

  // ── Zoom presets ─────────────────────────────────────────────────────────
  /** Pan offset (display px) that places (cx, cy) in composition coords at the
   *  centre of the viewport, given a zoom level. Reverses the flex centring. */
  const panToCentre = useCallback((cx: number, cy: number, z: number) => ({
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

  /** Fit selected layer to viewport (with 40px padding) and centre it. */
  const fitSelection = useCallback(() => {
    const layer = scene.layers.find((l) => l.id === selectedLayerId)
    if (!layer || !layer.size) return
    const PAD = 40
    const z = clamp(
      Math.min((maxSide.w - PAD * 2) / layer.size.width, (maxSide.h - PAD * 2) / layer.size.height),
      MIN_ZOOM, MAX_ZOOM,
    )
    const cx = layer.transform.x + layer.size.width  / 2
    const cy = layer.transform.y + layer.size.height / 2
    setZoom(z); setPan(panToCentre(cx, cy, z))
  }, [scene.layers, selectedLayerId, maxSide, panToCentre])

  /** Re-centre selected layer in the viewport without changing zoom. */
  const centreSelection = useCallback(() => {
    const layer = scene.layers.find((l) => l.id === selectedLayerId)
    if (!layer) return
    const w = layer.size?.width  ?? (layer.text?.fontSize ? 120 : 80)
    const h = layer.size?.height ?? (layer.text?.fontSize ?? 24)
    const cx = layer.transform.x + w / 2
    const cy = layer.transform.y + h / 2
    setPan(panToCentre(cx, cy, zoom))
  }, [scene.layers, selectedLayerId, zoom, panToCentre])

  // ── Refs for live values inside window-level pointer listeners ───────────
  const sceneRef = useRef(scene)
  useEffect(() => { sceneRef.current = scene }, [scene])

  const editorRef = useRef(editor)
  useEffect(() => { editorRef.current = editor }, [editor])

  const compositionRef = useRef({ width, height })
  useEffect(() => { compositionRef.current = { width, height } }, [width, height])

  /** Composition-pixels per CSS-pixel (depends on actual displayed canvas size). */
  const pxScale = useRef({ sx: 1, sy: 1 })
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    pxScale.current = {
      sx: rect.width  > 0 ? width  / rect.width  : 1,
      sy: rect.height > 0 ? height / rect.height : 1,
    }
  }, [zoom, width, height])

  const dragRef = useRef<ActiveDrag | null>(null)

  // ── Pointer handlers shared by move + resize (window-level) ──────────────
  const handlePointerMove = useCallback((e: PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const { sx, sy } = pxScale.current
    const dx = (e.clientX - drag.startClientX) * sx
    const dy = (e.clientY - drag.startClientY) * sy
    const { width: cw, height: ch } = compositionRef.current

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
      const primaryOx = drag.originalLayer.transform.x
      const primaryOy = drag.originalLayer.transform.y
      // Shift held → constrain to the dominant axis (Figma / Illustrator
      // standard — user just drags in the direction they want and Shift
      // locks it). Cleaner than separate "Ctrl=horizontal, Ctrl+Shift=
      // vertical" mappings: one key, intuitive, no need to remember which
      // modifier means which axis.
      let dxLocked = dx, dyLocked = dy
      if (e.shiftKey) {
        if (Math.abs(dx) >= Math.abs(dy)) dyLocked = 0
        else                              dxLocked = 0
      }
      let pnx = primaryOx + dxLocked
      let pny = primaryOy + dyLocked

      // ── Snap to Objects / Points (alignment to OTHER layers + canvas) ───
      // Threshold = ~6 screen px regardless of zoom. Snap runs BEFORE grid
      // so pixel-perfect alignment wins over the grid lattice.
      if (snap.objects || snap.points) {
        const SNAP_PX = 6
        const movingIds = new Set(drag.movingLayers.map(m => m.id))
        const otherRects = sceneRef.current.layers
          .filter(l => !movingIds.has(l.id) && !l.hidden && l.type !== 'audio' && l.size)
          .map(l => ({
            id: l.id, x: l.transform.x, y: l.transform.y,
            width: l.size!.width, height: l.size!.height,
          }))
        const targets = buildSnapTargets(cw, ch, otherRects)
        const movingRect = { x: pnx, y: pny, width: drag.width, height: drag.height }
        const snapped = snapRect(movingRect, targets, SNAP_PX)
        pnx = snapped.x
        pny = snapped.y
        setGuides(snapped.guides)
      } else {
        // No object snap → make sure any leftover guides disappear
        if (guidesRef.current.length > 0) setGuides([])
      }

      // ── Snap to Grid ────────────────────────────────────────────────────
      if (snap.grid) {
        pnx = snapToGrid(pnx, snap.size)
        pny = snapToGrid(pny, snap.size)
      }

      // ── Snap to Pixel — always last, rounds the final position ─────────
      if (snap.pixel) {
        pnx = Math.round(pnx)
        pny = Math.round(pny)
      }

      pnx = clamp(pnx, 0, Math.max(0, cw - drag.width))
      pny = clamp(pny, 0, Math.max(0, ch - drag.height))
      const actualDx = pnx - primaryOx
      const actualDy = pny - primaryOy

      let next = sceneRef.current
      for (const { id, originalLayer } of drag.movingLayers) {
        next = updateLayerProperty(next, id, 'transform.x', originalLayer.transform.x + actualDx)
        next = updateLayerProperty(next, id, 'transform.y', originalLayer.transform.y + actualDy)
      }
      editorRef.current.previewTransaction(next)
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

    if (drag.kind === 'rotate') {
      // Pointer angle from layer's anchor center (world coords) → delta from
      // start angle → add to original rotation. Shift = snap to 15°.
      const rect = canvasRef.current!.getBoundingClientRect()
      const wx = (e.clientX - rect.left) * (compositionRef.current.width  / rect.width)
      const wy = (e.clientY - rect.top)  * (compositionRef.current.height / rect.height)
      const dxA = wx - drag.anchorWorldX
      const dyA = wy - drag.anchorWorldY
      const curAngle = (Math.atan2(dyA, dxA) * 180) / Math.PI
      let delta = curAngle - drag.startAngle
      let nextRot = drag.originalRotation + delta
      if (e.shiftKey) nextRot = Math.round(nextRot / 15) * 15
      // Wrap into [-180, 180]
      while (nextRot > 180)  nextRot -= 360
      while (nextRot < -180) nextRot += 360

      const next = updateLayerProperty(sceneRef.current, drag.layerId, 'transform.rotationDeg', nextRot)
      editorRef.current.previewTransaction(next)
      return
    }

    if (drag.kind === 'anchor') {
      // Anchor lives in layer-local coords. Snap is applied to the layer's
      // local axis (so the grid you see on canvas still aligns 1:1).
      const origAX = drag.originalLayer.transform.anchorX
      const origAY = drag.originalLayer.transform.anchorY
      let nAX = origAX + dx
      let nAY = origAY + dy
      if (snap.grid) {
        // Snap the WORLD position of the anchor to the grid, then translate
        // back to local coords. That way the visible anchor handle lands
        // exactly on a grid line.
        const wx = drag.originalLayer.transform.x + nAX
        const wy = drag.originalLayer.transform.y + nAY
        nAX = snapToGrid(wx, snap.size) - drag.originalLayer.transform.x
        nAY = snapToGrid(wy, snap.size) - drag.originalLayer.transform.y
      }
      if (snap.pixel) {
        nAX = Math.round(nAX)
        nAY = Math.round(nAY)
      }
      const nextScene: ChronoScene = {
        ...sceneRef.current,
        layers: sceneRef.current.layers.map((l) => l.id !== drag.layerId ? l : {
          ...l,
          transform: { ...l.transform, anchorX: nAX, anchorY: nAY },
        }),
      }
      editorRef.current.previewTransaction(nextScene)
      return
    }

    // ── Resize ────────────────────────────────────────────────────────────
    const layer = drag.originalLayer
    if (!layer.size) return
    const proportional = e.metaKey || e.ctrlKey  // Cmd/Ctrl → aspect-lock

    const ox = layer.transform.x, oy = layer.transform.y
    const ow = layer.size.width,   oh = layer.size.height
    const h  = drag.handle

    let nx = ox, ny = oy, nw = ow, nh = oh
    // Per-handle raw deltas
    if (h === 'e' || h === 'ne' || h === 'se') nw = ow + dx
    if (h === 'w' || h === 'nw' || h === 'sw') { nw = ow - dx; nx = ox + dx }
    if (h === 's' || h === 'sw' || h === 'se') nh = oh + dy
    if (h === 'n' || h === 'nw' || h === 'ne') { nh = oh - dy; ny = oy + dy }

    // Aspect-lock when Cmd/Ctrl held — use the dominant fractional change
    if (proportional && ow > 0 && oh > 0) {
      const aspect = ow / oh
      const wRatio = nw / ow
      const hRatio = nh / oh
      const useWidth = Math.abs(wRatio - 1) >= Math.abs(hRatio - 1)
      if (useWidth) nh = Math.max(MIN_SIZE, nw / aspect)
      else          nw = Math.max(MIN_SIZE, nh * aspect)
      // Re-anchor x/y on handles that pull from top/left
      if (h === 'nw' || h === 'sw' || h === 'w') nx = ox + (ow - nw)
      if (h === 'nw' || h === 'ne' || h === 'n') ny = oy + (oh - nh)
    }

    // Minimum size + composition-bounds clamp
    nw = Math.max(MIN_SIZE, nw)
    nh = Math.max(MIN_SIZE, nh)

    // ── Snap to Pixel during resize → integer position + integer dim ──────
    // Grid/Object snap is intentionally NOT applied to resize (the moving
    // EDGE has no canonical "rect" to snap relative to and grid-snapping
    // each axis independently produces jarring jumps). Pixel is fine.
    if (snap.pixel) {
      nx = Math.round(nx); ny = Math.round(ny)
      nw = Math.round(nw); nh = Math.round(nh)
    }

    nx = clamp(nx, 0, Math.max(0, cw - nw))
    ny = clamp(ny, 0, Math.max(0, ch - nh))
    nw = Math.min(nw, cw - nx)
    nh = Math.min(nh, ch - ny)

    // ── Preserve anchor's PROPORTIONAL position across resize ──────────
    // If the user placed the anchor visually (e.g. at the centre at 50/100),
    // resizing 100→200 should keep it at 50% width (= new 100, not stuck
    // at the original 50). Without this, scaling shifts the rotation pivot
    // and breaks the user's mental model.
    const oax = layer.transform.anchorX
    const oay = layer.transform.anchorY
    const fx  = ow > 0 ? oax / ow : 0.5
    const fy  = oh > 0 ? oay / oh : 0.5
    const nax = fx * nw
    const nay = fy * nh

    const nextScene: ChronoScene = {
      ...sceneRef.current,
      layers: sceneRef.current.layers.map((l) => l.id !== drag.layerId ? l : {
        ...l,
        transform: { ...l.transform, x: nx, y: ny, anchorX: nax, anchorY: nay },
        size: { width: nw, height: nh },
      }),
    }
    editorRef.current.previewTransaction(nextScene)
  }, [])

  const handlePointerUp = useCallback(() => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup',   handlePointerUp)
    // Clear alignment guides once the drag is over
    setGuides([])

    const ed = editorRef.current
    const finalLayer = ed.scene.layers.find((l) => l.id === drag.layerId)
    if (!finalLayer) { ed.cancelTransaction(); return }

    // Path point drag — commit if path actually changed
    if (drag.kind === 'pathPoint') {
      const pChanged = JSON.stringify(finalLayer.path) !== JSON.stringify(drag.originalLayer.path)
      if (!pChanged) { ed.cancelTransaction(); return }
      ed.commitTransaction(makeUpdateLayerCmd(drag.layerId, finalLayer, drag.originalLayer))
      return
    }

    if (drag.kind === 'rotate') {
      const rChanged = finalLayer.transform.rotationDeg !== drag.originalLayer.transform.rotationDeg
      if (!rChanged) { ed.cancelTransaction(); return }
      ed.commitTransaction(makeUpdateLayerCmd(drag.layerId, finalLayer, drag.originalLayer))
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
      }).catch(() => {
        // Fallback: commit primary only
        ed.commitTransaction(cmds[0])
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
  }, [handlePointerMove])

  // ── Canvas pointerdown → select + start move ─────────────────────────────
  // ── Pan (move whole view) ─────────────────────────────────────────────────
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

  const handleCanvasPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    // Middle-mouse OR pan-mode + left button → pan the view, not the layer
    if (e.button === 1 || (panMode && e.button === 0)) {
      e.preventDefault()
      beginPan(e)
      return
    }
    if (e.button !== 0) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const sx = width  / rect.width
    const sy = height / rect.height
    const cx = (e.clientX - rect.left) * sx
    const cy = (e.clientY - rect.top)  * sy

    // ── Runtime preview mode: clicks on tappable layers fire trigger events
    //    instead of changing selection. Lets the author exercise layer-click
    //    rules without leaving the builder.
    if (previewMode) {
      const stack = hitTestLayersAt(scene, timeMs, cx, cy)
      // Prefer draggable layer over tappable when both are set, since drag
      // requires the drag-start handler to capture the pointer immediately.
      for (const id of stack) {
        const layer = scene.layers.find((l) => l.id === id)
        if (!layer) continue
        if (layer.draggable && onLayerDragInPreview) {
          beginPreviewDrag(layer, e.clientX, e.clientY, cx, cy)
          return
        }
        if (layer.tappable && onLayerClickInPreview) {
          onLayerClickInPreview(id)
          return
        }
      }
      return
    }

    // ── Pen Tool: if a path layer is selected, first check anchor/handle hits
    //    BEFORE the normal layer hit-test. Drag the anchor/handle, not the layer.
    const selectedLayer = scene.layers.find((l) => l.id === selectedLayerId)
    if (selectedLayer && selectedLayer.type === 'path' && selectedLayer.path && !selectedLayer.locked) {
      const lx = cx - selectedLayer.transform.x
      const ly = cy - selectedLayer.transform.y
      const penHit = hitTestPath(selectedLayer.path, lx, ly, 8)
      if (penHit) {
        editor.beginTransaction()
        dragRef.current = {
          kind: 'pathPoint',
          layerId: selectedLayer.id,
          originalLayer: selectedLayer,
          startClientX: e.clientX,
          startClientY: e.clientY,
          anchorIndex: penHit.anchorIndex,
          part: penHit.type,
        }
        window.addEventListener('pointermove', handlePointerMove)
        window.addEventListener('pointerup',   handlePointerUp)
        return
      }

      // Pen mode + click on empty area = APPEND a new anchor (corner type).
      // Lets users build a path by clicking points in sequence.
      if (toolMode === 'pen') {
        const next = {
          ...selectedLayer,
          path: {
            ...selectedLayer.path,
            anchors: [
              ...selectedLayer.path.anchors,
              { x: lx, y: ly, pointType: 'corner' as const },
            ],
          },
        }
        editor.dispatchCommand(makeUpdateLayerCmd(selectedLayer.id, next, selectedLayer))
        return
      }
    }

    // Alt/Option-click cycles through stacked layers under the cursor — useful
    // when a top layer (e.g. a full-canvas background) is blocking selection
    // of layers underneath. Plain click takes the topmost hit.
    //
    // Group semantics (Figma-style): clicking a grouped child SELECTS the
    // topmost ancestor group instead, so the group can be dragged. Alt-click
    // bypasses this and lets you pick the literal child.
    let hit: string | null
    if (e.altKey) {
      const stack = hitTestLayersAt(scene, timeMs, cx, cy)
      if (stack.length === 0) hit = null
      else {
        const cur = selectedLayerId ?? ''
        const idx = stack.indexOf(cur)
        hit = idx === -1 ? stack[0] : stack[(idx + 1) % stack.length]
      }
    } else {
      hit = hitTestLayer(scene, timeMs, cx, cy)
      // Bubble up to topmost ancestor group
      if (hit) {
        let cur = scene.layers.find(l => l.id === hit)
        while (cur?.parentId) {
          const parent = scene.layers.find(l => l.id === cur!.parentId)
          if (!parent) break
          if (parent.type === 'group') hit = parent.id
          cur = parent
        }
      }
    }
    // Don't change selection when clicking on a layer that's already part of
    // the multi-selection (preserves the multi-select set so the upcoming
    // drag moves all peers).
    const inMultiSet = !!hit && (selectedLayerIds?.has(hit) ?? false)
    if (!inMultiSet) onSelectLayer(hit)
    if (!hit) return
    const layer = scene.layers.find((l) => l.id === hit)
    if (!layer || layer.locked) return

    // Build the list of layers to move together. When clicking a member of the
    // multi-selection, every selected (non-locked) layer travels with it.
    const movingLayers: { id: string; originalLayer: Layer }[] = []
    if (inMultiSet && selectedLayerIds && selectedLayerIds.size > 1) {
      // Resolve each selected id to a non-locked layer snapshot
      for (const id of Array.from(selectedLayerIds)) {
        const l = scene.layers.find(x => x.id === id)
        if (l && !l.locked) movingLayers.push({ id: l.id, originalLayer: l })
      }
      // Ensure primary is included (already covered if it's in the set)
    } else {
      movingLayers.push({ id: layer.id, originalLayer: layer })
    }

    editor.beginTransaction()
    dragRef.current = {
      kind: 'move',
      layerId: layer.id,
      originalLayer: layer,
      movingLayers,
      startClientX: e.clientX,
      startClientY: e.clientY,
      width:  layer.size?.width  ?? (layer.text?.fontSize ? 120 : 80),
      height: layer.size?.height ?? (layer.text?.fontSize ?? 24),
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup',   handlePointerUp)
  }, [scene, timeMs, width, height, onSelectLayer, editor, handlePointerMove, handlePointerUp, panMode, beginPan, selectedLayerId, previewMode, onLayerClickInPreview])

  // ── Handle pointerdown → start resize ────────────────────────────────────
  const beginResize = useCallback((handle: Handle) => (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const layer = scene.layers.find((l) => l.id === selectedLayerId)
    if (!layer || layer.locked || !layer.size) return
    editor.beginTransaction()
    dragRef.current = {
      kind: 'resize',
      layerId: layer.id,
      originalLayer: layer,
      handle,
      startClientX: e.clientX,
      startClientY: e.clientY,
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup',   handlePointerUp)
  }, [scene.layers, selectedLayerId, editor, handlePointerMove, handlePointerUp])

  // ── Anchor handle pointerdown → start anchor drag ────────────────────────
  const beginAnchorDrag = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const layer = scene.layers.find((l) => l.id === selectedLayerId)
    if (!layer || layer.locked) return
    editor.beginTransaction()
    dragRef.current = {
      kind: 'anchor',
      layerId: layer.id,
      originalLayer: layer,
      startClientX: e.clientX,
      startClientY: e.clientY,
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup',   handlePointerUp)
  }, [scene.layers, selectedLayerId, editor, handlePointerMove, handlePointerUp])

  // ── Preview-mode drag: fires dragStart/Move/End on draggable layers ────
  // Also writes a TEMPORARY override map entry so the dragged layer visibly
  // follows the cursor (no scene mutation — pure render-time override).
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
  // Map of `layers.<id>.transform.x|y` → number. Merged into renderer
  // overrides so the dragged layer follows the cursor in preview.
  const [dragOverrides, setDragOverrides] = useState<Map<string, number>>(new Map())

  const handlePreviewDragMove = useCallback((e: PointerEvent) => {
    const d = previewDragRef.current
    if (!d) return
    const { sx, sy } = pxScale.current
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
  }, [onLayerDragInPreview])

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
      const { sx, sy } = pxScale.current
      const rawDx = (e.clientX - d.startClientX) * sx
      const rawDy = (e.clientY - d.startClientY) * sy
      const dx = d.axis === 'y' ? 0 : rawDx
      const dy = d.axis === 'x' ? 0 : rawDy
      const dist     = d.axis === 'both' ? Math.hypot(dx, dy) : Math.abs(d.axis === 'x' ? dx : dy)
      const progress = Math.max(0, Math.min(1, dist / Math.max(1, d.range)))
      onLayerDragInPreview(d.layerId, 'end', dx, dy, progress)
    }
  }, [handlePreviewDragMove, onLayerDragInPreview])

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

  // ── Rotation handle (corner-outer area) → rotate around anchor ──────────
  const beginRotate = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const layer = scene.layers.find((l) => l.id === selectedLayerId)
    if (!layer || layer.locked) return

    // Convert click → world (composition) coords for the rotation pivot math.
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const sx = compositionRef.current.width  / rect.width
    const sy = compositionRef.current.height / rect.height
    const wx = (e.clientX - rect.left) * sx
    const wy = (e.clientY - rect.top)  * sy

    const anchorWorldX = layer.transform.x + layer.transform.anchorX
    const anchorWorldY = layer.transform.y + layer.transform.anchorY
    const startAngle   = (Math.atan2(wy - anchorWorldY, wx - anchorWorldX) * 180) / Math.PI

    editor.beginTransaction()
    dragRef.current = {
      kind: 'rotate',
      layerId: layer.id,
      originalLayer: layer,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startAngle,
      originalRotation: layer.transform.rotationDeg,
      anchorWorldX,
      anchorWorldY,
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup',   handlePointerUp)
  }, [scene.layers, selectedLayerId, editor, handlePointerMove, handlePointerUp])

  // ── Render canvas ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Merge timeline/runtime overrides with the temporary drag override so
    // the dragged layer visibly follows the cursor.
    let mergedOverrides = overrides
    if (dragOverrides.size > 0) {
      const m = new Map<string, number>()
      overrides?.forEach((v, k) => m.set(k, v))
      dragOverrides.forEach((v, k) => m.set(k, v))
      mergedOverrides = m
    }
    canvasRenderer.render(
      ctx, scene, timeMs, selectedLayerId, assets,
      {
        // Grid drawn only when both the master snap is on AND the "Snap to
        // grid" type is enabled — matches the visual / behaviour contract
        // ("grid açıksa snap olur, kapalıysa olmaz").
        grid:        (snapEnabled && snapToGridOn) ? { size: gridSize } : undefined,
        overrides:   mergedOverrides,
        paramValues,
        selectedLayerIds,
      },
    )
  }, [scene, timeMs, selectedLayerId, selectedLayerIds, assets, snapEnabled, snapToGridOn, gridSize, overrides, paramValues, dragOverrides])

  // ── Wheel zoom (Cmd/Ctrl held) ────────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (!(e.metaKey || e.ctrlKey)) return
    e.preventDefault()
    const factor = e.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP
    setZoom((z) => clamp(z * factor, MIN_ZOOM, MAX_ZOOM))
  }, [])

  // ── Selection frame geometry (uses preview layer state) ──────────────────
  const selectedLayer = scene.layers.find((l) => l.id === selectedLayerId) ?? null
  const showFrame =
    !!selectedLayer && !!selectedLayer.size && !selectedLayer.locked && !selectedLayer.hidden

  return (
    <div
      ref={containerRef}
      className={`flex-1 flex items-center justify-center bg-gray-950 overflow-hidden relative ${
        panDragRef.current ? 'cursor-grabbing' : panMode ? 'cursor-grab' : ''
      }`}
      onWheel={handleWheel}
      onPointerDown={(e) => {
        // If the click was on the <canvas>, its own handler manages pan +
        // selection. We only fire here when the user clicks the EMPTY leaf
        // area around the artboard — so pan still works outside the canvas
        // (matches Figma / SVGator behaviour).
        if (e.target === canvasRef.current) return
        if (e.button === 1 || (panMode && e.button === 0)) {
          e.preventDefault()
          beginPan(e)
        }
      }}
    >
      <div
        className="relative"
        style={{
          padding: PADDING,
          transform: `translate(${pan.x}px, ${pan.y}px)`,
          transition: panDragRef.current ? 'none' : 'transform 120ms ease-out',
        }}
      >
        <div
          className="absolute inset-6 ring-1 ring-gray-600 shadow-2xl shadow-black/80 rounded pointer-events-none"
        />

        {/* Canvas + selection overlay share the same scaled box */}
        <div
          className="relative"
          style={{
            width: `${width * zoom}px`, height: `${height * zoom}px`,
            outline: previewMode ? '2px solid #f59e0b' : undefined,
            outlineOffset: previewMode ? '-2px' : undefined,
          }}
        >
          {/* Preview-mode badge — corner indicator so user knows clicks fire
              events / drag follows cursor instead of editing. */}
          {previewMode && (
            <div className="absolute top-1 left-1 z-30 pointer-events-none
                            px-2 py-0.5 rounded bg-amber-600/90 text-white text-[10px]
                            font-bold tracking-wider uppercase shadow">
              ▶ Preview
            </div>
          )}
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={(e) => {
              // Hover preview — rAF-throttled hit test. Skip while any drag
              // is active (avoids competing for state with move/resize/rotate
              // handlers).
              if (panMode || previewMode || dragRef.current || panDragRef.current) return
              if (hoverRafRef.current) cancelAnimationFrame(hoverRafRef.current)
              const clientX = e.clientX, clientY = e.clientY
              hoverRafRef.current = requestAnimationFrame(() => {
                const cv = canvasRef.current
                if (!cv) return
                const rect = cv.getBoundingClientRect()
                const sx = width  / rect.width
                const sy = height / rect.height
                const cx = (clientX - rect.left) * sx
                const cy = (clientY - rect.top)  * sy
                const hit = hitTestLayer(scene, timeMs, cx, cy)
                setHoveredLayerId((cur) => (cur === hit ? cur : hit))
              })
            }}
            onPointerLeave={() => {
              if (hoverRafRef.current) cancelAnimationFrame(hoverRafRef.current)
              setHoveredLayerId(null)
            }}
            className={`absolute inset-0 block ${
              previewMode ? 'cursor-pointer'
              : toolMode === 'pen' ? 'cursor-crosshair'
              : panMode ? 'cursor-grab'
              : dragRef.current?.kind === 'move' ? 'cursor-grabbing'
              // Default tool: 4-arrow move cursor when over a draggable
              // layer, plain pointer over empty canvas → so the cursor
              // tells the user whether a click would grab something.
              : hoveredLayerId ? 'cursor-move'
              : 'cursor-default'
            } ${panDragRef.current ? '!cursor-grabbing' : ''}`}
            style={{
              width:  `${width  * zoom}px`,
              height: `${height * zoom}px`,
              imageRendering: 'pixelated',
              touchAction: 'none',
            }}
          />

          {/* Hover preview — red outline showing which layer a click would select.
              Only rendered when a non-selected layer is under the cursor and no
              drag is in flight. Matches the layer's rotation so the rect lines
              up with the actual rendered geometry. */}
          {(() => {
            if (!hoveredLayerId || hoveredLayerId === selectedLayerId) return null
            const hl = scene.layers.find((l) => l.id === hoveredLayerId)
            if (!hl || hl.hidden) return null
            const hw = hl.size?.width  ?? (hl.text?.fontSize ? 120 : 80)
            const hh = hl.size?.height ?? (hl.text?.fontSize ?? 24)
            return (
              <div
                key={hoveredLayerId}
                className="absolute pointer-events-none border-2 border-red-500/80 box-border
                           hover-preview-in transition-[border-color,border-width] duration-150"
                style={{
                  left: hl.transform.x * zoom,
                  top:  hl.transform.y * zoom,
                  width:  hw * zoom,
                  height: hh * zoom,
                  transform: `rotate(${hl.transform.rotationDeg}deg)`,
                  transformOrigin: `${hl.transform.anchorX * zoom}px ${hl.transform.anchorY * zoom}px`,
                }}
              />
            )
          })()}

          {showFrame && selectedLayer.size && (
            <SelectionFrame
              x={selectedLayer.transform.x * zoom}
              y={selectedLayer.transform.y * zoom}
              w={selectedLayer.size.width  * zoom}
              h={selectedLayer.size.height * zoom}
              anchorOffsetX={selectedLayer.transform.anchorX * zoom}
              anchorOffsetY={selectedLayer.transform.anchorY * zoom}
              rotationDeg={selectedLayer.transform.rotationDeg}
              onHandlePointerDown={beginResize}
              onRotatePointerDown={beginRotate}
            />
          )}

          {/* Anchor handle — visible for any unlocked selected layer */}
          {selectedLayer && !selectedLayer.locked && !selectedLayer.hidden && (
            <AnchorHandle
              x={(selectedLayer.transform.x + selectedLayer.transform.anchorX) * zoom}
              y={(selectedLayer.transform.y + selectedLayer.transform.anchorY) * zoom}
              isDragging={dragRef.current?.kind === 'anchor'}
              onPointerDown={beginAnchorDrag}
            />
          )}

          {/* Alignment guide overlay — pink lines while snapping */}
          {activeGuides.length > 0 && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ width: `${width * zoom}px`, height: `${height * zoom}px` }}
            >
              {activeGuides.map((g, i) => {
                const isCenter = g.source === 'canvas-center' || g.source === 'layer-center'
                const color = isCenter ? '#ec4899' : '#f59e0b'   // pink for centers, amber for edges
                if (g.axis === 'v') {
                  return (
                    <div
                      key={`g-${i}`}
                      style={{
                        position: 'absolute',
                        top: 0, bottom: 0,
                        left: `${g.position * zoom}px`,
                        width: '1px',
                        background: color,
                        boxShadow: `0 0 4px ${color}`,
                      }}
                    />
                  )
                }
                return (
                  <div
                    key={`g-${i}`}
                    style={{
                      position: 'absolute',
                      left: 0, right: 0,
                      top: `${g.position * zoom}px`,
                      height: '1px',
                      background: color,
                      boxShadow: `0 0 4px ${color}`,
                    }}
                  />
                )
              })}
            </div>
          )}
        </div>

        <div className="absolute bottom-1 right-1 text-[10px] text-gray-600 font-mono pointer-events-none">
          {width}×{height}
        </div>
      </div>

      {/* Rulers — top + left edges of the leaf, tick-aligned with the artboard.
          Pass the selected layer's AABB (in composition px) so the rulers
          can render the blue band + dashed alignment guides. Rotated layers
          report their unrotated bbox for now (matches "object's local
          extents" — most tools' default behaviour). */}
      {showRulers && containerRef.current && (
        <Rulers
          composition={{ width, height }}
          zoom={zoom}
          pan={pan}
          containerEl={containerRef.current}
          selectedRect={
            selectedLayer && !selectedLayer.hidden
              ? {
                  x: selectedLayer.transform.x,
                  y: selectedLayer.transform.y,
                  width:  selectedLayer.size?.width
                          ?? (selectedLayer.text?.fontSize ? 120 : 80),
                  height: selectedLayer.size?.height
                          ?? (selectedLayer.text?.fontSize ?? 24),
                }
              : undefined
          }
        />
      )}

      {/* Top-right controls: View + Snap dropdowns (SVGator-style) */}
      <div className="absolute top-3 right-3 flex items-center gap-2 select-none z-30">
        <ViewMenu
          showRulers={showRulers}     onToggleRulers={() => setShowRulers((v) => !v)}
          gridInFront={gridInFront}   onToggleGridFront={() => setGridInFront((v) => !v)}
          showGuides={showGuides}     onToggleGuides={() => setShowGuides((v) => !v)}
        />
        <SnapMenu
          enabled={snapEnabled}     onToggleEnabled={() => setSnapEnabled((v) => !v)}
          toObjects={snapToObjects} onToggleObjects={() => setSnapToObjects((v) => !v)}
          toPoints={snapToPoints}   onTogglePoints={() => setSnapToPoints((v) => !v)}
          toGuides={snapToGuides}   onToggleGuides={() => setSnapToGuides((v) => !v)}
          toGrid={snapToGridOn}     onToggleGrid={() => setSnapToGridOn((v) => !v)}
          toPixel={snapToPixel}     onTogglePixel={() => setSnapToPixel((v) => !v)}
          gridSize={gridSize}       onGridSizeChange={setGridSize}
        />
      </div>

      {/* Bottom-right controls: zoom pill */}
      <div className="absolute bottom-3 right-3 flex items-center gap-2 select-none">
        {/* Zoom + pan pill */}
        <div className="flex items-center gap-1 bg-gray-900/90 border border-gray-700
                        rounded px-2 py-1 text-xs font-mono text-gray-300">
          <button
            onClick={() => setPanMode((p) => !p)}
            title="Pan mode — drag the view instead of objects (middle-mouse always pans)"
            className={`px-1.5 py-0.5 rounded transition-colors
              ${panMode ? 'bg-blue-600 text-white hover:bg-blue-500' : 'text-gray-400 hover:bg-gray-700'}`}
          >
            ✋
          </button>
          <span className="w-px h-3 bg-gray-700 mx-0.5" />
          <button onClick={() => setZoom((z) => clamp(z / ZOOM_STEP, MIN_ZOOM, MAX_ZOOM))}
            className="px-1.5 py-0.5 rounded hover:bg-gray-700" title="Zoom out (Cmd+scroll)">−</button>
          <button onClick={actualSize}
            className="min-w-[42px] text-center px-1.5 py-0.5 rounded hover:bg-gray-700" title="Reset to 100% + recentre">
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={() => setZoom((z) => clamp(z * ZOOM_STEP, MIN_ZOOM, MAX_ZOOM))}
            className="px-1.5 py-0.5 rounded hover:bg-gray-700" title="Zoom in (Cmd+scroll)">+</button>
          <span className="w-px h-3 bg-gray-700 mx-0.5" />

          {/* Fit dropdown — opens upward */}
          <div ref={fitMenuRef} className="relative">
            <button
              onClick={() => setFitMenuOpen((o) => !o)}
              className="px-1.5 py-0.5 rounded hover:bg-gray-700 flex items-center gap-0.5"
              title="View / fit options"
            >
              Fit <span className="text-[8px]">▾</span>
            </button>
            {fitMenuOpen && (
              <FitMenu
                hasSelection={!!selectedLayer && !selectedLayer.hidden}
                fullscreen={!!fullscreen}
                onPick={(action) => { setFitMenuOpen(false); action() }}
                actions={{
                  fitAll, fitWidth, fitHeight, actualSize,
                  fitSelection, centreSelection,
                  zoom50:  () => zoomTo(0.5),
                  zoom200: () => zoomTo(2),
                  zoom400: () => zoomTo(4),
                  toggleFullscreen: onToggleFullscreen,
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Hint banner — context-aware to which mode is active */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 text-[10px] font-mono text-gray-500 pointer-events-none
                      bg-gray-900/70 px-2 py-0.5 rounded whitespace-nowrap">
        {panMode
          ? '✋ Pan mode · drag ANYWHERE on the leaf to pan (click ✋ again to turn off)'
          : 'Drag = move · Shift = axis-lock · Handles to resize · ⌘ = aspect-lock · ⌘+scroll = zoom · Mid-mouse = pan'}
      </div>
    </div>
  )
}

// ── Selection frame with 8 resize handles ────────────────────────────────────

interface FrameProps {
  x: number; y: number; w: number; h: number
  /** Anchor position in screen px RELATIVE to the frame's top-left.
   *  Used as the CSS transform-origin so the frame rotates around the
   *  same pivot as the rendered layer. */
  anchorOffsetX: number
  anchorOffsetY: number
  rotationDeg: number
  onHandlePointerDown: (h: Handle) => (e: React.PointerEvent) => void
  onRotatePointerDown?: (e: React.PointerEvent) => void
}

// ── Fit / View menu (opens upward from the zoom pill) ───────────────────────

interface FitMenuActions {
  fitAll:          () => void
  fitWidth:        () => void
  fitHeight:       () => void
  actualSize:      () => void
  fitSelection:    () => void
  centreSelection: () => void
  zoom50:          () => void
  zoom200:         () => void
  zoom400:         () => void
  toggleFullscreen?: () => void
}

interface FitMenuProps {
  hasSelection: boolean
  fullscreen:   boolean
  actions: FitMenuActions
  onPick: (action: () => void) => void
}

function FitMenu({ hasSelection, fullscreen, actions, onPick }: FitMenuProps) {
  type Item =
    | { kind: 'item'; label: string; kbd?: string; action: () => void; disabled?: boolean }
    | { kind: 'separator' }
    | { kind: 'heading'; label: string }

  const items: Item[] = [
    { kind: 'heading', label: 'Fit composition' },
    { kind: 'item', label: 'Fit to view',     kbd: 'F',  action: actions.fitAll },
    { kind: 'item', label: 'Fit width',                  action: actions.fitWidth },
    { kind: 'item', label: 'Fit height',                 action: actions.fitHeight },
    { kind: 'separator' },
    { kind: 'heading', label: 'Selection' },
    { kind: 'item', label: 'Fit selection',  kbd: '⇧2', action: actions.fitSelection,    disabled: !hasSelection },
    { kind: 'item', label: 'Centre selection',          action: actions.centreSelection, disabled: !hasSelection },
    { kind: 'separator' },
    { kind: 'heading', label: 'Zoom presets' },
    { kind: 'item', label: 'Actual size (100%)', kbd: '0', action: actions.actualSize },
    { kind: 'item', label: '50%',                          action: actions.zoom50 },
    { kind: 'item', label: '200%',                         action: actions.zoom200 },
    { kind: 'item', label: '400%',                         action: actions.zoom400 },
    ...(actions.toggleFullscreen ? [
      { kind: 'separator' as const },
      { kind: 'item' as const,
        label: fullscreen ? '⛶ Exit fullscreen' : '⛶ Fullscreen canvas',
        kbd: 'Esc / F11',
        action: actions.toggleFullscreen },
    ] : []),
  ]

  return (
    <div className="absolute bottom-full right-0 mb-1 min-w-[200px]
                    bg-gray-900 border border-gray-700 rounded shadow-xl
                    py-1 z-50 select-none">
      {items.map((it, i) => {
        if (it.kind === 'separator') return <div key={i} className="h-px bg-gray-800 my-1" />
        if (it.kind === 'heading') return (
          <div key={i} className="px-3 pt-1.5 pb-0.5 text-[9px] uppercase tracking-wider text-gray-500 font-semibold">
            {it.label}
          </div>
        )
        return (
          <button
            key={i}
            disabled={it.disabled}
            onClick={() => !it.disabled && onPick(it.action)}
            className={`w-full flex items-center justify-between gap-6 px-3 py-1.5 text-xs
              ${it.disabled
                ? 'text-gray-600 cursor-not-allowed'
                : 'text-gray-200 hover:bg-gray-800 cursor-pointer'}`}
          >
            <span>{it.label}</span>
            {it.kbd && <span className="text-[10px] text-gray-500 font-mono">{it.kbd}</span>}
          </button>
        )
      })}
    </div>
  )
}

// ── Snap menu (top-right dropdown — SVGator-style) ───────────────────────────

interface SnapMenuProps {
  enabled: boolean;     onToggleEnabled: () => void
  toObjects: boolean;   onToggleObjects: () => void
  toPoints:  boolean;   onTogglePoints:  () => void
  toGuides:  boolean;   onToggleGuides:  () => void
  toGrid:    boolean;   onToggleGrid:    () => void
  toPixel:   boolean;   onTogglePixel:   () => void
  gridSize:  number;    onGridSizeChange: (n: number) => void
}

function SnapMenu(p: SnapMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const items: Array<{ label: string; value: boolean; onToggle: () => void; disabled?: boolean }> = [
    { label: 'Snap to Objects', value: p.toObjects, onToggle: p.onToggleObjects, disabled: !p.enabled },
    { label: 'Snap to Points',  value: p.toPoints,  onToggle: p.onTogglePoints,  disabled: !p.enabled },
    { label: 'Snap to Guides',  value: p.toGuides,  onToggle: p.onToggleGuides,  disabled: !p.enabled },
    { label: 'Snap to Grid',    value: p.toGrid,    onToggle: p.onToggleGrid,    disabled: !p.enabled },
    { label: 'Snap to Pixel',   value: p.toPixel,   onToggle: p.onTogglePixel,   disabled: !p.enabled },
  ]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Snap settings"
        className={`px-2 py-1 text-xs font-mono rounded border flex items-center gap-1
          ${p.enabled
            ? 'bg-blue-600/90 border-blue-500 text-white hover:bg-blue-500'
            : 'bg-gray-900/90 border-gray-700 text-gray-400 hover:bg-gray-800'}`}
      >
        🧲 Snap <span className="text-[8px]">▾</span>
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 min-w-[220px] bg-gray-900 border border-gray-700
                        rounded shadow-xl py-1 z-50 dock-overlay-in">
          {items.map((it) => (
            <button
              key={it.label}
              disabled={it.disabled}
              onClick={() => !it.disabled && it.onToggle()}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs
                ${it.disabled
                  ? 'text-gray-600 cursor-not-allowed'
                  : 'text-gray-200 hover:bg-gray-800 cursor-pointer'}`}
            >
              <span className="w-3 inline-block">{it.value ? '✓' : ''}</span>
              <span className="flex-1 text-left">{it.label}</span>
            </button>
          ))}
          {/* Inline grid-size slider when Snap to Grid is on */}
          {p.toGrid && p.enabled && (
            <div className="px-3 py-1.5 flex items-center gap-2 border-t border-gray-800 mt-1 pt-2">
              <span className="text-[10px] text-gray-400">Grid</span>
              <input
                type="range" min={2} max={100} step={1}
                value={p.gridSize}
                onChange={(e) => p.onGridSizeChange(Number(e.target.value))}
                className="flex-1 accent-blue-500"
              />
              <span className="text-[10px] font-mono text-gray-300 w-10 text-right">{p.gridSize}px</span>
            </div>
          )}
          <div className="h-px bg-gray-800 my-1" />
          <button
            onClick={p.onToggleEnabled}
            className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs
                       text-gray-200 hover:bg-gray-800 cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <span className="w-3 inline-block">{p.enabled ? '✓' : ''}</span>
              Enable Snapping
            </span>
            <span className="text-[10px] font-mono text-gray-500">Alt + S</span>
          </button>
        </div>
      )}
    </div>
  )
}

// ── View menu (rulers / grid front-back / guides) ───────────────────────────

interface ViewMenuProps {
  showRulers:    boolean; onToggleRulers:    () => void
  gridInFront:   boolean; onToggleGridFront: () => void
  showGuides:    boolean; onToggleGuides:    () => void
}

function ViewMenu(p: ViewMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const rows: Array<{ label: string; value: boolean; onToggle: () => void; kbd?: string }> = [
    { label: 'Show ruler',           value: p.showRulers,  onToggle: p.onToggleRulers,    kbd: 'Alt + R' },
    { label: 'Show guides',          value: p.showGuides,  onToggle: p.onToggleGuides,    kbd: 'Alt + L' },
    { label: 'Grid on top of layers',value: p.gridInFront, onToggle: p.onToggleGridFront },
  ]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="View options"
        className="px-2 py-1 text-xs font-mono rounded border bg-gray-900/90 border-gray-700
                   text-gray-300 hover:bg-gray-800 flex items-center gap-1"
      >
        ⊞ View <span className="text-[8px]">▾</span>
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 min-w-[220px] bg-gray-900 border border-gray-700
                        rounded shadow-xl py-1 z-50 dock-overlay-in">
          {rows.map((r) => (
            <button
              key={r.label}
              onClick={r.onToggle}
              className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs
                         text-gray-200 hover:bg-gray-800 cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <span className="w-3 inline-block">{r.value ? '✓' : ''}</span>
                {r.label}
              </span>
              {r.kbd && <span className="text-[10px] font-mono text-gray-500">{r.kbd}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Rulers (px scales on top + left edges of the canvas leaf) ────────────────

interface RulersProps {
  composition: { width: number; height: number }
  zoom: number
  pan: { x: number; y: number }
  containerEl: HTMLDivElement
  /** Selected layer's axis-aligned bounding rect in composition px. When
   *  provided the rulers highlight the rect's extents with a coloured
   *  band + dashed guide line tying the band to the artboard (Figma /
   *  Photoshop pattern). */
  selectedRect?: { x: number; y: number; width: number; height: number }
}

const RULER_THICK = 18  // px — strip height/width

/**
 * Picks a "nice" tick interval (composition px) so that major ticks fall
 * roughly every 80 screen px regardless of zoom.
 */
function pickRulerStep(zoom: number): number {
  const TARGET_PX = 80
  const compPx = TARGET_PX / Math.max(0.001, zoom)
  const niceSteps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]
  for (const s of niceSteps) if (s >= compPx) return s
  return niceSteps[niceSteps.length - 1]
}

function Rulers({ composition, zoom, pan, containerEl, selectedRect }: RulersProps) {
  // Re-render when the container resizes so ruler ticks stay aligned with
  // the leaf's current bounds.
  const [, setTick] = useState(0)
  useEffect(() => {
    const ro = new ResizeObserver(() => setTick((t) => t + 1))
    ro.observe(containerEl)
    return () => ro.disconnect()
  }, [containerEl])

  const rect = containerEl.getBoundingClientRect()
  const cw = rect.width, ch = rect.height
  // Canvas top-left in container-relative coords:
  // flex centres the (canvas + 2×PADDING) wrapper, plus the pan translate.
  const originX = cw / 2 - (composition.width  * zoom) / 2 + pan.x
  const originY = ch / 2 - (composition.height * zoom) / 2 + pan.y

  const step = pickRulerStep(zoom)
  // X ticks (composition x = 0, step, 2·step, …, width)
  const xTicks: number[] = []
  for (let x = 0; x <= composition.width;  x += step) xTicks.push(x)
  const yTicks: number[] = []
  for (let y = 0; y <= composition.height; y += step) yTicks.push(y)

  // Common style for tick labels
  const label = 'absolute text-[9px] font-mono text-gray-500 pointer-events-none select-none'
  const tickStroke = 'rgba(160,160,160,0.55)'

  // Selected-layer extents in screen-px (clamped to the ruler track)
  const sel = selectedRect
  const selSX1 = sel ? originX + sel.x * zoom                : 0
  const selSX2 = sel ? originX + (sel.x + sel.width) * zoom  : 0
  const selSY1 = sel ? originY + sel.y * zoom                : 0
  const selSY2 = sel ? originY + (sel.y + sel.height) * zoom : 0

  return (
    <>
      {/* TOP RULER — horizontal strip pinned to the leaf's top edge */}
      <div
        className="absolute top-0 left-0 right-0 bg-gray-900/95 border-b border-gray-700 pointer-events-none z-20"
        style={{ height: RULER_THICK }}
      >
        {/* Corner spacer (overlaps the left ruler's gutter) */}
        <div className="absolute top-0 left-0 bg-gray-900/95 border-r border-gray-700"
             style={{ width: RULER_THICK, height: RULER_THICK }} />

        {/* Selected-layer X extent — blue band on the ruler track */}
        {sel && (() => {
          const left  = Math.max(RULER_THICK, selSX1)
          const right = Math.min(cw, selSX2)
          if (right <= left) return null
          return (
            <>
              <div
                className="absolute bottom-0 bg-blue-500/40 border-t border-blue-400"
                style={{ left, width: right - left, height: 6 }}
              />
              {/* Position labels at the band edges (only when inside view) */}
              {selSX1 >= RULER_THICK && (
                <span className="absolute top-0.5 text-[9px] font-mono text-blue-300 px-0.5 bg-gray-900/90 rounded pointer-events-none"
                      style={{ left: selSX1 + 2 }}>
                  {Math.round(sel.x)}
                </span>
              )}
              {selSX2 <= cw && (
                <span className="absolute top-0.5 text-[9px] font-mono text-blue-300 px-0.5 bg-gray-900/90 rounded pointer-events-none"
                      style={{ left: selSX2 - 26 }}>
                  {Math.round(sel.x + sel.width)}
                </span>
              )}
            </>
          )
        })()}

        {xTicks.map((cx) => {
          const sx = originX + cx * zoom
          if (sx < RULER_THICK || sx > cw) return null
          return (
            <div key={cx} className="absolute top-0 h-full" style={{ left: sx }}>
              <div style={{ position: 'absolute', bottom: 0, width: 1, height: 6, background: tickStroke }} />
              <span className={label} style={{ top: 2, left: 3 }}>{cx}</span>
            </div>
          )
        })}
      </div>

      {/* LEFT RULER — vertical strip pinned to the leaf's left edge */}
      <div
        className="absolute top-0 left-0 bottom-0 bg-gray-900/95 border-r border-gray-700 pointer-events-none z-20"
        style={{ width: RULER_THICK }}
      >
        {/* Selected-layer Y extent — blue band on the ruler track */}
        {sel && (() => {
          const top    = Math.max(RULER_THICK, selSY1)
          const bottom = Math.min(ch, selSY2)
          if (bottom <= top) return null
          return (
            <>
              <div
                className="absolute right-0 bg-blue-500/40 border-l border-blue-400"
                style={{ top, height: bottom - top, width: 6 }}
              />
              {selSY1 >= RULER_THICK && (
                <span className="absolute left-0.5 text-[9px] font-mono text-blue-300 px-0.5 bg-gray-900/90 rounded pointer-events-none"
                      style={{ top: selSY1 + 1 }}>
                  {Math.round(sel.y)}
                </span>
              )}
              {selSY2 <= ch && (
                <span className="absolute left-0.5 text-[9px] font-mono text-blue-300 px-0.5 bg-gray-900/90 rounded pointer-events-none"
                      style={{ top: selSY2 - 12 }}>
                  {Math.round(sel.y + sel.height)}
                </span>
              )}
            </>
          )
        })()}

        {yTicks.map((cy) => {
          const sy = originY + cy * zoom
          if (sy < RULER_THICK || sy > ch) return null
          return (
            <div key={cy} className="absolute left-0 w-full" style={{ top: sy }}>
              <div style={{ position: 'absolute', right: 0, height: 1, width: 6, background: tickStroke }} />
              <span className={label}
                style={{
                  top: 0, left: 2,
                  transform: 'rotate(-90deg) translate(-100%, 100%)',
                  transformOrigin: '0 0',
                  whiteSpace: 'nowrap',
                }}>{cy}</span>
            </div>
          )
        })}
      </div>

      {/* Dashed guide lines tying the selected layer's edges to the rulers.
          Span from the ruler edge across the leaf so the user can eyeball
          alignment with anything in the work area, not just the artboard. */}
      {sel && (
        <div className="absolute inset-0 pointer-events-none z-10">
          {[selSX1, selSX2].map((x, i) =>
            x >= RULER_THICK && x <= cw ? (
              <div
                key={`v${i}`}
                className="absolute top-0 bottom-0 border-l border-dashed border-blue-400/40"
                style={{ left: x }}
              />
            ) : null
          )}
          {[selSY1, selSY2].map((y, i) =>
            y >= RULER_THICK && y <= ch ? (
              <div
                key={`h${i}`}
                className="absolute left-0 right-0 border-t border-dashed border-blue-400/40"
                style={{ top: y }}
              />
            ) : null
          )}
        </div>
      )}
    </>
  )
}

// ── Anchor point handle (pivot for rotation / scale) ─────────────────────────

interface AnchorProps {
  x: number; y: number
  isDragging?: boolean
  onPointerDown: (e: React.PointerEvent) => void
}

/**
 * Crosshair-in-a-ring handle marking the layer's anchor point. Draggable —
 * moves transform.anchorX/Y. Sits above the selection frame so it's always
 * reachable, but uses pointer-events:auto only on the inner hit area so it
 * doesn't block other interactions.
 */
function AnchorHandle({ x, y, isDragging, onPointerDown }: AnchorProps) {
  return (
    <div
      onPointerDown={onPointerDown}
      title="Anchor point (rotation / scale pivot) — drag to reposition"
      className="absolute z-50 pointer-events-auto cursor-move select-none"
      style={{ left: `${x}px`, top: `${y}px`, transform: 'translate(-50%, -50%)' }}
    >
      <div className={`relative w-4 h-4 rounded-full border-2 transition-transform
        ${isDragging
          ? 'border-orange-400 bg-orange-400/40 scale-125'
          : 'border-orange-500 bg-white/30 hover:scale-110'}`}>
        {/* crosshair */}
        <span className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-orange-500" />
        <span className="absolute top-1/2 left-0 right-0 h-px -translate-y-1/2 bg-orange-500" />
      </div>
    </div>
  )
}

function SelectionFrame({
  x, y, w, h, anchorOffsetX, anchorOffsetY, rotationDeg,
  onHandlePointerDown, onRotatePointerDown,
}: FrameProps) {
  // 8 resize handles on the frame perimeter (corners + edge midpoints)
  const handles: Array<{ key: Handle; cx: number; cy: number }> = [
    { key: 'nw', cx: 0,     cy: 0     },
    { key: 'n',  cx: w / 2, cy: 0     },
    { key: 'ne', cx: w,     cy: 0     },
    { key: 'w',  cx: 0,     cy: h / 2 },
    { key: 'e',  cx: w,     cy: h / 2 },
    { key: 'sw', cx: 0,     cy: h     },
    { key: 's',  cx: w / 2, cy: h     },
    { key: 'se', cx: w,     cy: h     },
  ]
  // Rotation handles: 4 smaller dots 10px diagonally OUTSIDE each corner.
  const ROT_OFFSET = 10
  const rotHandles: Array<{ key: string; cx: number; cy: number }> = [
    { key: 'rot-nw', cx: -ROT_OFFSET,     cy: -ROT_OFFSET     },
    { key: 'rot-ne', cx: w + ROT_OFFSET,  cy: -ROT_OFFSET     },
    { key: 'rot-sw', cx: -ROT_OFFSET,     cy: h + ROT_OFFSET  },
    { key: 'rot-se', cx: w + ROT_OFFSET,  cy: h + ROT_OFFSET  },
  ]

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: x, top: y, width: w, height: h,
        transform: `rotate(${rotationDeg}deg)`,
        transformOrigin: `${anchorOffsetX}px ${anchorOffsetY}px`,
      }}
    >
      {/* Frame border */}
      <div className="absolute inset-0 border border-blue-400/90 box-border" />

      {/* Rotation handles — small white circles, drawn diagonally outside corners */}
      {onRotatePointerDown && rotHandles.map((r) => (
        <div
          key={r.key}
          onPointerDown={onRotatePointerDown}
          title="Drag to rotate (Shift = snap 15°)"
          className="absolute w-2 h-2 -translate-x-1/2 -translate-y-1/2
                     bg-white border border-blue-400 rounded-full shadow-sm pointer-events-auto
                     hover:scale-125 hover:border-blue-300 transition-transform"
          style={{ left: `${r.cx}px`, top: `${r.cy}px`, cursor: 'alias' }}
        />
      ))}

      {/* Resize handles — circles (Figma / SVGator style), drawn on top so
          a click on the corner resizes, not rotates. */}
      {handles.map((h) => (
        <div
          key={h.key}
          onPointerDown={onHandlePointerDown(h.key)}
          className="absolute w-3 h-3 -translate-x-1/2 -translate-y-1/2
                     bg-white border border-blue-500 rounded-full shadow pointer-events-auto"
          style={{ left: `${h.cx}px`, top: `${h.cy}px`, cursor: HANDLE_CURSORS[h.key] }}
        />
      ))}
    </div>
  )
}
