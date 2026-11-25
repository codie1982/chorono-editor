import type { Mesh2DData, Mesh2DGridDiagonal, Mesh2DTopology } from '@/lib/types/mesh2d'
import { Mesh2DTopologyHasher } from './Mesh2DTopologyHasher'
import { Mesh2DTopologyValidator } from './Mesh2DTopologyValidator'

export interface StructuredGridMesh2DOptions {
  readonly width: number
  readonly height: number
  /** Horizontal cell count. */
  readonly columns: number
  /** Vertical cell count. */
  readonly rows: number
  readonly diagonal?: Mesh2DGridDiagonal
}

/**
 * Builds a deterministic fixed-topology triangle mesh for a rectangular grid.
 *
 * Positions use layer-local composition pixels with origin at the rectangle's
 * top-left and positive y downward. UVs cover `[0, 1]²`. Vertex ids are stable
 * row/column coordinates and triangle order is row-major. The generator does
 * not mutate options and does not retain generated arrays between calls.
 *
 * Invalid dimensions, non-integer cell counts and requests above the bounded
 * vertex budget throw before allocation. Generated output is validated before
 * return; an internal invariant failure also throws instead of publishing a
 * partially valid mesh.
 */
export class StructuredGridMesh2DGenerator {
  static readonly generatorVersion = 1
  static readonly maxVertexCount = 262_144

  constructor(
    private readonly hasher = new Mesh2DTopologyHasher(),
    private readonly validator = new Mesh2DTopologyValidator(),
  ) {}

  generate(options: StructuredGridMesh2DOptions): Mesh2DData {
    this.validateOptions(options)
    const diagonal = options.diagonal ?? 'topLeftToBottomRight'
    const vertexColumns = options.columns + 1
    const vertexRows = options.rows + 1
    const positions: number[] = []
    const uvs: number[] = []
    const vertexIds: string[] = []

    for (let row = 0; row < vertexRows; row++) {
      const v = row / options.rows
      for (let column = 0; column < vertexColumns; column++) {
        const u = column / options.columns
        positions.push(options.width * u, options.height * v)
        uvs.push(u, v)
        vertexIds.push(`grid:${row}:${column}`)
      }
    }

    // Optional v1 cell metadata keeps renderer connectivity while exposing one
    // editable four-sided face. Previously saved triangle-only files stay valid.
    const triangleIndices: number[] = [], quadIndices: number[] = []
    for (let row = 0; row < options.rows; row++) {
      for (let column = 0; column < options.columns; column++) {
        const topLeft = row * vertexColumns + column
        const topRight = topLeft + 1
        const bottomLeft = topLeft + vertexColumns
        const bottomRight = bottomLeft + 1
        if (diagonal === 'topLeftToBottomRight') {
          triangleIndices.push(topLeft, topRight, bottomRight, topLeft, bottomRight, bottomLeft)
          quadIndices.push(topLeft, topRight, bottomRight, bottomLeft)
        } else {
          triangleIndices.push(topLeft, topRight, bottomLeft, topRight, bottomRight, bottomLeft)
          quadIndices.push(topRight, bottomRight, bottomLeft, topLeft)
        }
      }
    }

    const topologyWithoutHash: Omit<Mesh2DTopology, 'topologyHash'> = {
      schemaVersion: 1,
      vertexIds,
      triangleIndices,
      quadIndices,
    }
    const topology: Mesh2DTopology = {
      ...topologyWithoutHash,
      topologyHash: this.hasher.hash(topologyWithoutHash),
    }
    const data: Mesh2DData = {
      schemaVersion: 1,
      source: {
        kind: 'structuredGrid',
        width: options.width,
        height: options.height,
        columns: options.columns,
        rows: options.rows,
        diagonal,
        generatorVersion: StructuredGridMesh2DGenerator.generatorVersion,
      },
      geometry: { positions, uvs, topology },
    }
    const validation = this.validator.validate(data.geometry)
    if (!validation.valid) {
      throw new Error(`Structured grid generated invalid Mesh2D topology: ${validation.diagnostics.map(item => item.code).join(', ')}`)
    }
    return data
  }

  private validateOptions(options: StructuredGridMesh2DOptions): void {
    if (!Number.isFinite(options.width) || options.width <= 0 || !Number.isFinite(options.height) || options.height <= 0) {
      throw new Error('Structured grid width and height must be finite positive numbers')
    }
    if (!Number.isSafeInteger(options.columns) || options.columns < 1 || !Number.isSafeInteger(options.rows) || options.rows < 1) {
      throw new Error('Structured grid columns and rows must be positive safe integers')
    }
    const vertexCount = (options.columns + 1) * (options.rows + 1)
    if (!Number.isSafeInteger(vertexCount) || vertexCount > StructuredGridMesh2DGenerator.maxVertexCount) {
      throw new Error(`Structured grid exceeds the ${StructuredGridMesh2DGenerator.maxVertexCount.toLocaleString('en-US')} vertex budget`)
    }
    if (options.diagonal !== undefined && options.diagonal !== 'topLeftToBottomRight' && options.diagonal !== 'topRightToBottomLeft') {
      throw new Error(`Unsupported structured grid diagonal: ${String(options.diagonal)}`)
    }
  }
}
