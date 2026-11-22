import type { Mesh2DGeometry } from '@/lib/types/mesh2d'
import { Mesh2DAdjacencyBuilder } from './Mesh2DAdjacencyBuilder'
import { Mesh2DTopologyHasher } from './Mesh2DTopologyHasher'

export type Mesh2DValidationSeverity = 'error' | 'warning'

/** Machine-readable validation diagnostic for authoring/import UI. */
export interface Mesh2DValidationDiagnostic {
  readonly severity: Mesh2DValidationSeverity
  readonly code:
    | 'position-count'
    | 'uv-count'
    | 'vertex-id-count'
    | 'duplicate-vertex-id'
    | 'non-finite-position'
    | 'non-finite-uv'
    | 'invalid-texture-reference-bounds'
    | 'triangle-index-count'
    | 'invalid-triangle-index'
    | 'duplicate-triangle-index'
    | 'degenerate-triangle'
    | 'reversed-triangle'
    | 'duplicate-triangle'
    | 'non-manifold-edge'
    | 'orphan-vertex'
    | 'topology-hash-mismatch'
    | 'invalid-quad-cell'
  readonly message: string
  readonly vertexIndex?: number
  readonly triangleIndex?: number
}

export interface Mesh2DValidationResult {
  readonly valid: boolean
  readonly diagnostics: readonly Mesh2DValidationDiagnostic[]
  readonly vertexCount: number
  readonly triangleCount: number
}

/**
 * Validates fixed Mesh2D connectivity and payload invariants without mutation.
 *
 * Coordinates use layer-local x-right/y-down pixels. A valid front-facing
 * triangle therefore has positive signed double-area. `areaTolerance` is in
 * squared local pixels and catches zero/sliver triangles; callers should choose
 * a larger domain-specific tolerance when converting coarse imported geometry.
 * This first validator detects duplicate/non-manifold connectivity and orphan
 * vertices. General T-junction detection belongs to the later spline/import
 * conversion stage because it requires spatial tolerance and segment queries.
 *
 * Instances retain only the configured tolerance and are safe to reuse.
 */
export class Mesh2DTopologyValidator {
  constructor(
    private readonly areaTolerance = 1e-8,
    private readonly hasher = new Mesh2DTopologyHasher(),
  ) {
    if (!Number.isFinite(areaTolerance) || areaTolerance < 0) {
      throw new Error('Mesh2D area tolerance must be a finite non-negative number')
    }
  }

  validate(geometry: Mesh2DGeometry): Mesh2DValidationResult {
    const diagnostics: Mesh2DValidationDiagnostic[] = []
    const vertexCount = geometry.positions.length / 2
    const triangleCount = geometry.topology.triangleIndices.length / 3

    if (geometry.positions.length % 2 !== 0) this.error(diagnostics, 'position-count', 'Positions must contain x/y pairs')
    if (geometry.uvs.length !== geometry.positions.length) this.error(diagnostics, 'uv-count', 'UV count must match position component count')
    if (geometry.topology.vertexIds.length !== vertexCount) this.error(diagnostics, 'vertex-id-count', 'Vertex id count must match position pair count')
    if (geometry.topology.triangleIndices.length % 3 !== 0) this.error(diagnostics, 'triangle-index-count', 'Triangle indices must be grouped in triples')

    this.validateQuads(geometry, diagnostics)
    this.validateVertexPayload(geometry, diagnostics)
    this.validateTextureReferenceBounds(geometry, diagnostics)
    const indicesValid = this.validateTriangles(geometry, diagnostics)
    if (indicesValid && Number.isInteger(vertexCount) && Number.isInteger(triangleCount)) {
      this.validateConnectivity(geometry, diagnostics)
    }
    const expectedHash = this.hasher.hash(geometry.topology)
    if (geometry.topology.topologyHash !== expectedHash) {
      this.error(diagnostics, 'topology-hash-mismatch', 'Stored topology hash does not match connectivity')
    }

    return {
      valid: diagnostics.every(diagnostic => diagnostic.severity !== 'error'),
      diagnostics,
      vertexCount: Number.isInteger(vertexCount) ? vertexCount : Math.floor(vertexCount),
      triangleCount: Number.isInteger(triangleCount) ? triangleCount : Math.floor(triangleCount),
    }
  }

  /** Optional Grid cells are explicit metadata backed by exactly the same
   * oriented renderer faces. Legacy triangle-only hashes/contracts are unchanged. */
  private validateQuads(geometry: Mesh2DGeometry, diagnostics: Mesh2DValidationDiagnostic[]): void {
    const quads = geometry.topology.quadIndices
    if (quads === undefined) return
    if (!Array.isArray(quads) || quads.length % 4 !== 0) { this.error(diagnostics, 'invalid-quad-cell', 'Quad indices must be grouped by four'); return }
    const faces = new Set<string>(), triangles = geometry.topology.triangleIndices
    const key = (a: number, b: number, c: number) => a < b && a < c ? `${a}:${b}:${c}` : b < c ? `${b}:${c}:${a}` : `${c}:${a}:${b}`
    for (let i = 0; i < triangles.length; i += 3) faces.add(key(triangles[i], triangles[i + 1], triangles[i + 2]))
    const cells = new Set<string>()
    for (let i = 0; i < quads.length; i += 4) {
      const [a, b, c, d] = quads.slice(i, i + 4), id = [a, b, c, d].slice().sort((x, y) => x - y).join(':')
      if (new Set([a, b, c, d]).size !== 4 || ![a, b, c, d].every(vertex => Number.isSafeInteger(vertex) && vertex >= 0 && vertex < geometry.positions.length / 2)
        || cells.has(id) || !faces.has(key(a, b, c)) || !faces.has(key(a, c, d))) this.error(diagnostics, 'invalid-quad-cell', 'Quad cell must reference four vertices and matching positively ordered triangle faces')
      cells.add(id)
    }
  }

