// ── Renderer Plugins ──────────────────────────────────────────────────────────
//
// Thin LayerRendererPlugin adapters around the existing draw* functions in
// lib/renderer.ts. Once the legacy renderer.ts is dismantled (post-Sprint 5),
// each plugin's body will absorb the corresponding draw function.
//
// The plugin pattern means adding a new layer kind requires:
//   1. A LayerDefinition (registry/definitions/…)
//   2. A LayerRendererPlugin (this file)
//   3. Registering both in registry/bootstrap.ts
// No other file changes — open/closed principle satisfied.

import type { Layer } from '@/lib/types'
import type { LayerRendererPlugin } from '@/lib/registry'
import type { RenderContext } from '../RenderContext'
import {
  drawShape, drawText, drawImageLayer, drawVideoLayer, drawBezierPath,
} from '@/lib/renderer'
import { drawPathStrokeLayer } from '@/lib/runtime/pathStrokeRenderer'

// ── Shape ────────────────────────────────────────────────────────────────────

export const shapeRendererPlugin: LayerRendererPlugin = {
  id: 'shape',
  supports: (layer: Layer) => layer.type === 'shape' && !!layer.size,
  render(ctx: RenderContext, layer: Layer): void {
    drawShape(ctx.canvas, layer, ctx.overrides, ctx.paramValues)
  },
}

// ── Text ─────────────────────────────────────────────────────────────────────

export const textRendererPlugin: LayerRendererPlugin = {
  id: 'text',
  supports: (layer: Layer) => layer.type === 'text',
  render(ctx: RenderContext, layer: Layer): void {
    drawText(ctx.canvas, layer, ctx.paramValues)
  },
}

// ── Image ────────────────────────────────────────────────────────────────────

export const imageRendererPlugin: LayerRendererPlugin = {
  id: 'image',
  supports: (layer: Layer) => layer.type === 'image',
  render(ctx: RenderContext, layer: Layer): void {
    drawImageLayer(ctx.canvas, layer, ctx.assets)
  },
}

// ── Video ────────────────────────────────────────────────────────────────────

export const videoRendererPlugin: LayerRendererPlugin = {
  id: 'video',
  supports: (layer: Layer) => layer.type === 'video',
  render(ctx: RenderContext, layer: Layer): void {
    drawVideoLayer(ctx.canvas, layer, ctx.assets)
  },
}

// ── Path Stroke ──────────────────────────────────────────────────────────────

export const pathStrokeRendererPlugin: LayerRendererPlugin = {
  id: 'pathStroke',
  supports: (layer: Layer) => layer.type === 'pathStroke',
  render(ctx: RenderContext, layer: Layer): void {
    drawPathStrokeLayer(ctx.canvas, layer, ctx.overrides)
  },
}

// ── Bezier Path ──────────────────────────────────────────────────────────────

export const bezierPathRendererPlugin: LayerRendererPlugin = {
  id: 'bezierPath',
  supports: (layer: Layer) => layer.type === 'path' && !!layer.path,
  render(ctx: RenderContext, layer: Layer): void {
    drawBezierPath(ctx.canvas, layer, ctx.overrides, ctx.paramValues)
  },
}

// ── Group ────────────────────────────────────────────────────────────────────
// A group renders its CHILDREN — there's no geometry of its own. Group's
// transform was already applied by the caller (CanvasRenderer.renderLayer);
// children are drawn in that same transformed space.

export const groupRendererPlugin: LayerRendererPlugin = {
  id: 'group',
  supports: (layer: Layer) => layer.type === 'group',
  render(ctx: RenderContext, layer: Layer): void {
    const childIds = ctx.scene.layers
      .filter(l => l.parentId === layer.id)
      .map(l => l.id)
    for (const id of childIds) ctx.renderLayerById(id)
  },
}

// ── Repeater ─────────────────────────────────────────────────────────────────
// Renders N transformed copies of a source layer. Uses RepeaterResolver to
// compute each instance's matrix, then ctx.transform + renderLayerById.

import { defaultRepeaterResolver } from '@/lib/repeater/RepeaterResolver'

export const repeaterRendererPlugin: LayerRendererPlugin = {
  id: 'repeater',
  supports: (layer: Layer) => layer.type === 'repeater' && !!layer.repeater,
  render(ctx: RenderContext, layer: Layer): void {
    const cfg = layer.repeater
    if (!cfg) return
    const source = ctx.scene.layers.find(l => l.id === cfg.sourceLayerId)
    if (!source) return

    const instances = defaultRepeaterResolver.resolve({
      sourceLayerId: cfg.sourceLayerId,
      count:         cfg.count,
      mode:          cfg.mode,
      transformStep: cfg.transformStep,
      polar:         cfg.polar,
    })

    for (const inst of instances) {
      ctx.canvas.save()
      // Apply per-instance affine
      const m = inst.matrix
      ctx.canvas.transform(m.a, m.b, m.c, m.d, m.e, m.f)
      ctx.canvas.globalAlpha *= inst.opacityMultiplier
      ctx.renderLayerById(cfg.sourceLayerId)
      ctx.canvas.restore()
    }
  },
}

// ── Particle Emitter (BL-13) ─────────────────────────────────────────────────

import { particleRendererPlugin } from './ParticleRendererPlugin'
export { particleRendererPlugin }

// ── All built-in renderers (registered by bootstrap) ─────────────────────────

export const ALL_BUILT_IN_RENDERERS: LayerRendererPlugin[] = [
  shapeRendererPlugin,
  textRendererPlugin,
  imageRendererPlugin,
  videoRendererPlugin,
  pathStrokeRendererPlugin,
  bezierPathRendererPlugin,
  groupRendererPlugin,
  repeaterRendererPlugin,
  particleRendererPlugin,
]
