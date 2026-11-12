// ── CanvasRenderer ────────────────────────────────────────────────────────────
//
// Registry-driven scene renderer. Successor to the monolithic renderScene()
// in renderer.ts — each layer kind is dispatched via LayerRendererRegistry
// instead of a hard-coded switch.
//
// Architecture:
//   - CanvasRenderer owns the per-frame orchestration (clear, background,
//     solo-layer filter, ordering, selection outline)
//   - Per-layer setup (transform, opacity, blend mode, motion path) is shared
//     here — plugins draw in LAYER-LOCAL coordinates after setup
//   - Plugins (LayerRendererPlugin) own only the per-kind draw logic
//
// This is the file every new layer kind will eventually hit. Adding kinds
// no longer requires editing this dispatcher.

import type { ChronoScene, Layer } from '@/lib/types'
import { buildEffectsFilter } from '@/lib/types'
import { getLayerValue, type OverrideMap } from '@/lib/evaluator'
import type { AssetElementMap } from '@/lib/renderer'
import { layerRegistry, rendererRegistry } from '@/lib/registry'
import type { RenderContext, ParamValueMap, RenderMode } from './RenderContext'
import { LayerSurfacePipeline } from './resources/LayerSurfacePipeline'
import { planLayerSurfaceRegion } from './resources/planLayerSurfaceRegion'
import { effectRegistry } from '@/lib/effects'
import { renderSurfacePool, type CanvasSurfaceProvider } from './resources/CanvasSurfacePool'
import { resolveDisplayTransform } from './resolveDisplayTransform'
import { renderMotionBlurTrails } from './renderMotionBlurTrails'
import { renderMotionBlurAccumulated } from './renderMotionBlurAccumulated'
import { drawCompositionBackground } from './drawCompositionBackground'
import { GroupLodFrame, type GroupLodOptions } from './lod/GroupLodFrame'
import { StaticGroupLodCache, staticGroupLodCache } from './lod/StaticGroupLodCache'
import { resolveLayerWorldBounds, createLayerWorldBoundsResolver, type LayerWorldBoundsResolver } from '@/lib/geometry/resolveLayerWorldBounds'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { prepareRenderFrame } from './prepareRenderFrame'
import { projectFrameFonts, projectFrameFontOverrides } from './media/projectFrameFonts'
import { LayerDrawVisibility, layerDrawActive } from './visibility/LayerDrawVisibility'
import { canvasMemoryTracker } from '@/lib/resources/memory/CanvasMemoryTracker'
import { LayerIndex, type LayerLookup, type LayerRelations } from '@/lib/scene/LayerIndex'

import { PaintFrame, directPaint, type PaintStatistics } from './visibility/PaintFrame'
import type { PathBounds } from '@/lib/geometry/computePathBounds'


export interface CanvasRenderOptions {
  /** Explicit viewport LOD only; exports and renderSingleLayer leave this absent. */
  lod?: GroupLodOptions
  /** Resource prefetch only, in backing pixels/composition ms; never changes paint clipping. */
  mediaPadding?: number
  mediaPrefetchMs?: number
  /** Visible backing-pixel rectangle (CSS viewport clipping). Omit for full output. */
  visibleArea?: PathBounds
  /** Internal reference-render switch; never persisted or exposed as project data. */
  optimizePaint?: boolean
  /** Optional pre-computed override map (for runtime preview). */
  overrides?:   OverrideMap
  /** Parameter values for text / colour resolution. */
  paramValues?: ParamValueMap
  /** Optional canvas grid overlay (pixels). */
  grid?:        { size: number }
  /** Multi-selection set — when present, EVERY id gets a selection outline. */
  selectedLayerIds?: Set<string>
  /** False when the editor's DOM overlay owns the selection frame. Plugins
   * still receive isSelected; only the duplicate canvas outline is disabled. */
  selectionOutline?: boolean
  /**
   * BL-66 — 'editor' (default) draws selection outlines + grid; 'preview'
   * draws content only (used during playback and the export pipeline so
   * frames are free of editor chrome).
   */
  renderMode?: RenderMode
  /**
   * BL-80 — background fill control for the raster export pipeline.
   *   'scene'       → composition.backgroundColor (default, on-screen look)
   *   'transparent' → skip the fill so exported PNG/WEBP keeps alpha
   *   { color }     → explicit solid colour override
   */
  background?: 'scene' | 'transparent' | { color: string }
}

