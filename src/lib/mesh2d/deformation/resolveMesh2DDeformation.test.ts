import { describe, expect, it } from 'vitest'
import { newStructuredGridMesh2DLayer } from '@/lib/registry/definitions/mesh2d/Mesh2DDefinition'
import { setMesh2DDeformation } from '@/lib/mesh2d/Mesh2DAuthoring'
import { MeshDeformationClip } from './MeshDeformationClip'
import { resolveMesh2DDeformation } from './resolveMesh2DDeformation'

function clipForLayer(layer: ReturnType<typeof newStructuredGridMesh2DLayer>, hash = layer.mesh2d!.geometry.topology.topologyHash) {
  const positions = Float32Array.from([
    ...layer.mesh2d!.geometry.positions,
    ...layer.mesh2d!.geometry.positions.map((value, index) => value + (index % 2 ? 20 : 0)),
  ])
  return new MeshDeformationClip({
    topologyHash: hash,
    vertexCount: layer.mesh2d!.geometry.topology.vertexIds.length,
    componentCount: 2,
    sampleTimesMs: Float64Array.from([0, 100]),
    positions,
  })
}

describe('resolveMesh2DDeformation', () => {
  it('maps composition time through start/rate and samples matching topology', () => {
    const source = newStructuredGridMesh2DLayer()
    const layer = setMesh2DDeformation(source, 'clip', { startTimeMs: 100, playbackRate: 2 })
    const result = resolveMesh2DDeformation(layer, clipForLayer(source), 125)
    expect(result.status).toBe('playing')
    expect(result.positions?.[1]).toBe(10)
  })

  it('returns explicit rest fallbacks for missing and stale clips', () => {
    const source = newStructuredGridMesh2DLayer()
    const layer = setMesh2DDeformation(source, 'clip')
    expect(resolveMesh2DDeformation(layer, undefined, 0).status).toBe('clipMissing')
    expect(resolveMesh2DDeformation(layer, clipForLayer(source, 'stale'), 0).status).toBe('topologyMismatch')
  })
})
