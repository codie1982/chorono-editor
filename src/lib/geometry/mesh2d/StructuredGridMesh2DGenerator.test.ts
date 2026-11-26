import { describe, expect, it } from 'vitest'
import { Mesh2DAdjacencyBuilder } from './Mesh2DAdjacencyBuilder'
import { Mesh2DTopologyValidator } from './Mesh2DTopologyValidator'
import { StructuredGridMesh2DGenerator } from './StructuredGridMesh2DGenerator'

describe('StructuredGridMesh2DGenerator', () => {
  const generator = new StructuredGridMesh2DGenerator()

  it('creates one quad as four vertices and two positively wound triangles', () => {
    const result = generator.generate({ width: 100, height: 50, columns: 1, rows: 1 })

    expect(result.source).toEqual({
      kind: 'structuredGrid', width: 100, height: 50, columns: 1, rows: 1,
      diagonal: 'topLeftToBottomRight', generatorVersion: 1,
    })
    expect(result.geometry.positions).toEqual([0, 0, 100, 0, 0, 50, 100, 50])
    expect(result.geometry.uvs).toEqual([0, 0, 1, 0, 0, 1, 1, 1])
    expect(result.geometry.topology.vertexIds).toEqual(['grid:0:0', 'grid:0:1', 'grid:1:0', 'grid:1:1'])
    expect(result.geometry.topology.triangleIndices).toEqual([0, 1, 3, 0, 3, 2])
    expect(result.geometry.topology.topologyHash).toMatch(/^[0-9a-f]{16}$/)
  })

  it('creates deterministic row-major topology for a two-by-two cell grid', () => {
    const result = generator.generate({ width: 20, height: 10, columns: 2, rows: 2 })

    expect(result.geometry.positions).toHaveLength(18)
    expect(result.geometry.topology.vertexIds).toHaveLength(9)
    expect(result.geometry.topology.triangleIndices).toHaveLength(24)
    expect(result.geometry.positions.slice(0, 6)).toEqual([0, 0, 10, 0, 20, 0])
    expect(result.geometry.topology.triangleIndices.slice(0, 12)).toEqual([
      0, 1, 4, 0, 4, 3,
      1, 2, 5, 1, 5, 4,
    ])
  })

  it('keeps topology identity when only dimensions change and changes it for connectivity', () => {
    const first = generator.generate({ width: 100, height: 50, columns: 2, rows: 2 })
    const resized = generator.generate({ width: 500, height: 300, columns: 2, rows: 2 })
    const flipped = generator.generate({
      width: 100, height: 50, columns: 2, rows: 2,
      diagonal: 'topRightToBottomLeft',
    })

    expect(resized.geometry.topology.topologyHash).toBe(first.geometry.topology.topologyHash)
    expect(flipped.geometry.topology.topologyHash).not.toBe(first.geometry.topology.topologyHash)
    expect(flipped.geometry.topology.triangleIndices.slice(0, 6)).toEqual([0, 1, 3, 1, 4, 3])
  })

  it.each([
    [{ width: 0, height: 10, columns: 1, rows: 1 }, /width and height/],
    [{ width: 10, height: Number.NaN, columns: 1, rows: 1 }, /width and height/],
    [{ width: 10, height: 10, columns: 0, rows: 1 }, /columns and rows/],
    [{ width: 10, height: 10, columns: 1.5, rows: 1 }, /columns and rows/],
    [{ width: 10, height: 10, columns: 512, rows: 512 }, /vertex budget/],
  ])('rejects invalid or unbounded grid options', (options, error) => {
    expect(() => generator.generate(options)).toThrow(error)
  })
})

describe('Mesh2DAdjacencyBuilder', () => {
  it('derives sorted boundary, vertex and triangle adjacency', () => {
    const topology = new StructuredGridMesh2DGenerator()
      .generate({ width: 10, height: 10, columns: 1, rows: 1 }).geometry.topology
    const adjacency = new Mesh2DAdjacencyBuilder().build(topology)

    expect(adjacency.edges).toHaveLength(5)
    expect(adjacency.boundaryEdges).toHaveLength(4)
    expect(adjacency.vertexNeighbors).toEqual([[1, 2, 3], [0, 3], [0, 3], [0, 1, 2]])
    expect(adjacency.triangleNeighbors).toEqual([[1], [0]])
  })
})

describe('Mesh2DTopologyValidator', () => {
  const generator = new StructuredGridMesh2DGenerator()
  const validator = new Mesh2DTopologyValidator()

  it('accepts generated structured grids without diagnostics', () => {
    const geometry = generator.generate({ width: 40, height: 30, columns: 3, rows: 2 }).geometry
    expect(validator.validate(geometry)).toEqual({ valid: true, diagnostics: [], vertexCount: 12, triangleCount: 12 })
  })

  it('reports reversed and duplicate triangle connectivity', () => {
    const generated = generator.generate({ width: 10, height: 10, columns: 1, rows: 1 }).geometry
    const geometry = {
      ...generated,
      topology: {
        ...generated.topology,
        triangleIndices: [0, 3, 1, 1, 0, 3],
      },
    }
    const result = validator.validate(geometry)

    expect(result.valid).toBe(false)
    expect(result.diagnostics.map(item => item.code)).toEqual(expect.arrayContaining(['reversed-triangle', 'duplicate-triangle']))
  })

  it('reports invalid payload sizes and non-finite values without throwing', () => {
    const generated = generator.generate({ width: 10, height: 10, columns: 1, rows: 1 }).geometry
    const result = validator.validate({
      positions: [0, 0, 10, Number.NaN, 0],
      uvs: [0, 0],
      topology: { ...generated.topology, vertexIds: ['a', 'a'], triangleIndices: [0, 1, 9] },
    })

    expect(result.valid).toBe(false)
    expect(result.diagnostics.map(item => item.code)).toEqual(expect.arrayContaining([
      'position-count', 'uv-count', 'vertex-id-count', 'duplicate-vertex-id',
      'non-finite-position', 'invalid-triangle-index',
    ]))
  })

  it('reports a stale persisted topology hash', () => {
    const generated = generator.generate({ width: 10, height: 10, columns: 1, rows: 1 }).geometry
    const result = validator.validate({
      ...generated,
      topology: { ...generated.topology, topologyHash: 'stale' },
    })

    expect(result.valid).toBe(false)
    expect(result.diagnostics.map(item => item.code)).toContain('topology-hash-mismatch')
  })

  it('reports non-manifold edges and orphan vertices', () => {
    const result = validator.validate({
      positions: [0, 0, 10, 0, 0, 10, 5, 10, 10, 10, 20, 20],
      uvs: [0, 0, 1, 0, 0, 1, 0.5, 1, 1, 1, 2, 2],
      topology: {
        schemaVersion: 1,
        vertexIds: ['a', 'b', 'c', 'd', 'e', 'orphan'],
        triangleIndices: [0, 1, 2, 0, 1, 3, 0, 1, 4],
        topologyHash: 'fixture',
      },
    })

    expect(result.valid).toBe(false)
    expect(result.diagnostics.map(item => item.code)).toEqual(expect.arrayContaining(['non-manifold-edge', 'orphan-vertex']))
  })
})