/**
 * Mutable synchronous scene-draw orchestrator. Resource owners and converters
 * are injected/delegated; no font face or source pin is owned by this instance.
 * A frame borrows media/font bindings only for the duration of drawing. The
 * existing large traversal is migrated incrementally: font projection lives in
 * render/media, preserving public draw contracts without an unrelated rewrite.
 * Further extraction belongs at frame preparation vs traversal boundaries.
 */
export class CanvasRenderer {
  /** Tracks layers currently being rendered as motion blur trails — prevents
   *  recursive trail rendering when renderSingleLayer calls renderLayer. */
  private readonly _mbRenderingSet = new Set<string>()
  private _renderedLayerCount = 0
  private paintStatistics: PaintStatistics | null = null
  private readonly surfacePipeline: LayerSurfacePipeline

  /** Shares one bounded scratch provider across host, native effects and masks;
   * stores no frame. Region opt-out is a reference/debug path for pixel QA. */
  constructor(surfaces: CanvasSurfaceProvider = renderSurfacePool,
    private readonly lodCache: StaticGroupLodCache = staticGroupLodCache,
    private readonly optimizeSurfaceRegions = true) {
    this.surfacePipeline = new LayerSurfacePipeline(surfaces)
  }

  /**
   * Diagnostic visit count for the last render/renderSingleLayer invocation,
   * including group/repeater/mask/temporal child visits and budget-rejected
   * attempts. It is not visible objects, Canvas commands or GPU draw calls.
   */
  getLastLayerVisitCount(): number { return this._renderedLayerCount }

  /** Detached main-frame counters; renderSingleLayer/ghost passes do not overwrite them. */
  getLastPaintStatistics(): PaintStatistics | null { return this.paintStatistics ? { ...this.paintStatistics } : null }

  render(
    ctx:             CanvasRenderingContext2D,
    scene:           ChronoScene,
    timeMs:          number,
    selectedLayerId: string | null,
    assets:          AssetElementMap,
    options:         CanvasRenderOptions = {},
  ): void {
    this.paintStatistics = null
    canvasMemoryTracker.track(ctx.canvas)
    this._renderedLayerCount = 0
    const prepared = prepareRenderFrame(scene, timeMs, options.overrides, options.paramValues)
    const { sourceScene } = prepared
    const overrides = projectFrameFontOverrides(prepared.scene, prepared.overrides, assets.fonts)
    scene = projectFrameFonts(prepared.scene,assets.fonts)
    const layerIndex=scene===prepared.scene?prepared.index:new LayerIndex(scene.layers)
    const { composition, layers } = scene
    const paramValues = options.paramValues ?? new Map()
    // BL-66 — In 'preview' mode (playback + export) we skip all editor chrome
    // (selection outlines, grid) so the rendered frame is pure content.
    const renderMode   = options.renderMode ?? 'editor'
    const editorChrome = renderMode === 'editor'
    const boundsForFrame = editorChrome && options.selectionOutline !== false
      && (selectedLayerId || options.selectedLayerIds?.size)
      ? createLayerWorldBoundsResolver(scene, timeMs, overrides) : undefined

    // Unknown caller state can expand paint or modify destination outside bounds.
    const safeCaller = (!ctx.filter || ctx.filter === 'none')
      && (!ctx.globalCompositeOperation || ctx.globalCompositeOperation === 'source-over')
      && (!ctx.shadowColor || ['transparent', 'rgba(0, 0, 0, 0)', '#00000000'].includes(ctx.shadowColor))
    const area = options.visibleArea ?? { x: 0, y: 0, width: ctx.canvas?.width ?? composition.width, height: ctx.canvas?.height ?? composition.height }
    const validArea = Object.values(area).every(Number.isFinite) && area.width >= 0 && area.height >= 0
    const selected = editorChrome ? new Set([...Array.from(options.selectedLayerIds ?? []), ...(selectedLayerId ? [selectedLayerId] : [])]) : []
    const paint = new PaintFrame(layers.length, layerIndex, l => rendererRegistry.find(l),
      options.optimizePaint !== false && safeCaller && validArea ? area : null, selected,
      effect => effectRegistry.get(effect.type)?.alphaSafe === true)
    const lod = options.lod && safeCaller && validArea ? new GroupLodFrame(sourceScene, layerIndex, overrides, timeMs,
      new Set([...Array.from(options.selectedLayerIds ?? []), ...(selectedLayerId ? [selectedLayerId] : [])]),
      rendererRegistry, this.lodCache, options.lod, area, paint) : undefined
    let completed = false
    try {
    drawCompositionBackground(ctx, composition, options.background ?? 'scene')

    const visibility = new LayerDrawVisibility(layers, timeMs)
    assets.media?.request({ frame: prepared, context: ctx, area: options.visibleArea,
      padding: options.mediaPadding, prefetchMs: options.mediaPrefetchMs,
      selected: new Set([...Array.from(options.selectedLayerIds ?? []), ...(selectedLayerId ? [selectedLayerId] : [])]) })

    // ── Scene-graph walk: render ROOT layers (no parentId).
    //    Group renderer recursively walks its children. ─────────────────────
    // BL-66 — selection outlines suppressed entirely in preview mode.
    const isSelected = (id: string): boolean =>
      editorChrome && (id === selectedLayerId || !!options.selectedLayerIds?.has(id))
    for (const layer of layerIndex.roots) {
      if (!visibility.root(layer)) continue
      this.renderLayer(ctx, layer, overrides, paramValues, assets, scene, layerIndex, timeMs, isSelected(layer.id), renderMode, options.selectionOutline ?? true, boundsForFrame, sourceScene, paint, true, lod)
    }

    // ── Optional grid overlay (editor only) ───────────────────────────────
    if (editorChrome && options.grid) this.drawGrid(ctx, composition.width, composition.height, options.grid.size)
    completed = this._renderedLayerCount <= 100000
    } finally { this.paintStatistics = paint.snapshot(completed) }
  }

