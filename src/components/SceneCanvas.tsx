'use client'
import {
  useRef, useEffect, useCallback, useState, useLayoutEffect, useMemo,
} from 'react'
import type { ChronoScene, Layer } from '@/lib/types'
import { renderScene, hitTestLayer, hitTestLayersAt, type AssetElementMap } from '@/lib/renderer'
import { updateLayerProperty } from '@/lib/editor/autoKeyframe'
import { makeUpdateLayerCmd } from '@/lib/editor/commands-layer'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'

interface Props {
  scene: ChronoScene
  editor: EditorStateReturn
  timeMs: number
  selectedLayerId: string | null
  assets: AssetElementMap
  onSelectLayer: (id: string | null) => void
}

const PADDING   = 24
const MIN_ZOOM  = 0.1
const MAX_ZOOM  = 8
const ZOOM_STEP = 1.25
const MIN_SIZE  = 4    // smallest allowed layer dimension (px in composition space)

type Handle = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se'

interface MoveState {
  kind: 'move'
  layerId: string
  originalLayer: Layer
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

type ActiveDrag = MoveState | ResizeState | AnchorState

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
  scene, editor, timeMs, selectedLayerId, assets, onSelectLayer,
}: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const { width, height } = scene.composition

  // ── Zoom ──────────────────────────────────────────────────────────────────
  const [zoom, setZoom]       = useState(1)
  const [maxSide, setMaxSide] = useState({ w: 0, h: 0 })

  // ── Snap-to-grid (visual + math while ANCHOR drags) ──────────────────────
  const [snapEnabled, setSnapEnabled] = useState(false)
  const [gridSize, setGridSize]       = useState(20)
  const snapRef = useRef({ enabled: false, size: 20 })
  useEffect(() => { snapRef.current = { enabled: snapEnabled, size: gridSize } }, [snapEnabled, gridSize])

  // ── Pan mode (move the whole view instead of objects) ───────────────────
  const [panMode, setPanMode] = useState(false)
  const [pan, setPan]         = useState({ x: 0, y: 0 })
  const panDragRef = useRef<{
    startClientX: number; startClientY: number; startPan: { x: number; y: number }
  } | null>(null)

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

    const snap = snapRef.current

    if (drag.kind === 'move') {
      const ox = drag.originalLayer.transform.x
      const oy = drag.originalLayer.transform.y
      let nx = ox + dx
      let ny = oy + dy
      // Snap to canvas grid when active — both anchor AND object move snap.
      if (snap.enabled) {
        nx = snapToGrid(nx, snap.size)
        ny = snapToGrid(ny, snap.size)
      }
      nx = clamp(nx, 0, Math.max(0, cw - drag.width))
      ny = clamp(ny, 0, Math.max(0, ch - drag.height))
      let next = updateLayerProperty(sceneRef.current, drag.layerId, 'transform.x', nx)
      next = updateLayerProperty(next, drag.layerId, 'transform.y', ny)
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
      if (snap.enabled) {
        // Snap the WORLD position of the anchor to the grid, then translate
        // back to local coords. That way the visible anchor handle lands
        // exactly on a grid line.
        const wx = drag.originalLayer.transform.x + nAX
        const wy = drag.originalLayer.transform.y + nAY
        nAX = snapToGrid(wx, snap.size) - drag.originalLayer.transform.x
        nAY = snapToGrid(wy, snap.size) - drag.originalLayer.transform.y
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

    // Minimum size + composition-bounds clamp (resize never snaps to grid —
    // only anchor does, so users get pixel-precise resize regardless).
    nw = Math.max(MIN_SIZE, nw)
    nh = Math.max(MIN_SIZE, nh)
    nx = clamp(nx, 0, Math.max(0, cw - nw))
    ny = clamp(ny, 0, Math.max(0, ch - nh))
    nw = Math.min(nw, cw - nx)
    nh = Math.min(nh, ch - ny)

    const nextScene: ChronoScene = {
      ...sceneRef.current,
      layers: sceneRef.current.layers.map((l) => l.id !== drag.layerId ? l : {
        ...l,
        transform: { ...l.transform, x: nx, y: ny },
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

    const ed = editorRef.current
    const finalLayer = ed.scene.layers.find((l) => l.id === drag.layerId)
    if (!finalLayer) { ed.cancelTransaction(); return }

    // Only commit if something actually changed
    const orig = drag.originalLayer
    const tChanged =
      finalLayer.transform.x !== orig.transform.x ||
      finalLayer.transform.y !== orig.transform.y
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

    // Alt/Option-click cycles through stacked layers under the cursor — useful
    // when a top layer (e.g. a full-canvas background) is blocking selection
    // of layers underneath. Plain click takes the topmost hit.
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
    }
    onSelectLayer(hit)
    if (!hit) return
    const layer = scene.layers.find((l) => l.id === hit)
    if (!layer || layer.locked) return

    editor.beginTransaction()
    dragRef.current = {
      kind: 'move',
      layerId: layer.id,
      originalLayer: layer,
      startClientX: e.clientX,
      startClientY: e.clientY,
      width:  layer.size?.width  ?? (layer.text?.fontSize ? 120 : 80),
      height: layer.size?.height ?? (layer.text?.fontSize ?? 24),
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup',   handlePointerUp)
  }, [scene, timeMs, width, height, onSelectLayer, editor, handlePointerMove, handlePointerUp, panMode, beginPan, selectedLayerId])

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

  // ── Render canvas ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    renderScene(
      ctx, scene, timeMs, selectedLayerId, assets,
      snapEnabled ? { size: gridSize } : undefined,
    )
  }, [scene, timeMs, selectedLayerId, assets, snapEnabled, gridSize])

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
      className="flex-1 flex items-center justify-center bg-gray-950 overflow-hidden relative"
      onWheel={handleWheel}
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
          style={{ width: `${width * zoom}px`, height: `${height * zoom}px` }}
        >
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            onPointerDown={handleCanvasPointerDown}
            className={`absolute inset-0 block ${
              panMode ? 'cursor-grab'
              : dragRef.current?.kind === 'move' ? 'cursor-grabbing'
              : 'cursor-grab'
            } ${panDragRef.current ? '!cursor-grabbing' : ''}`}
            style={{
              width:  `${width  * zoom}px`,
              height: `${height * zoom}px`,
              imageRendering: 'pixelated',
              touchAction: 'none',
            }}
          />

          {showFrame && selectedLayer.size && (
            <SelectionFrame
              x={selectedLayer.transform.x * zoom}
              y={selectedLayer.transform.y * zoom}
              w={selectedLayer.size.width  * zoom}
              h={selectedLayer.size.height * zoom}
              onHandlePointerDown={beginResize}
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
        </div>

        <div className="absolute bottom-1 right-1 text-[10px] text-gray-600 font-mono pointer-events-none">
          {width}×{height}
        </div>
      </div>

      {/* Bottom-right controls: zoom pill + snap pill */}
      <div className="absolute bottom-3 right-3 flex items-center gap-2 select-none">
        {/* Snap pill — toggle + grid-size slider */}
        <div className="flex items-center gap-2 bg-gray-900/90 border border-gray-700
                        rounded px-2 py-1 text-xs font-mono text-gray-300">
          <button
            onClick={() => setSnapEnabled((s) => !s)}
            title="Snap to grid (move / resize / anchor)"
            className={`px-1.5 py-0.5 rounded transition-colors
              ${snapEnabled ? 'bg-blue-600 text-white hover:bg-blue-500' : 'text-gray-400 hover:bg-gray-700'}`}
          >
            ⊞
          </button>
          <input
            type="range" min={2} max={100} step={1}
            value={gridSize}
            onChange={(e) => setGridSize(Number(e.target.value))}
            disabled={!snapEnabled}
            title={`Grid size · ${gridSize}px`}
            className="w-20 accent-blue-500 disabled:opacity-40"
          />
          <span className={`w-10 text-right ${snapEnabled ? 'text-gray-200' : 'text-gray-500'}`}>
            {gridSize}px
          </span>
        </div>

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
                onPick={(action) => { setFitMenuOpen(false); action() }}
                actions={{
                  fitAll, fitWidth, fitHeight, actualSize,
                  fitSelection, centreSelection,
                  zoom50:  () => zoomTo(0.5),
                  zoom200: () => zoomTo(2),
                  zoom400: () => zoomTo(4),
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
          ? '✋ Pan mode · drag anywhere to pan the view (click ✋ again to turn off)'
          : 'Drag to move · Handles to resize · Hold ⌘ for aspect-lock · Cmd+scroll zooms · Mid-mouse pans'}
      </div>
    </div>
  )
}

// ── Selection frame with 8 resize handles ────────────────────────────────────

interface FrameProps {
  x: number; y: number; w: number; h: number
  onHandlePointerDown: (h: Handle) => (e: React.PointerEvent) => void
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
}

interface FitMenuProps {
  hasSelection: boolean
  actions: FitMenuActions
  onPick: (action: () => void) => void
}

function FitMenu({ hasSelection, actions, onPick }: FitMenuProps) {
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

function SelectionFrame({ x, y, w, h, onHandlePointerDown }: FrameProps) {
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
  return (
    <div className="absolute pointer-events-none" style={{ left: x, top: y, width: w, height: h }}>
      {/* Frame border */}
      <div className="absolute inset-0 border border-blue-400/90 box-border" />

      {/* Handles */}
      {handles.map((h) => (
        <div
          key={h.key}
          onPointerDown={onHandlePointerDown(h.key)}
          className="absolute w-2.5 h-2.5 -translate-x-1/2 -translate-y-1/2
                     bg-white border border-blue-500 rounded-sm shadow pointer-events-auto"
          style={{ left: `${h.cx}px`, top: `${h.cy}px`, cursor: HANDLE_CURSORS[h.key] }}
        />
      ))}
    </div>
  )
}
