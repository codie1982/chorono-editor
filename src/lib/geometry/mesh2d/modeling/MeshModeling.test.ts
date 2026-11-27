import { describe, expect, it } from 'vitest'
import { incircle } from 'robust-predicates'
import { StructuredGridMesh2DGenerator } from '../StructuredGridMesh2DGenerator'
import { Mesh2DAdjacencyBuilder } from '../Mesh2DAdjacencyBuilder'
import { Mesh2DBoundaryRingExtractor } from '../Mesh2DBoundaryRingExtractor'
import { Mesh2DTopologyValidator } from '../Mesh2DTopologyValidator'
import { containsMesh2DPoint } from '../Mesh2DGeometryQueries'
import { SplineToMeshConverter } from '../../conversion/SplineToMeshConverter'
import { createDonutSpline } from '../../../spline/primitives/createDonutSpline'
import { createPolylineSpline } from '../../../spline/creation/createPolylineSpline'
import { mergeSplineData } from '../../../spline/factory/mergeSplineData'
import { translateSplineData } from '../../../spline/geometry/translateSplineData'
import { MeshSubdivision } from './subdivision/MeshSubdivision'
import { LaplacianMeshSmoother } from './LaplacianMeshSmoother'
import type { Mesh2DGeometry } from '../../../types/mesh2d'

const grid = (columns = 1, rows = 1) => new StructuredGridMesh2DGenerator().generate({ width: 100, height: 60, columns, rows }).geometry
const settings = { levels: 1, cellSizePx: 40 }
/** Actual signed material area, independent of the remeshing implementation. */
function area(g: Mesh2DGeometry) {
  let sum = 0; const p = g.positions, t = g.topology.triangleIndices
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * 2, b = t[i + 1] * 2, c = t[i + 2] * 2
    sum += ((p[b] - p[a]) * (p[c + 1] - p[a + 1]) - (p[b + 1] - p[a + 1]) * (p[c] - p[a])) / 2
  }
  return sum
}

