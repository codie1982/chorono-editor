// ── ParticleRendererPlugin ─────────────────────────────────────────────────────
//
// LayerRendererPlugin for 'particleEmitter' layers.
// Stateless: computes particles from (config, seed, timeMs) each frame.
// Same inputs → same output — timeline scrubbing works correctly.

import type { Layer } from '@/lib/types'
import type { LayerRendererPlugin } from '@/lib/registry/LayerRendererRegistry'
import type { RenderContext } from '@/lib/render/RenderContext'
import type { ParticleEmitterData } from '@/lib/particles/types'
import { computeSpawnParams } from '@/lib/particles/runtime/ParticleSpawner'
import { ParticleEvaluator } from '@/lib/particles/runtime/ParticleEvaluator'
import { colorToCss } from '@/lib/particles/animation/LifeGradient'

// ── Shape drawing helpers ─────────────────────────────────────────────────────
// All draw in layer-local coords with origin at particle currentPosition.
// Canvas is pre-translated to currentPosition before calling.

function drawCircle(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fill()
}

function drawSoftCircle(ctx: CanvasRenderingContext2D, r: number): void {
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r)
  grad.addColorStop(0,   ctx.fillStyle as string)
  grad.addColorStop(0.6, ctx.fillStyle as string)
  grad.addColorStop(1,   'rgba(0,0,0,0)')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fill()
}

function drawRect(ctx: CanvasRenderingContext2D, r: number): void {
  const hw = r, hh = r * 0.6
  ctx.fillRect(-hw, -hh, hw * 2, hh * 2)
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, r: number): void {
  const hw = r, hh = r * 0.6, cr = r * 0.3
  ctx.beginPath()
  ctx.roundRect(-hw, -hh, hw * 2, hh * 2, cr)
  ctx.fill()
}

function drawLine(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.beginPath()
  ctx.moveTo(0, -r)
  ctx.lineTo(0,  r)
  ctx.lineWidth = 2
  ctx.strokeStyle = ctx.fillStyle as string
  ctx.stroke()
}

function drawTriangle(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.beginPath()
  ctx.moveTo(0, -r)
  ctx.lineTo(r * 0.866, r * 0.5)
  ctx.lineTo(-r * 0.866, r * 0.5)
  ctx.closePath()
  ctx.fill()
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  r: number,
  points: number,
  innerRatio: number,
): void {
  ctx.beginPath()
  const step = Math.PI / points
  for (let i = 0; i < points * 2; i++) {
    const angle = i * step - Math.PI / 2
    const radius = i % 2 === 0 ? r : r * innerRatio
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fill()
}

function drawSmokePuff(ctx: CanvasRenderingContext2D, r: number): void {
  // Soft blob — radial gradient fades at edge
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r)
  grad.addColorStop(0,   ctx.fillStyle as string)
  grad.addColorStop(0.5, ctx.fillStyle as string)
  grad.addColorStop(1,   'rgba(0,0,0,0)')
  ctx.fillStyle = grad
  ctx.beginPath()
  // Slightly irregular ellipse
  ctx.ellipse(0, 0, r, r * 0.8, 0, 0, Math.PI * 2)
  ctx.fill()
}

function drawFlameBlob(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.beginPath()
  // teardrop shape pointing up
  ctx.moveTo(0, -r)
  ctx.bezierCurveTo(r * 0.6, -r * 0.3, r * 0.5, r * 0.5, 0, r * 0.5)
  ctx.bezierCurveTo(-r * 0.5, r * 0.5, -r * 0.6, -r * 0.3, 0, -r)
  ctx.closePath()
  ctx.fill()
}

// ── Main render ───────────────────────────────────────────────────────────────

function renderParticles(
  canvas: CanvasRenderingContext2D,
  cfg:    ParticleEmitterData,
  timeMs: number,
  layerStartMs: number,
): void {
  const relativeTime = Math.max(0, timeMs - layerStartMs)

  // Compute alive particles (stateless)
  const instances = computeSpawnParams(cfg, relativeTime)
  if (instances.length === 0) return

  const evaluator = new ParticleEvaluator(cfg)

  // Apply blend mode
  const prevComposite = canvas.globalCompositeOperation
  if (cfg.rendering.blendMode === 'screen')    canvas.globalCompositeOperation = 'screen'
  else if (cfg.rendering.blendMode === 'additive') canvas.globalCompositeOperation = 'lighter'
  else if (cfg.rendering.blendMode === 'multiply') canvas.globalCompositeOperation = 'multiply'

  for (const p of instances) {
    // Skip if dead (safety check)
    if (!p.isAlive(relativeTime)) continue

    // Evaluate frame state
    evaluator.evaluate(p, relativeTime)

    canvas.save()

    // Transform: translate to position, rotate, scale
    canvas.translate(p.currentPosition.x, p.currentPosition.y)
    canvas.rotate((p.currentRotation * Math.PI) / 180)
    canvas.scale(p.currentScale, p.currentScale)
    canvas.globalAlpha = Math.max(0, Math.min(1, p.currentOpacity))

    const r       = p.baseSize / 2
    const cssColor = colorToCss(p.currentColor)
    canvas.fillStyle = cssColor

    // Draw by shape
    switch (p.shape) {
      case 'circle':      drawCircle(canvas, r);      break
      case 'softCircle':  drawSoftCircle(canvas, r);  break
      case 'rect':        drawRect(canvas, r);         break
      case 'roundedRect': drawRoundedRect(canvas, r);  break
      case 'line':        drawLine(canvas, r);         break
      case 'triangle':    drawTriangle(canvas, r);     break
      case 'star':
        drawStar(
          canvas, r,
          cfg.particle.starPoints    ?? 5,
          cfg.particle.starInnerRatio ?? 0.4,
        )
        break
      case 'smokePuff':   drawSmokePuff(canvas, r);   break
      case 'flameBlob':   drawFlameBlob(canvas, r);   break
      default:            drawCircle(canvas, r);
    }

    canvas.restore()
  }

  // Restore composite
  canvas.globalCompositeOperation = prevComposite
}

// ── Plugin export ─────────────────────────────────────────────────────────────

export const particleRendererPlugin: LayerRendererPlugin = {
  id: 'particle-emitter-renderer',

  supports(layer: Layer): boolean {
    return layer.type === 'particleEmitter' && !!(layer as any).particleEmitter
  },

  render(ctx: RenderContext, layer: Layer): void {
    const cfg = (layer as any).particleEmitter as ParticleEmitterData
    if (!cfg) return

    const layerStartMs = layer.startMs ?? 0

    renderParticles(ctx.canvas, cfg, ctx.timeMs, layerStartMs)
  },
}
