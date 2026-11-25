import { describe, expect, it } from 'vitest'
import type { FractureRegionFragmentGeometry } from '@/lib/types/fracture'
import { FractureFragmentAdjacencyBuilder } from '../FractureFragmentAdjacencyBuilder'

describe('FractureFragmentAdjacencyBuilder', () => {
  it('measures subdivided collinear overlap and ignores point contact', () => {
    const fragments = [
      fragment('left', [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]]),
      fragment('right', [[{ x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 5 }]]),
      fragment('corner', [[{ x: 20, y: 10 }, { x: 25, y: 10 }, { x: 25, y: 15 }]]),
    ]
    const adjacency = new FractureFragmentAdjacencyBuilder().build(fragments)

    expect(adjacency).toEqual([{ fragmentAId: 'left', fragmentBId: 'right', sharedLengthPx: 10 }])
  })
})

function fragment(id: string, rings: { x: number; y: number }[][]): FractureRegionFragmentGeometry {
  return {
    id,
    seedId: `${id}-seed`,
    cellIndex: 0,
    componentIndex: 0,
    containsSeed: true,
    geometry: {
      positions: [0, 0, 1, 0, 0, 1],
      uvs: [0, 0, 1, 0, 0, 1],
      topology: { schemaVersion: 1, vertexIds: ['a', 'b', 'c'], triangleIndices: [0, 1, 2], topologyHash: 'test' },
    },
    colliderParts: [],
    boundaryRings: rings.map(points => ({
      points, signedDoubleArea: 1, parentIndex: null, depth: 0, role: 'outer',
    })),
    centroidPx: { x: 0, y: 0 },
    areaPx2: 1,
    boundsPx: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
  }
}
