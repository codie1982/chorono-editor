import type { ChronoScene, Layer, Vec2 } from '@/lib/types'
import type { OverrideMap } from '@/lib/evaluator'
import type { ParticleEmitterConfig } from '../types'
import { layerRegistry } from '@/lib/registry'
import { defaultPathSampler } from '@/lib/path/PathSampler'
import { Matrix2D } from '@/lib/geometry/Matrix2D'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { resolveInstanceLayer } from '@/lib/clone/InstanceResolver'
import { materializeLayerOverrides } from '@/lib/render/materializeOverrides'
import { sampleRectangleEmission } from '../animation/EmissionArea'

export interface SourceLayerContext {
  allLayers: Layer[]
  particleLayerX: number
  particleLayerY: number
  /** The render snapshot and emitter id preserve parent, anchor and rotation. */
  scene?: ChronoScene
  particleLayerId?: string
  timeMs?: number
  overrides?: OverrideMap
}

export type EmissionGeometry = (u: number, v: number) => Vec2

/** Resolve geometry once per emitter/frame. Sampling only consumes the two
 * existing spawn RNG slots, preserving all lifetime/size/color randomness. */
export function resolveEmissionGeometry(ctx: SourceLayerContext, cfg: ParticleEmitterConfig): EmissionGeometry | undefined {
  const id = cfg.shape === 'path' ? cfg.area?.pathLayerId : cfg.area?.sourceLayerId
  const raw = ctx.allLayers.find(layer => layer.id === id)
  const resolved = raw && resolveInstanceLayer(raw, ctx.allLayers)
  if (!resolved) return undefined
  const source = ctx.overrides ? materializeLayerOverrides(resolved, ctx.overrides) : resolved
  const emitter = ctx.particleLayerId ? ctx.allLayers.find(layer => layer.id === ctx.particleLayerId) : undefined
  let matrix: Matrix2D
  if (ctx.scene && emitter) {
    const own = resolveLayerWorldMatrix(emitter, ctx.scene, ctx.timeMs ?? 0, ctx.overrides)
    if (Math.abs(own.determinant()) < 1e-9) return undefined
    matrix = own.invert().multiply(resolveLayerWorldMatrix(source, ctx.scene, ctx.timeMs ?? 0, ctx.overrides))
  } else {
    matrix = Matrix2D.identity().translate(source.transform.x - ctx.particleLayerX, source.transform.y - ctx.particleLayerY)
  }
  if (![matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f].every(Number.isFinite)) return undefined
  const path = layerRegistry.findForLayer(source)?.toPath?.(source)
  const samplePath = () => path && defaultPathSampler.buildLengthTable(path,
    Math.max(1, Math.min(32, Math.floor(100000 / Math.max(1, path.commands.length)))))
  if (cfg.shape === 'path') {
    if (!path?.commands.length) return undefined
    const table = samplePath()!
    return u => matrix.applyToPoint(table.pointAtProgress(u))
  }
  // Source-layer emission samples its local bounds, then transforms into the
  // emitter's local coordinates. This also works for rotated/scaled parents.
  let x = 0, y = 0, width = source.size?.width ?? 0, height = source.size?.height ?? 0
  if ((!width || !height) && path?.commands.length) {
    const samples = samplePath()!.samples
    if (samples.length) {
      x = Infinity; y = Infinity
      let maxX = -Infinity, maxY = -Infinity
      for (const point of samples) {
        x = Math.min(x, point.x); y = Math.min(y, point.y)
        maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y)
      }
      width = maxX - x; height = maxY - y
    }
  }
  // Older direct spawner callers supplied only a relative origin and expected
  // a centered rectangle. The modern renderer supplies the exact scene basis.
  const centered = !ctx.scene || !emitter
  return (u, v) => {
    const point = sampleRectangleEmission(u, v, width / 2, height / 2, !!cfg.area?.emitFromEdge)
    return matrix.applyToPoint({ x: point.x + x + (centered ? 0 : width / 2), y: point.y + y + (centered ? 0 : height / 2) })
  }
}