  /**
   * Sets up per-layer canvas state (translate, rotate, scale around anchor,
   * opacity, blend mode, motion path override), then dispatches to the
   * matching plugin via the renderer registry.
   */
  private renderLayer(
    ctx:          CanvasRenderingContext2D,
    layer:        Layer,
    overrides:    OverrideMap,
    paramValues:  ParamValueMap,
    assets:       AssetElementMap,
    scene:        ChronoScene,
    layerIndex:   LayerRelations,
    timeMs:       number,
    isSelected:   boolean,
    renderMode:   RenderMode = 'editor',
    selectionOutline = true,
    boundsForFrame?: LayerWorldBoundsResolver,
    sourceScene: ChronoScene = scene,
    paint?: PaintFrame,
    allowCulling = true,
    lod?: GroupLodFrame,
  ): void {
    // Nested repeaters/groups remain bounded even when animated counts exceed
    // the static scene's workload. No authored data is changed by this budget.
    paint?.visit()
    if (++this._renderedLayerCount > 100000) return
    // ── Motion Blur pre-render ────────────────────────────────────────────
    // Render trailing copies BEFORE the main layer so they appear behind it.
    // _mbRenderingSet prevents infinite recursion when renderSingleLayer
    // calls back into renderLayer for the trail frames.
    if (layer.motionBlur?.enabled && !layer.motionBlur.baked
        && !this._mbRenderingSet.has(layer.id)) {
      paint?.dispatch(layer)
      this._mbRenderingSet.add(layer.id)
      let mbHandled = false
      try {
        // Prefer GPU accumulation (After Effects-quality smooth smear). Falls
        // back to the CPU opacity-decay trails when GPU is unavailable.
        mbHandled = renderMotionBlurAccumulated(
          this, ctx, layer, overrides, paramValues, assets, sourceScene, timeMs, this._mbRenderingSet,
        )
        if (!mbHandled) {
          renderMotionBlurTrails(
            this, ctx, layer, overrides, paramValues, assets, sourceScene, timeMs, this._mbRenderingSet,
          )
        }
      } finally {
        this._mbRenderingSet.delete(layer.id)
      }
      // GPU drew the full averaged smear — skip the normal sharp render so we
      // don't paint a crisp copy on top of the blur.
      if (mbHandled) return
    }

    const opacity = getLayerValue(overrides, layer.id, 'opacity', layer.opacity)
    const dt = resolveDisplayTransform(layer, scene, timeMs, overrides, undefined, layerIndex)
    const x = dt.x
    const y = dt.y
    const rot = dt.rotationDeg
    const scaleX = dt.scaleX
    const scaleY = dt.scaleY

    ctx.save()
    let layerContextSaved = true
    try {
      // BL-55 — Frozen layers render translucent so the user can see they're
      // present but inactive. Half-opacity is the 3ds Max default.
      const frozenMultiplier = layer.frozen ? 0.4 : 1
      ctx.globalAlpha             *= Math.max(0, Math.min(1, opacity)) * frozenMultiplier
      ctx.globalCompositeOperation = (layer.blendMode as GlobalCompositeOperation) ?? 'source-over'
      ctx.filter                   = buildEffectsFilter(layer.effects)

      const { anchorX, anchorY } = layer.transform
      ctx.translate(x + anchorX, y + anchorY)
      if (rot   !== 0)                   ctx.rotate((rot * Math.PI) / 180)
      if (scaleX !== 1 || scaleY !== 1)  ctx.scale(scaleX, scaleY)
      ctx.translate(-anchorX, -anchorY)

      if (paint?.reject(layer, ctx, allowCulling)) return
      const plugin = rendererRegistry.find(layer)
      if (plugin) paint?.dispatch(layer)

      // ── Dispatch via registry ─────────────────────────────────────────────
      const renderContextFor = (canvas: CanvasRenderingContext2D, childCulling = allowCulling && directPaint(layer) && plugin?.paint?.sceneChildren === true, diagnostics = true): RenderContext => ({
        canvas,
        scene,
        layerIndex,
        overrides,
        paramValues,
        assets,
        timeMs,
        isSelected:      (id) => id === layer.id && isSelected,
        displayScale:    (scaleX + scaleY) / 2,
        renderMode,
        registry:        layerRegistry,
        rendererRegistry,
        // GroupRenderer uses this to render its children inside the group's
        // already-transformed canvas context.
        renderLayerById: (id: string) => {
          const child = layerIndex.get(id)
          if (!child) return
          if (!layerDrawActive(child, timeMs)) return
          this.renderLayer(canvas, child, overrides, paramValues, assets, scene, layerIndex, timeMs, false, renderMode, selectionOutline, boundsForFrame, sourceScene, diagnostics ? paint : undefined, childCulling, diagnostics && childCulling ? lod : undefined)
        },
      })
      const renderContext = renderContextFor(ctx)

      if (plugin) {
        const hasEffectsChain = (layer.effectsChain?.filter(e => e.enabled).length ?? 0) > 0
        const hasMasks        = (layer.masks?.length ?? 0) > 0
        const needsOffscreen  = hasEffectsChain || hasMasks

        if (needsOffscreen) {
          // ── Offscreen pipeline ───────────────────────────────────────────
          // 1. Render the layer's content to an offscreen canvas
          // 2. Apply effect chain
          // 3. Apply mask compositing
          // 4. Draw final result to main canvas
          ctx.restore()                                  // exit per-layer xform
          layerContextSaved = false
          const compW = scene.composition.width
          const compH = scene.composition.height

          // Helper to render any layer in the proper transformed offscreen
          const renderLayerToCanvas = (target: Layer, offCtx: CanvasRenderingContext2D) => {
            offCtx.save()
            try {
              resolveLayerWorldMatrix(target, scene, timeMs, overrides, layerIndex).applyToCanvas(offCtx)
              offCtx.globalAlpha *= Math.max(0, Math.min(1, target.opacity))
              const p = rendererRegistry.find(target)
              if (p) { paint?.dispatch(target); p.render(renderContextFor(offCtx, false), target) }
            } finally { offCtx.restore() }
          }

          this.surfacePipeline.render({
            width: compW, height: compH, layer,
            region: this.optimizeSurfaceRegions ? planLayerSurfaceRegion({ layer, scene, index: layerIndex, overrides, timeMs,
              context: ctx, find: item => rendererRegistry.find(item), effects: effectRegistry }) ?? undefined : undefined,
            effects: layer.effectsChain ?? [], masks: layer.masks ?? [],
            drawContent: cctx => {
              cctx.globalAlpha = Math.max(0, Math.min(1, opacity))
              cctx.globalCompositeOperation = (layer.blendMode as GlobalCompositeOperation) ?? 'source-over'
              cctx.filter = buildEffectsFilter(layer.effects)
              resolveLayerWorldMatrix(layer, scene, timeMs, overrides, layerIndex).applyToCanvas(cctx)
              plugin.render(renderContextFor(cctx, false), layer)
            },
            drawMask: renderLayerToCanvas, getLayer: id => layerIndex.get(id),
            composite: (contentCanvas, region) => {
              ctx.save()
              try {
                // Exit only the parent transform, retaining viewport/export scale.
                const parent = layer.parentId ? layerIndex.get(layer.parentId) : undefined
                if (parent) {
                  const matrix = resolveLayerWorldMatrix(parent, scene, timeMs, overrides, layerIndex)
                  if (Math.abs(matrix.determinant()) >= 1e-9) matrix.invert().applyToCanvas(ctx)
                }
                ctx.drawImage(contentCanvas, region.x, region.y)
              } finally { ctx.restore() }
            },
          })

          // Selection outline in original transformed space
          ctx.save()
          try {
            ctx.translate(x + anchorX, y + anchorY)
            if (rot   !== 0)                   ctx.rotate((rot * Math.PI) / 180)
            if (scaleX !== 1 || scaleY !== 1)  ctx.scale(scaleX, scaleY)
            ctx.translate(-anchorX, -anchorY)
            if (isSelected && selectionOutline) this.drawSelection(ctx, layer, scene, timeMs, overrides, boundsForFrame, layerIndex)
          } finally { ctx.restore() }
          return
        }

        if (!lod?.draw(layer, ctx, target => plugin.render(renderContextFor(target, false, false), layer), 100000 - this._renderedLayerCount)) {
          plugin.render(renderContext, layer)
        }
      }

      // ── Selection outline ─────────────────────────────────────────────────
      if (isSelected && selectionOutline) this.drawSelection(ctx, layer, scene, timeMs, overrides, boundsForFrame, layerIndex)

    } finally { if (layerContextSaved) ctx.restore() }
  }

