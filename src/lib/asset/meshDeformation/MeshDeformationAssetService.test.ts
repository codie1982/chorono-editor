import { afterEach, describe, expect, it } from 'vitest'
import { MeshDeformationBinaryCodec, MeshDeformationClip } from '@/lib/mesh2d'
import { MeshDeformationAssetService } from './MeshDeformationAssetService'

const services: MeshDeformationAssetService[] = []
afterEach(() => services.splice(0).forEach(service => service.dispose()))

function encoded(): ArrayBuffer {
  return new MeshDeformationBinaryCodec().encode(new MeshDeformationClip({
    topologyHash: 'fixture', vertexCount: 1, componentCount: 2,
    sampleTimesMs: Float64Array.from([0, 100]),
    positions: Float32Array.from([0, 0, 10, 20]),
  }))
}

describe('MeshDeformationAssetService', () => {
  it('loads, decodes and pins a bounded binary clip', async () => {
    let requests = 0
    const bytes = encoded()
    const service = new MeshDeformationAssetService({
      maxBytes: 1024 * 1024,
      maxIdleMs: 0,
      fetcher: async () => { requests++; return new Response(bytes.slice(0)) },
    })
    services.push(service)
    const asset = { id: 'clip', name: 'Clip', type: 'meshDeformation' as const, url: 'memory:clip' }
    const first = await service.acquire(asset)
    expect(Array.from(first.value.samplePositions(50))).toEqual([5, 10])
    const second = await service.acquire(asset)
    expect(requests).toBe(1)
    second.release(); first.release()
  })

  it('rejects non-deformation assets before transport', async () => {
    const service = new MeshDeformationAssetService({ maxBytes: 1024, fetcher: async () => new Response() })
    services.push(service)
    await expect(service.acquire({ id: 'image', name: 'Image', type: 'image', url: 'memory:image' })).rejects.toThrow('meshDeformation')
  })
})
