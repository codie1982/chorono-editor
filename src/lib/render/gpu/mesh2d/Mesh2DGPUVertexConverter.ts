import type { Mesh2DTexturePlacement } from '@/lib/mesh2d/Mesh2DTextureMapping'
import type { Mesh2DGeometry } from '@/lib/types/mesh2d'

export interface Mesh2DGPUVertexData {
  /** De-indexed x/y/u/v vertices, three vertices per triangle. */
  readonly vertices: Float32Array
  readonly triangleCount: number
}

/**
 * Converts portable fixed-topology geometry into one GPU triangle stream.
 *
 * Destination positions may be rest or a sampled deformation frame. UVs are
 * resolved through the same placement matrix as Canvas2D, then normalized to
 * source-image coordinates. Invalid topology triangles are skipped, matching
 * Canvas rendering. Any referenced invalid/degenerate UV triangle rejects the
 * whole conversion so the caller can render the complete solid Canvas fallback
 * instead of a partially textured mesh. Inputs are borrowed and never mutated.
 */
export class Mesh2DGPUVertexConverter {
  static convert(
    geometry: Mesh2DGeometry,
    positions: ArrayLike<number>,
    placement: Mesh2DTexturePlacement,
    sourceWidth: number,
    sourceHeight: number,
  ): Mesh2DGPUVertexData | null {
    if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight)
      || sourceWidth <= 0 || sourceHeight <= 0 || positions.length % 2 !== 0) return null
    const vertexCount = positions.length / 2
    const output: number[] = []
    const indices = geometry.topology.triangleIndices

    for (let offset = 0; offset + 2 < indices.length; offset += 3) {
      const triangle = [indices[offset], indices[offset + 1], indices[offset + 2]]
      if (!triangle.every(index => Number.isSafeInteger(index) && index >= 0 && index < vertexCount)) continue
      const destination = triangle.map(index => ({ x: positions[index * 2], y: positions[index * 2 + 1] }))
      if (!destination.flatMap(point => [point.x, point.y]).every(Number.isFinite)) continue
      if (Math.abs(cross(destination[0], destination[1], destination[2])) <= 1e-12) continue

      const source = triangle.map(index => {
        const local = {
          x: placement.bounds.x + geometry.uvs[index * 2] * placement.bounds.width,
          y: placement.bounds.y + geometry.uvs[index * 2 + 1] * placement.bounds.height,
        }
        const point = placement.localToSource.applyToPoint(local)
        return { x: point.x / sourceWidth, y: point.y / sourceHeight }
      })
      if (!source.flatMap(point => [point.x, point.y]).every(Number.isFinite)
        || Math.abs(cross(source[0], source[1], source[2])) <= 1e-12) return null

      for (let index = 0; index < 3; index++) {
        output.push(destination[index].x, destination[index].y, source[index].x, source[index].y)
      }
    }
    if (!output.length) return null
    return { vertices: Float32Array.from(output), triangleCount: output.length / 12 }
  }
}

function cross(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}