  private drawSelection(
    ctx: CanvasRenderingContext2D, layer: Layer, scene: ChronoScene,
    timeMs: number, overrides: OverrideMap,
    boundsForFrame?: LayerWorldBoundsResolver,
    layerIndex?: LayerLookup,
  ): void {
    const bounds = boundsForFrame ? boundsForFrame(layer) : resolveLayerWorldBounds(layer, scene, timeMs, overrides)
    if (!bounds) return
    const matrix = resolveLayerWorldMatrix(layer, scene, timeMs, overrides, layerIndex)
    if (Math.abs(matrix.determinant()) < 1e-9) return
    ctx.save()
    try {
      // Exit the complete layer/parent transform, keeping the caller's canvas
      // scale (e.g. raster export). Bounds already describe the displayed frame.
      matrix.invert().applyToCanvas(ctx)
      ctx.filter      = 'none'
      ctx.strokeStyle = '#60A5FA'
      ctx.lineWidth   = 1.5
      ctx.setLineDash([4, 3])
      ctx.strokeRect(bounds.x - 2, bounds.y - 2, bounds.width + 4, bounds.height + 4)
    } finally { ctx.restore() }
  }

  private drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, step: number): void {
    if (step <= 0) return
    ctx.save()
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)'
    ctx.lineWidth   = 1
    ctx.beginPath()
    for (let x = 0; x <= w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h) }
    for (let y = 0; y <= h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y) }
    ctx.stroke()
    ctx.restore()
  }

  /**
   * BL-56 — Render a SINGLE layer at the given overrides, used for ghost /
   * onion-skin frames. Bypasses the scene-wide solo/hidden filter so the
   * caller fully controls which layer is drawn.
   *
   * Caller is responsible for ctx.save() / ctx.restore() and globalAlpha
   * adjustments (typically a multiplier for the ghost opacity).
   */
  renderSingleLayer(
    ctx:        CanvasRenderingContext2D,
    layer:      Layer,
    scene:      ChronoScene,
    assets:     AssetElementMap,
    options: {
      overrides?:   OverrideMap
      paramValues?: ParamValueMap
      timeMs:       number
    },
  ): void {
    if (this._mbRenderingSet.size === 0) this._renderedLayerCount = 0
    const prepared = prepareRenderFrame(scene, options.timeMs, options.overrides, options.paramValues)
    const { sourceScene } = prepared
    const overrides = projectFrameFontOverrides(prepared.scene, prepared.overrides, assets.fonts)
    scene = projectFrameFonts(prepared.scene,assets.fonts)
    // Temporal renders always restart from the authored layer, not the
    // previously materialized current frame supplied by a motion-blur caller.
    // Lexical ownership keeps recursive temporal calls from replacing the
    // outer frame's evaluated relationships.
    const layerIndex = scene===prepared.scene?prepared.index:new LayerIndex(scene.layers)
    assets.media?.request({ frame: prepared, context: ctx, rootIds: [layer.id] }, 'extend')
    const snapshot = layerIndex.get(layer.id)
    // Accumulation callers request source-over sampling, independently of the
    // authored layer's final scene blend. Keep that explicit call-site option.
    const frameLayer = snapshot && { ...snapshot, blendMode: layer.blendMode }
    if (!frameLayer) return
    this.renderLayer(
      ctx,
      frameLayer,
      overrides,
      options.paramValues ?? new Map(),
      assets,
      scene,
      layerIndex,
      options.timeMs,
      false,       // never show selection outline on ghost frames
      'preview',   // BL-66 — ghost frames are pure content (no anchors/chrome)
      false,
      undefined,
      sourceScene,
    )
  }
}

/** Default app-wide instance — SceneCanvas uses this. */
export const canvasRenderer = new CanvasRenderer()
