import { describe, expect, it } from 'vitest'
import { newStructuredGridMesh2DLayer } from '../../../registry/definitions/mesh2d/Mesh2DDefinition'
import { Matrix2D } from '../../Matrix2D'
import { MeshComponentSelection } from './MeshComponentSelection'
describe('Mesh Point / Edge component selection', () => {
  it('picks evaluated world vertices and edges under a nonuniform rotated frame', () => {
    const geometry = newStructuredGridMesh2DLayer().mesh2d!.geometry, saved = structuredClone(geometry)
    const model = new MeshComponentSelection(geometry, Matrix2D.translation(100, 70).rotate(31).scale(1.7, .8))
    const point = model.points[0], edge = model.edges[0], a = model.points[edge.a], b = model.points[edge.b]
    expect(model.pick('point', point, 2)).toBe(point.id)
    expect(model.pick('edge', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, 1)).toBe(edge.id)
    const ids = model.vertices('edge', model.edges.slice(0, 2).map(edge => edge.id))
    expect(new Set(ids).size).toBe(ids.length)
    expect(model.query('point', { kind: 'circle', cx: point.x, cy: point.y, r: 2 }, 'inside')).toEqual(new Set([point.id]))
    expect(geometry).toEqual(saved)
  })
})
