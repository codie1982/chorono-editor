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
  texture?: CanvasImageSource,
): void {
  const geometry = layer.mesh2d?.geometry
  if (!geometry) return
  const triangles = collectMesh2DTriangles(geometry)
  if (triangles.length === 0) return

  const fill = layer.style?.fill
  const opacity = getLayerValue(overrides, layer.id, 'style.fill.opacity', fill?.opacity ?? 100)
  const appearance = layer.mesh2d?.appearance
  if (appearance?.kind === 'texture' && texture) {
    ctx.save()
    ctx.globalAlpha *= Math.max(0, Math.min(100, opacity)) / 100
    const textured = drawTexturedTriangles(ctx, geometry, triangles, texture, appearance.sampling)
    ctx.restore()
    if (textured) return
  }

  if (fill) {
    const bounds = computeMesh2DLocalBounds(geometry)
    ctx.save()
    ctx.globalAlpha *= Math.max(0, Math.min(100, opacity)) / 100
    ctx.fillStyle = (fill.type === 'gradient' && bounds
      ? buildGradient(ctx, fill.gradient, bounds.width, bounds.height, bounds.x, bounds.y)
      : null) ?? resolveRenderColor(overrides, layer.id, 'style.fill.color', fill.color ?? '#3B82F6')
    buildMesh2DPath(ctx, triangles)
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
  const triangles = collectMesh2DTriangles(geometry)
  if (triangles.length === 0) return
  const scale = Math.max(Math.abs(displayScale), 1e-6)
  ctx.save()
  ctx.filter = 'none'
  ctx.globalAlpha = 1
  ctx.strokeStyle = 'rgba(147, 197, 253, 0.9)'
  ctx.lineWidth = 1 / scale
  ctx.setLineDash([3 / scale, 2 / scale])
  buildMesh2DPath(ctx, triangles)
  ctx.stroke()
  ctx.restore()
}

/** Draws current pin ids as scale-stable selected-layer editor chrome. */
export function drawMesh2DPins(
  ctx: CanvasRenderingContext2D,
  geometry: Mesh2DGeometry,
  pinVertexIds: readonly string[],
  displayScale = 1,
  stale = false,
): void {
  if (!pinVertexIds.length) return
  const selected = new Set(pinVertexIds)
  const scale = Math.max(Math.abs(displayScale), 1e-6)
  const radius = 4 / scale
  ctx.save()
  ctx.filter = 'none'
  ctx.globalAlpha = 1
  ctx.fillStyle = stale ? '#F59E0B' : '#22C55E'
  ctx.strokeStyle = '#111827'
  ctx.lineWidth = 1 / scale
  for (let index = 0; index < geometry.topology.vertexIds.length; index++) {
    if (!selected.has(geometry.topology.vertexIds[index])) continue
    const x = geometry.positions[index * 2], y = geometry.positions[index * 2 + 1]
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  ctx.restore()
}

interface MeshTriangle {
  readonly indices: readonly [number, number, number]
  readonly positions: readonly [number, number, number, number, number, number]
}

/** Collects finite, non-degenerate triangles without retaining source arrays. */
function collectMesh2DTriangles(geometry: Mesh2DGeometry): MeshTriangle[] {
  const positions = geometry.positions
  const indices = geometry.topology.triangleIndices
  const vertexCount = positions.length / 2
  if (!Number.isInteger(vertexCount)) return []
  const triangles: MeshTriangle[] = []
  for (let offset = 0; offset + 2 < indices.length; offset += 3) {
    const a = indices[offset], b = indices[offset + 1], c = indices[offset + 2]
    if (![a, b, c].every(index => Number.isSafeInteger(index) && index >= 0 && index < vertexCount)) continue
    const ax = positions[a * 2], ay = positions[a * 2 + 1]
    const bx = positions[b * 2], by = positions[b * 2 + 1]
    const cx = positions[c * 2], cy = positions[c * 2 + 1]
    if (![ax, ay, bx, by, cx, cy].every(Number.isFinite)) continue
    const signedDoubleArea = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
    if (Math.abs(signedDoubleArea) <= 1e-12) continue
    triangles.push({ indices: [a, b, c], positions: [ax, ay, bx, by, cx, cy] })
  }
  return triangles
}

/** Builds one compound path from already validated triangles. */
function buildMesh2DPath(ctx: CanvasRenderingContext2D, triangles: readonly MeshTriangle[]): void {
  ctx.beginPath()
  triangles.forEach(triangle => {
    const [ax, ay, bx, by, cx, cy] = triangle.positions
    ctx.moveTo(ax, ay)
    ctx.lineTo(bx, by)
    ctx.lineTo(cx, cy)
    ctx.closePath()
  })
}

/**
 * Maps one image through each triangle's UV affine transform.
 *
 * Validation is completed before the first draw so an invalid UV triangle
 * cannot leave a partially textured mesh. Returning false asks the caller to
 * render the complete solid fallback.
 */
function drawTexturedTriangles(
  ctx: CanvasRenderingContext2D,
  geometry: Mesh2DGeometry,
  triangles: readonly MeshTriangle[],
  texture: CanvasImageSource,
  sampling: 'linear' | 'nearest',
): boolean {
  const dimensions = sourceDimensions(texture)
  if (!dimensions) return false
  const transforms = triangles.map(triangle => textureTransform(geometry, triangle, dimensions.width, dimensions.height))
  if (transforms.some(transform => transform === null)) return false
  ctx.imageSmoothingEnabled = sampling === 'linear'
  triangles.forEach((triangle, index) => {
    const transform = transforms[index]!
    ctx.save()
    buildMesh2DPath(ctx, [triangle])
    ctx.clip()
    ctx.transform(transform.a, transform.b, transform.c, transform.d, transform.e, transform.f)
    ctx.drawImage(texture, 0, 0)
    ctx.restore()
  })
  return true
}

function sourceDimensions(source: CanvasImageSource): { width: number; height: number } | null {
  const candidate = source as CanvasImageSource & { naturalWidth?: number; naturalHeight?: number; videoWidth?: number; videoHeight?: number; width?: number; height?: number }
  const width = candidate.naturalWidth ?? candidate.videoWidth ?? candidate.width ?? 0
  const height = candidate.naturalHeight ?? candidate.videoHeight ?? candidate.height ?? 0
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? { width, height } : null
}

function textureTransform(
  geometry: Mesh2DGeometry,
  triangle: MeshTriangle,
  width: number,
  height: number,
): { a: number; b: number; c: number; d: number; e: number; f: number } | null {
  const [i0, i1, i2] = triangle.indices
  const source = [
    geometry.uvs[i0 * 2] * width, geometry.uvs[i0 * 2 + 1] * height,
    geometry.uvs[i1 * 2] * width, geometry.uvs[i1 * 2 + 1] * height,
    geometry.uvs[i2 * 2] * width, geometry.uvs[i2 * 2 + 1] * height,
  ]
  if (!source.every(Number.isFinite)) return null
  const [sx0, sy0, sx1, sy1, sx2, sy2] = source
  const [dx0, dy0, dx1, dy1, dx2, dy2] = triangle.positions
  const s1x = sx1 - sx0, s1y = sy1 - sy0, s2x = sx2 - sx0, s2y = sy2 - sy0
  const determinant = s1x * s2y - s2x * s1y
  if (!Number.isFinite(determinant) || Math.abs(determinant) <= 1e-12) return null
  const a = ((dx1 - dx0) * s2y - (dx2 - dx0) * s1y) / determinant
  const c = ((dx2 - dx0) * s1x - (dx1 - dx0) * s2x) / determinant
  const b = ((dy1 - dy0) * s2y - (dy2 - dy0) * s1y) / determinant
  const d = ((dy2 - dy0) * s1x - (dy1 - dy0) * s2x) / determinant
  const e = dx0 - a * sx0 - c * sy0
  const f = dy0 - b * sx0 - d * sy0
  const result = { a, b, c, d, e, f }
  return Object.values(result).every(Number.isFinite) ? result : null
}