describe('Mesh Subdivision strategies', () => {
  it('Delaunay increases detail, retains constraints/UVs and satisfies the local empty-circle criterion', () => {
    const source = grid(), before = structuredClone(source), result = new MeshSubdivision().subdivide(source, { ...settings, algorithm: 'delaunay' }, 'd')
    expect(result.topology.triangleIndices.length).toBeGreaterThan(source.topology.triangleIndices.length)
    expect(result.topology.quadIndices).toBeUndefined()
    expect(new Mesh2DTopologyValidator().validate(result).valid).toBe(true)
    expect(area(result)).toBeCloseTo(6000, 7)
    const p = result.positions, faces = result.topology.triangleIndices
    for (const edge of new Mesh2DAdjacencyBuilder().build(result.topology).edges) if (edge.triangleIndices.length === 2) {
      const face = edge.triangleIndices[0] * 3, [a, b, c] = faces.slice(face, face + 3)
      const d = faces.slice(edge.triangleIndices[1] * 3, edge.triangleIndices[1] * 3 + 3).find(id => !edge.vertices.includes(id))!
      expect(incircle(p[a * 2], p[a * 2 + 1], p[b * 2], p[b * 2 + 1], p[c * 2], p[c * 2 + 1], p[d * 2], p[d * 2 + 1])).toBeLessThanOrEqual(1e-6)
    }
    for (let i = 0; i < p.length / 2; i++) { expect(result.uvs[i * 2]).toBeCloseTo(p[i * 2] / 100, 9); expect(result.uvs[i * 2 + 1]).toBeCloseTo(p[i * 2 + 1] / 60, 9) }
    expect(source).toEqual(before)
    expect(new MeshSubdivision().subdivide(source, { ...settings, algorithm: 'delaunay' }, 'd')).toEqual(result)
  })
  it('Grid builds real square cells backed by matching renderer triangles, with predictable density', () => {
    const solver = new MeshSubdivision(), result = solver.subdivide(grid(), { ...settings, algorithm: 'grid' }, 'q')
    expect(result.topology.quadIndices).toHaveLength(15 * 4)
    expect(result.topology.triangleIndices).toHaveLength(30 * 3)
    const p = result.positions, q = result.topology.quadIndices!
    for (let i = 0; i < q.length; i += 4) for (let side = 0; side < 4; side++) {
      const a = q[i + side] * 2, b = q[i + (side + 1) % 4] * 2
      expect(Math.hypot(p[a] - p[b], p[a + 1] - p[b + 1])).toBeCloseTo(20)
    }
    expect(solver.subdivide(grid(), { ...settings, levels: 2, algorithm: 'grid' }, 'q').topology.quadIndices).toHaveLength(60 * 4)
    expect(area(result)).toBeCloseTo(6000, 7)
    expect(new Mesh2DBoundaryRingExtractor().extract(result)).toHaveLength(1)
  })
  it.each(['delaunay', 'grid'] as const)('%s preserves curved holes, concavities and disconnected islands without T-junction boundaries', algorithm => {
    const donut = createDonutSpline({ outerRadius: 50, innerRadius: 21 })
    const island = translateSplineData(createPolylineSpline([{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 30 }, { x: 0, y: 30 }], true), 100, 0)
    const source = new SplineToMeshConverter().convert('source', mergeSplineData(donut, island), .5).geometry
    const result = new MeshSubdivision().subdivide(source, { ...settings, algorithm }, 'hole')
    expect(area(result)).toBeCloseTo(area(source), 5)
    expect(containsMesh2DPoint(result, 0, 0)).toBe(false)
    expect(containsMesh2DPoint(result, 35, 0)).toBe(true)
    expect(containsMesh2DPoint(result, 105, 20)).toBe(true)
    expect(containsMesh2DPoint(result, 120, 20)).toBe(false)
    const rings = new Mesh2DBoundaryRingExtractor().extract(result)
    expect(rings.filter(ring => ring.role === 'hole')).toHaveLength(1)
    expect(rings.filter(ring => ring.role === 'outer')).toHaveLength(2)
  })
  it('refuses invalid/fractional settings and over-budget growth before publishing output', () => {
    const solver = new MeshSubdivision(), source = grid(), before = JSON.stringify(source)
    expect(() => solver.subdivide(source, { ...settings, algorithm: 'grid', levels: 1.5 }, 'x')).toThrow(/integer/)
    expect(() => solver.subdivide(source, { ...settings, algorithm: 'grid', levels: 4, cellSizePx: 1 }, 'x')).toThrow(/budget/)
    expect(() => solver.subdivide(source, { ...settings, algorithm: 'delaunay', levels: 4, cellSizePx: 1 }, 'x')).toThrow(/budget/)
    expect(JSON.stringify(source)).toBe(before)
  })
})

describe('Mesh Smooth', () => {
  it('uses simultaneous updates, preserves topology/UVs and can lock boundary vertices', () => {
    const source = grid(2, 2), positions = [...source.positions]; positions[8] += 7
    const input = { ...source, positions }, before = structuredClone(input)
    const result = new LaplacianMeshSmoother().smooth(input, { strength: .5, iterations: 1, preserveBoundary: true })
    expect(result.positions[8]).toBeCloseTo(53.5)
    expect(result.topology).toBe(input.topology)
    expect(result.uvs).toBe(input.uvs)
    const boundary = new Mesh2DAdjacencyBuilder().build(input.topology).boundaryEdges.flatMap(edge => edge.vertices)
    boundary.forEach(i => expect(result.positions.slice(i * 2, i * 2 + 2)).toEqual(input.positions.slice(i * 2, i * 2 + 2)))
    expect(input).toEqual(before)
  })
  it('rounds boundaries independently of grid diagonal and rejects collapses', () => {
    const input = grid(), smoother = new LaplacianMeshSmoother()
    const result = smoother.smooth(input, { strength: .25, iterations: 1, preserveBoundary: false })
    expect(result.positions.slice(0, 2)).toEqual([12.5, 7.5])
    expect(() => smoother.smooth(input, { strength: 1, iterations: 1, preserveBoundary: false })).toThrow(/fold or collapse/)
    expect(smoother.smooth(input, { strength: 0, iterations: 1, preserveBoundary: false })).toBe(input)
  })
})
