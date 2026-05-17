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
import { evaluateTimelines, getLayerValue, type OverrideMap } from '@/lib/evaluator'
import { evaluateMotionPath } from '@/lib/motionPath'
import type { AssetElementMap } from '@/lib/renderer'
import { layerRegistry, rendererRegistry } from '@/lib/registry'
import type { RenderContext, ParamValueMap } from './RenderContext'
import { effectRegistry } from '@/lib/effects'
import { createOffscreen } from './OffscreenCanvasCache'
import { defaultMaskRenderer } from '@/lib/mask/MaskRenderer'
import { defaultPathMotionResolver } from '@/lib/path/PathMotionResolver'

export interface CanvasRenderOptions {
  /** Optional pre-computed override map (for runtime preview). */
  overrides?:   OverrideMap
  /** Parameter values for text / colour resolution. */
  paramValues?: ParamValueMap
  /** Optional canvas grid overlay (pixels). */
  grid?:        { size: number }
  /** Multi-selection set — when present, EVERY id gets a selection outline. */
  selectedLayerIds?: Set<string>
}

export class CanvasRenderer {
  render(
    ctx:             CanvasRenderingContext2D,
    scene:           ChronoScene,
    timeMs:          number,
    selectedLayerId: string | null,
    assets:          AssetElementMap,
    options:         CanvasRenderOptions = {},
  ): void {
    const { composition, layers } = scene
    const overrides   = options.overrides   ?? evaluateTimelines(scene.timelines, timeMs)
    const paramValues = options.paramValues ?? new Map()

    // ── Clear + background ────────────────────────────────────────────────
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, composition.width, composition.height)
    ctx.fillStyle = composition.backgroundColor
    ctx.fillRect(0, 0, composition.width, composition.height)
    ctx.restore()

    // ── Solo-layer filter ─────────────────────────────────────────────────
    const anySolo = layers.some(l => l.solo)
    const isVisible = (l: Layer): boolean => {
      if (anySolo && !l.solo) return false
      if (l.hidden) return false
      if (timeMs < (l.startMs ?? 0)) return false
      if (l.endMs !== undefined && timeMs > l.endMs) return false
      return true
    }

    // Layers used as masks should NOT be drawn standalone — they're rendered
    // only into the masked layer's offscreen canvas.
    const usedAsMask = new Set<string>()
    for (const l of layers) {
      for (const m of l.masks ?? []) usedAsMask.add(m.maskLayerId)
    }

    // ── Scene-graph walk: render ROOT layers (no parentId).
    //    Group renderer recursively walks its children. ─────────────────────
    const isSelected = (id: string): boolean =>
      id === selectedLayerId || !!options.selectedLayerIds?.has(id)
    const rootLayers = layers.filter(l => !l.parentId)
    for (const layer of rootLayers) {
      if (!isVisible(layer)) continue
      if (usedAsMask.has(layer.id)) continue
      this.renderLayer(ctx, layer, overrides, paramValues, assets, scene, timeMs, isSelected(layer.id))
    }

