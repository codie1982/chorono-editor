import type { PathBounds } from '@/lib/geometry/computePathBounds'
import type { Mesh2DGeometry } from '@/lib/types/mesh2d'

/**
 * Computes the finite layer-local enclosure of all Mesh2D positions.
 *
 * Returns null for empty, odd-length or non-finite position payloads rather
 * than publishing misleading bounds. Input arrays are borrowed synchronously
 * and never mutated or retained.
 */
export function computeMesh2DLocalBounds(geometry: Mesh2DGeometry): PathBounds | null {
  const positions = geometry.positions
  if (positions.length < 2 || positions.length % 2 !== 0) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let index = 0; index < positions.length; index += 2) {
    const x = positions[index], y = positions[index + 1]
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    minX = Math.min(minX, x); minY = Math.min(minY, y)
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Tests a layer-local point against actual Mesh2D triangles.
 *
 * Points on an edge count as hits. `tolerance` is a unitless barycentric cross
 * product tolerance; the default is suitable for authored composition-pixel
 * grids. Invalid/out-of-range triangles are skipped so corrupt imported source
 * cannot throw during pointer handling. This query does not fall back to the
 * mesh AABB, preserving holes and disconnected regions.
 */
export function containsMesh2DPoint(
  geometry: Mesh2DGeometry,
  x: number,
  y: number,
  tolerance = 1e-9,
): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(tolerance) || tolerance < 0) return false
  const { positions } = geometry
  const indices = geometry.topology.triangleIndices
  const vertexCount = positions.length / 2
  if (!Number.isInteger(vertexCount)) return false

  for (let offset = 0; offset + 2 < indices.length; offset += 3) {
    const a = indices[offset], b = indices[offset + 1], c = indices[offset + 2]
    if (![a, b, c].every(index => Number.isSafeInteger(index) && index >= 0 && index < vertexCount)) continue
    const ax = positions[a * 2], ay = positions[a * 2 + 1]
    const bx = positions[b * 2], by = positions[b * 2 + 1]
    const cx = positions[c * 2], cy = positions[c * 2 + 1]
    if (![ax, ay, bx, by, cx, cy].every(Number.isFinite)) continue
    const signedDoubleArea = cross(bx - ax, by - ay, cx - ax, cy - ay)
    if (Math.abs(signedDoubleArea) <= tolerance) continue
    const first = cross(bx - ax, by - ay, x - ax, y - ay)
    const second = cross(cx - bx, cy - by, x - bx, y - by)
    const third = cross(ax - cx, ay - cy, x - cx, y - cy)
    const hasNegative = first < -tolerance || second < -tolerance || third < -tolerance
    const hasPositive = first > tolerance || second > tolerance || third > tolerance
    if (!(hasNegative && hasPositive)) return true
  }
  return false
}

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx
}
