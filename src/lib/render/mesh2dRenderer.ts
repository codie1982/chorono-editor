import { getLayerValue, type OverrideMap } from '@/lib/evaluator'
import { computeMesh2DLocalBounds } from '@/lib/geometry/mesh2d'
import type { Layer } from '@/lib/types'
import type { Mesh2DGeometry } from '@/lib/types/mesh2d'
import { buildGradient } from './buildGradient'
import { resolveRenderColor } from './materializeOverrides'

/**
 * Draws the valid triangles in one Mesh2D Canvas path.
 *
 * Geometry is layer-local composition pixels. Invalid indices and non-finite
 * triangles are skipped so malformed imported source cannot abort a frame.
 * Fill opacity/color may be driven by timeline overrides. Editor wireframe is
 * a separate post-effects overlay so it cannot leak into preview/export.
 */
export function drawMesh2DLayer(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  overrides: OverrideMap,
): void {
  const geometry = layer.mesh2d?.geometry
  if (!geometry) return
  const triangleCount = buildMesh2DPath(ctx, geometry)
  if (triangleCount === 0) return

  const fill = layer.style?.fill
  if (fill) {
    const bounds = computeMesh2DLocalBounds(geometry)
    const opacity = getLayerValue(overrides, layer.id, 'style.fill.opacity', fill.opacity ?? 100)
    ctx.save()
    ctx.globalAlpha *= Math.max(0, Math.min(100, opacity)) / 100
    ctx.fillStyle = (fill.type === 'gradient' && bounds
      ? buildGradient(ctx, fill.gradient, bounds.width, bounds.height, bounds.x, bounds.y)
      : null) ?? resolveRenderColor(overrides, layer.id, 'style.fill.color', fill.color ?? '#3B82F6')
    ctx.fill()
    ctx.restore()
  }

}

/** Draws selected-layer topology as scale-stable editor chrome. */
export function drawMesh2DWireframe(
  ctx: CanvasRenderingContext2D,
  geometry: Mesh2DGeometry,
  displayScale = 1,
): void {
  if (buildMesh2DPath(ctx, geometry) === 0) return
  const scale = Math.max(Math.abs(displayScale), 1e-6)
  ctx.save()
  ctx.filter = 'none'
  ctx.globalAlpha = 1
  ctx.strokeStyle = 'rgba(147, 197, 253, 0.9)'
  ctx.lineWidth = 1 / scale
  ctx.setLineDash([3 / scale, 2 / scale])
  ctx.stroke()
  ctx.restore()
}

/** Builds one compound triangle path and returns its valid triangle count. */
function buildMesh2DPath(ctx: CanvasRenderingContext2D, geometry: Mesh2DGeometry): number {
  const positions = geometry.positions
  const indices = geometry.topology.triangleIndices
  const vertexCount = positions.length / 2
  if (!Number.isInteger(vertexCount)) return 0
  let count = 0
  ctx.beginPath()
  for (let offset = 0; offset + 2 < indices.length; offset += 3) {
    const a = indices[offset], b = indices[offset + 1], c = indices[offset + 2]
    if (![a, b, c].every(index => Number.isSafeInteger(index) && index >= 0 && index < vertexCount)) continue
    const ax = positions[a * 2], ay = positions[a * 2 + 1]
    const bx = positions[b * 2], by = positions[b * 2 + 1]
    const cx = positions[c * 2], cy = positions[c * 2 + 1]
    if (![ax, ay, bx, by, cx, cy].every(Number.isFinite)) continue
    const signedDoubleArea = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
    if (Math.abs(signedDoubleArea) <= 1e-12) continue
    ctx.moveTo(ax, ay)
    ctx.lineTo(bx, by)
    ctx.lineTo(cx, cy)
    ctx.closePath()
    count++
  }
  return count
}