    // ── Optional grid overlay ─────────────────────────────────────────────
    if (options.grid) this.drawGrid(ctx, composition.width, composition.height, options.grid.size)
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
    timeMs:       number,
    isSelected:   boolean,
  ): void {
    let x      = getLayerValue(overrides, layer.id, 'transform.x',           layer.transform.x)
    let y      = getLayerValue(overrides, layer.id, 'transform.y',           layer.transform.y)
    let rot    = getLayerValue(overrides, layer.id, 'transform.rotationDeg', layer.transform.rotationDeg)
    const scaleX  = getLayerValue(overrides, layer.id, 'transform.scaleX',   layer.transform.scaleX)
    const scaleY  = getLayerValue(overrides, layer.id, 'transform.scaleY',   layer.transform.scaleY)
    const opacity = getLayerValue(overrides, layer.id, 'opacity',            layer.opacity)

    // Motion path override (SVG-string-based)
    if (layer.motionPath?.pathData) {
      const off = getLayerValue(overrides, layer.id, 'motionPath.offset', 0)
      const mp  = evaluateMotionPath(layer.motionPath.pathData, off)
      if (mp) {
        x = mp.x; y = mp.y
        if (layer.motionPath.autoRotate) rot = mp.rotationDeg
      }
    }

    // Follow Path override (binds to another layer's Bezier path)
    if (layer.followPath) {
      const fp = layer.followPath
      const pathLayer = scene.layers.find(l => l.id === fp.pathLayerId)
      if (pathLayer?.type === 'path' && pathLayer.path) {
        // Build a NormalizedPathDefinition from the BezierPath (anchors → C/L).
        const def = layerRegistry.findForLayer(pathLayer)
        if (def?.toPath) {
          const pathDef = def.toPath(pathLayer)
          if (pathDef.commands.length > 0) {
            const progress = getLayerValue(overrides, layer.id, 'followPath.progress', fp.progress)
            const result = defaultPathMotionResolver.resolve(
              pathDef,
              progress,
              pathLayer.transform.x,
              pathLayer.transform.y,
              {
                orientToPath:        fp.orientToPath,
                rotationOffset:      getLayerValue(overrides, layer.id, 'followPath.rotationOffset', fp.rotationOffset ?? 0),
                perpendicularOffset: getLayerValue(overrides, layer.id, 'followPath.perpendicularOffset', fp.perpendicularOffset ?? 0),
              },
            )
            x = result.x
            y = result.y
            if (fp.orientToPath) rot = result.rotation
          }
        }
      }
    }

    ctx.save()
    ctx.globalAlpha             *= Math.max(0, Math.min(1, opacity))
    ctx.globalCompositeOperation = (layer.blendMode as GlobalCompositeOperation) ?? 'source-over'
    ctx.filter                   = buildEffectsFilter(layer.effects)

    const { anchorX, anchorY } = layer.transform
    ctx.translate(x + anchorX, y + anchorY)
    if (rot   !== 0)                   ctx.rotate((rot * Math.PI) / 180)
    if (scaleX !== 1 || scaleY !== 1)  ctx.scale(scaleX, scaleY)
    ctx.translate(-anchorX, -anchorY)

    // ── Dispatch via registry ─────────────────────────────────────────────
    const renderContext: RenderContext = {
      canvas:          ctx,
      scene,
      overrides,
      paramValues,
      assets,
      timeMs,
      isSelected:      (id) => id === layer.id && isSelected,
      displayScale:    (scaleX + scaleY) / 2,
      registry:        layerRegistry,
      rendererRegistry,
      // GroupRenderer uses this to render its children inside the group's
      // already-transformed canvas context.
      renderLayerById: (id: string) => {
        const child = scene.layers.find(l => l.id === id)
        if (!child) return
        if (child.hidden) return
        if (timeMs < (child.startMs ?? 0)) return
        if (child.endMs !== undefined && timeMs > child.endMs) return
        this.renderLayer(ctx, child, overrides, paramValues, assets, scene, timeMs, false)
      },
    }

    const plugin = rendererRegistry.find(layer)
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
        const compW = scene.composition.width
        const compH = scene.composition.height

        // Helper to render any layer in the proper transformed offscreen
        const renderLayerToCanvas = (target: Layer, offCtx: CanvasRenderingContext2D) => {
          const tx = getLayerValue(overrides, target.id, 'transform.x',           target.transform.x)
          const ty = getLayerValue(overrides, target.id, 'transform.y',           target.transform.y)
          const tr = getLayerValue(overrides, target.id, 'transform.rotationDeg', target.transform.rotationDeg)
          const ts = getLayerValue(overrides, target.id, 'transform.scaleX',      target.transform.scaleX)
          const tsy= getLayerValue(overrides, target.id, 'transform.scaleY',      target.transform.scaleY)
          offCtx.save()
          offCtx.translate(tx + target.transform.anchorX, ty + target.transform.anchorY)
          if (tr  !== 0)               offCtx.rotate((tr * Math.PI) / 180)
          if (ts !== 1 || tsy !== 1)   offCtx.scale(ts, tsy)
          offCtx.translate(-target.transform.anchorX, -target.transform.anchorY)
          const p = rendererRegistry.find(target)
          if (p) p.render({ ...renderContext, canvas: offCtx }, target)
          offCtx.restore()
        }

        // 1. Render host content
        let contentCanvas = createOffscreen(compW, compH)
        const cctx = contentCanvas.getContext('2d')!
        cctx.globalAlpha             = Math.max(0, Math.min(1, opacity))
        cctx.globalCompositeOperation = (layer.blendMode as GlobalCompositeOperation) ?? 'source-over'
        cctx.filter                   = buildEffectsFilter(layer.effects)
        cctx.translate(x + anchorX, y + anchorY)
        if (rot   !== 0)                   cctx.rotate((rot * Math.PI) / 180)
        if (scaleX !== 1 || scaleY !== 1)  cctx.scale(scaleX, scaleY)
        cctx.translate(-anchorX, -anchorY)
        plugin.render({ ...renderContext, canvas: cctx }, layer)

        // 2. Apply effect chain
        if (hasEffectsChain) {
          contentCanvas = effectRegistry.applyChain(contentCanvas, layer.effectsChain!)
        }

        // 3. Apply masks (composite with mask layer silhouettes)
        if (hasMasks) {
          const final = createOffscreen(compW, compH)
          const fctx  = final.getContext('2d')!
          defaultMaskRenderer.render(layer.masks!, {
            destCtx:    fctx,
            width:      compW,
            height:     compH,
            hostLayer:  layer,
            renderHost: (offCtx) => offCtx.drawImage(contentCanvas, 0, 0),
            renderMask: (maskLayer, offCtx) => renderLayerToCanvas(maskLayer, offCtx),
            getLayer:   (id) => scene.layers.find(l => l.id === id),
          })
          contentCanvas = final
        }

        // 4. Composite to main canvas at identity
        ctx.save()
        ctx.drawImage(contentCanvas, 0, 0)
        ctx.restore()

        // Selection outline in original transformed space
        ctx.save()
        ctx.translate(x + anchorX, y + anchorY)
        if (rot   !== 0)                   ctx.rotate((rot * Math.PI) / 180)
        if (scaleX !== 1 || scaleY !== 1)  ctx.scale(scaleX, scaleY)
        ctx.translate(-anchorX, -anchorY)
        if (isSelected) this.drawSelection(ctx, layer, (scaleX + scaleY) / 2, scene)
        ctx.restore()
        return
      }

      plugin.render(renderContext, layer)
    }

    // ── Selection outline ─────────────────────────────────────────────────
    if (isSelected) this.drawSelection(ctx, layer, (scaleX + scaleY) / 2, scene)

    ctx.restore()
  }

  private drawSelection(
    ctx: CanvasRenderingContext2D, layer: Layer, displayScale: number,
    scene?: ChronoScene,
  ): void {
    ctx.filter      = 'none'
    ctx.strokeStyle = '#60A5FA'
    ctx.lineWidth   = 1.5 / Math.max(0.01, displayScale)
    ctx.setLineDash([4, 3])

    // ── Group: outline = union AABB of immediate children (group-local) ──
    if (layer.type === 'group' && scene) {
      const children = scene.layers.filter(l => l.parentId === layer.id)
      if (children.length === 0) {
        // Empty group → small placeholder marker
        ctx.strokeRect(-16, -16, 32, 32)
      } else {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        for (const c of children) {
          const cw = c.size?.width  ?? 80
          const ch = c.size?.height ?? (c.text?.fontSize ?? 24)
          minX = Math.min(minX, c.transform.x)
          minY = Math.min(minY, c.transform.y)
          maxX = Math.max(maxX, c.transform.x + cw)
          maxY = Math.max(maxY, c.transform.y + ch)
        }
        ctx.strokeRect(minX - 2, minY - 2, (maxX - minX) + 4, (maxY - minY) + 4)
      }
      ctx.setLineDash([])
      return
    }

    const w = layer.size?.width  ?? 0
    const h = layer.size?.height ?? (layer.text?.fontSize ?? 20)
    ctx.strokeRect(-2, -2, w + 4, h + 4)
    ctx.setLineDash([])
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
    this.renderLayer(
      ctx,
      layer,
      options.overrides   ?? new Map(),
      options.paramValues ?? new Map(),
      assets,
      scene,
      options.timeMs,
      false, // never show selection outline on ghost frames
    )
  }
}

/** Default app-wide instance — SceneCanvas uses this. */
export const canvasRenderer = new CanvasRenderer()
