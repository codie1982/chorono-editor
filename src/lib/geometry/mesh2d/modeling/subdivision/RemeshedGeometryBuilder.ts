import type { Mesh2DGeometry } from '../../../../types/mesh2d'
import { Mesh2DTopologyHasher } from '../../Mesh2DTopologyHasher'
import { Mesh2DTopologyValidator } from '../../Mesh2DTopologyValidator'
import { MeshRemeshingSource, meshCoordinate, pointKey, type Point2 } from './MeshRemeshingSource'

/** Job-owned mesh assembly. Welds shared sites, resamples UVs, preserves source
 * IDs where positions survive, and assigns deterministic instance-local new IDs.
 * Faces are positively wound. Quad cells have matching renderer triangles.
 * Complete output is compacted, validated and area checked before publication. */
export class RemeshedGeometryBuilder {
  private readonly pointRecords: [number, number][] = []
  /** Borrow sites read-only for a triangulator; vertex() is the only writer. */
  get points(): readonly Point2[] { return this.pointRecords }
  private readonly uv: number[] = []
  private readonly ids: string[] = []
  private readonly pointIndex = new Map<string, number>()
  private readonly usedIds: Set<string>
  private readonly faces: number[] = []
  private readonly quads: number[] = []
  constructor(private readonly source: MeshRemeshingSource, private readonly namespace: string) { this.usedIds = new Set(Array.from(source.originals.values(), item => item.id)) }
  /** Insert one shared coordinate; return its stable output index. */
  vertex(point: Point2): number {
    const p: [number, number] = [meshCoordinate(point[0]), meshCoordinate(point[1])], key = pointKey(p), known = this.pointIndex.get(key)
    if (known !== undefined) return known
    if (this.points.length >= 16384) throw new Error('Subdivision output vertex budget exceeded. Reduce detail.')
    const original = this.source.originals.get(key), uv = original?.uv ?? this.source.sampler.sample(...p)
    if (!uv) throw new Error('Subdivision generated a vertex outside the source material.')
    let id = original?.id ?? `${this.namespace}_vertex_${this.points.length}`
    if (!original) { while (this.usedIds.has(id)) id += '_'; this.usedIds.add(id) }
    this.pointIndex.set(key, this.points.length); this.pointRecords.push(p); this.uv.push(...uv); this.ids.push(id)
    return this.points.length - 1
  }
  /** Append a non-degenerate, positively oriented face; never silently drop area. */
  triangle(a: number, b: number, c: number): void {
    if (this.faces.length / 3 >= 32768) throw new Error('Subdivision output triangle budget exceeded. Reduce detail.')
    const [ax, ay] = this.points[a], [bx, by] = this.points[b], [cx, cy] = this.points[c]
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
    if (Math.abs(area) <= 1e-8) throw new Error('Subdivision produced a degenerate face. Adjust cell size.')
    this.faces.push(...(area > 0 ? [a, b, c] : [a, c, b]))
  }
  /** Preserve a full square cell; boundary transition polygons remain triangles. */
  quad(a: number, b: number, c: number, d: number): void { this.quads.push(a, b, c, d); this.triangle(a, b, c); this.triangle(a, c, d) }
  /** Return a compact portable result; shared validator/area failures throw. */
  finish(): Mesh2DGeometry {
    const used = new Set(this.faces), remap = new Map<number, number>(), positions: number[] = [], uvs: number[] = [], vertexIds: string[] = []
    this.points.forEach((point, index) => { if (used.has(index)) { remap.set(index, vertexIds.length); positions.push(...point); uvs.push(this.uv[index * 2], this.uv[index * 2 + 1]); vertexIds.push(this.ids[index]) } })
    const triangleIndices = this.faces.map(index => remap.get(index)!), quadIndices = this.quads.map(index => remap.get(index)!)
    const topology = { schemaVersion: 1 as const, vertexIds, triangleIndices, ...(quadIndices.length ? { quadIndices } : {}) }
    const geometry: Mesh2DGeometry = { positions, uvs, topology: { ...topology, topologyHash: new Mesh2DTopologyHasher().hash(topology) },
      textureReferenceBounds: this.source.geometry.textureReferenceBounds ?? this.source.bounds }
    const valid = new Mesh2DTopologyValidator().validate(geometry)
    if (!valid.valid) throw new Error(`Subdivision output is invalid: ${valid.diagnostics.map(item => item.code).join(', ')}.`)
    let area = 0
    for (let i = 0; i < triangleIndices.length; i += 3) {
      const a = triangleIndices[i] * 2, b = triangleIndices[i + 1] * 2, c = triangleIndices[i + 2] * 2
      area += ((positions[b] - positions[a]) * (positions[c + 1] - positions[a + 1]) - (positions[b + 1] - positions[a + 1]) * (positions[c] - positions[a])) / 2
    }
    if (!triangleIndices.length || Math.abs(area - this.source.area) > Math.max(1e-6, this.source.area * 1e-8)) throw new Error('Subdivision did not preserve material area.')
    return geometry
  }
}