  private validateTextureReferenceBounds(
    geometry: Mesh2DGeometry,
    diagnostics: Mesh2DValidationDiagnostic[],
  ): void {
    const bounds = geometry.textureReferenceBounds
    if (!bounds) return
    if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
      || bounds.width <= 0 || bounds.height <= 0) {
      this.error(diagnostics, 'invalid-texture-reference-bounds', 'Texture reference bounds must be finite with positive width and height')
    }
  }

  private validateVertexPayload(geometry: Mesh2DGeometry, diagnostics: Mesh2DValidationDiagnostic[]): void {
    const ids = new Set<string>()
    geometry.topology.vertexIds.forEach((id, vertexIndex) => {
      if (ids.has(id)) this.error(diagnostics, 'duplicate-vertex-id', `Duplicate vertex id "${id}"`, { vertexIndex })
      ids.add(id)
    })
    geometry.positions.forEach((value, componentIndex) => {
      if (!Number.isFinite(value)) this.error(diagnostics, 'non-finite-position', 'Position components must be finite', { vertexIndex: Math.floor(componentIndex / 2) })
    })
    geometry.uvs.forEach((value, componentIndex) => {
      if (!Number.isFinite(value)) this.error(diagnostics, 'non-finite-uv', 'UV components must be finite', { vertexIndex: Math.floor(componentIndex / 2) })
    })
  }

  private validateTriangles(geometry: Mesh2DGeometry, diagnostics: Mesh2DValidationDiagnostic[]): boolean {
    const vertexCount = geometry.positions.length / 2
    const triangleCount = Math.floor(geometry.topology.triangleIndices.length / 3)
    let indicesValid = Number.isInteger(vertexCount)
    const triangleKeys = new Set<string>()

    for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex++) {
      const offset = triangleIndex * 3
      const triangle = geometry.topology.triangleIndices.slice(offset, offset + 3)
      const inRange = triangle.every(index => Number.isSafeInteger(index) && index >= 0 && index < vertexCount)
      if (!inRange) {
        indicesValid = false
        this.error(diagnostics, 'invalid-triangle-index', 'Triangle indices must be safe integers inside the vertex range', { triangleIndex })
        continue
      }
      if (new Set(triangle).size !== 3) {
        this.error(diagnostics, 'duplicate-triangle-index', 'A triangle must reference three distinct vertices', { triangleIndex })
        continue
      }
      const key = [...triangle].sort((a, b) => a - b).join(':')
      if (triangleKeys.has(key)) this.error(diagnostics, 'duplicate-triangle', 'Duplicate triangle connectivity', { triangleIndex })
      triangleKeys.add(key)

      const [a, b, c] = triangle
      const ax = geometry.positions[a * 2], ay = geometry.positions[a * 2 + 1]
      const bx = geometry.positions[b * 2], by = geometry.positions[b * 2 + 1]
      const cx = geometry.positions[c * 2], cy = geometry.positions[c * 2 + 1]
      const signedDoubleArea = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
      if (!Number.isFinite(signedDoubleArea)) continue
      if (Math.abs(signedDoubleArea) <= this.areaTolerance) {
        this.error(diagnostics, 'degenerate-triangle', 'Triangle area is zero or below tolerance', { triangleIndex })
      } else if (signedDoubleArea < 0) {
        this.error(diagnostics, 'reversed-triangle', 'Triangle winding must be positive in x-right/y-down local coordinates', { triangleIndex })
      }
    }
    return indicesValid
  }

  private validateConnectivity(geometry: Mesh2DGeometry, diagnostics: Mesh2DValidationDiagnostic[]): void {
    const adjacency = new Mesh2DAdjacencyBuilder().build(geometry.topology)
    adjacency.edges.forEach(edge => {
      if (edge.triangleIndices.length > 2) {
        this.error(diagnostics, 'non-manifold-edge', `Edge ${edge.vertices.join(':')} belongs to more than two triangles`)
      }
    })
    adjacency.vertexNeighbors.forEach((neighbors, vertexIndex) => {
      if (neighbors.length === 0) this.warning(diagnostics, 'orphan-vertex', 'Vertex is not referenced by any triangle', { vertexIndex })
    })
  }

  private error(
    diagnostics: Mesh2DValidationDiagnostic[],
    code: Mesh2DValidationDiagnostic['code'],
    message: string,
    location: Pick<Mesh2DValidationDiagnostic, 'vertexIndex' | 'triangleIndex'> = {},
  ): void {
    diagnostics.push({ severity: 'error', code, message, ...location })
  }

  private warning(
    diagnostics: Mesh2DValidationDiagnostic[],
    code: Mesh2DValidationDiagnostic['code'],
    message: string,
    location: Pick<Mesh2DValidationDiagnostic, 'vertexIndex' | 'triangleIndex'> = {},
  ): void {
    diagnostics.push({ severity: 'warning', code, message, ...location })
  }
}
