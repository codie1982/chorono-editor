import type { Mesh2DTopology } from '@/lib/types/mesh2d'

/** An undirected topology edge with the triangles that reference it. */
export interface Mesh2DEdgeAdjacency {
  readonly vertices: readonly [number, number]
  readonly triangleIndices: readonly number[]
}

/** Derived connectivity used by validation, solvers and selection adapters. */
export interface Mesh2DAdjacency {
  readonly edges: readonly Mesh2DEdgeAdjacency[]
  readonly vertexNeighbors: readonly (readonly number[])[]
  readonly triangleNeighbors: readonly (readonly number[])[]
  readonly boundaryEdges: readonly Mesh2DEdgeAdjacency[]
}

/**
 * Derives undirected edge, vertex and triangle adjacency from triangle indices.
 *
 * Inputs must already contain integer, in-range indices. This class does not
 * repair invalid topology; callers that accept untrusted/imported data should
 * run `Mesh2DTopologyValidator` first. Output ordering is deterministic: edges
 * are sorted by their lower then upper vertex index, and neighbor arrays are
 * numerically sorted. The builder is stateless and retains no input buffers.
 */
export class Mesh2DAdjacencyBuilder {
  build(topology: Pick<Mesh2DTopology, 'vertexIds' | 'triangleIndices'>): Mesh2DAdjacency {
    const triangleCount = topology.triangleIndices.length / 3
    const edgeMap = new Map<string, { vertices: [number, number]; triangles: number[] }>()
    const vertexNeighbors = Array.from({ length: topology.vertexIds.length }, () => new Set<number>())
    const triangleNeighbors = Array.from({ length: triangleCount }, () => new Set<number>())

    for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex++) {
      const offset = triangleIndex * 3
      const vertices = [
        topology.triangleIndices[offset],
        topology.triangleIndices[offset + 1],
        topology.triangleIndices[offset + 2],
      ] as const
      this.addEdge(vertices[0], vertices[1], triangleIndex, edgeMap, vertexNeighbors)
      this.addEdge(vertices[1], vertices[2], triangleIndex, edgeMap, vertexNeighbors)
      this.addEdge(vertices[2], vertices[0], triangleIndex, edgeMap, vertexNeighbors)
    }

    const edges = Array.from(edgeMap.values())
      .sort((a, b) => a.vertices[0] - b.vertices[0] || a.vertices[1] - b.vertices[1])
      .map(edge => ({ vertices: edge.vertices, triangleIndices: [...edge.triangles].sort((a, b) => a - b) }))

    for (const edge of edges) {
      for (let left = 0; left < edge.triangleIndices.length; left++) {
        for (let right = left + 1; right < edge.triangleIndices.length; right++) {
          const a = edge.triangleIndices[left]
          const b = edge.triangleIndices[right]
          triangleNeighbors[a].add(b)
          triangleNeighbors[b].add(a)
        }
      }
    }

    return {
      edges,
      vertexNeighbors: vertexNeighbors.map(set => Array.from(set).sort((a, b) => a - b)),
      triangleNeighbors: triangleNeighbors.map(set => Array.from(set).sort((a, b) => a - b)),
      boundaryEdges: edges.filter(edge => edge.triangleIndices.length === 1),
    }
  }

  private addEdge(
    first: number,
    second: number,
    triangleIndex: number,
    edgeMap: Map<string, { vertices: [number, number]; triangles: number[] }>,
    vertexNeighbors: Set<number>[],
  ): void {
    const low = Math.min(first, second)
    const high = Math.max(first, second)
    const key = `${low}:${high}`
    const edge = edgeMap.get(key)
    if (edge) edge.triangles.push(triangleIndex)
    else edgeMap.set(key, { vertices: [low, high], triangles: [triangleIndex] })
    vertexNeighbors[first]?.add(second)
    vertexNeighbors[second]?.add(first)
  }
}
