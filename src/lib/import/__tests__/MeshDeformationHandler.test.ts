import { describe, expect, it } from 'vitest'
import { MeshDeformationBinaryCodec, MeshDeformationClip } from '@/lib/mesh2d'
import { ResourceBudget } from '@/lib/resources/budget'
import { BoundedBinaryReader } from '@/lib/resources/io'
import { MeshDeformationHandler } from '../handlers/asset/MeshDeformationHandler'
import { releaseImportSources } from '../resources/importSources'

function fixture(): File {
  const clip = new MeshDeformationClip({
    topologyHash: 'qa-topology', vertexCount: 3, componentCount: 2,
    sampleTimesMs: Float64Array.from([0, 500]),
    positions: Float32Array.from([0, 0, 10, 0, 0, 10, 20, 10, 30, 10, 20, 20]),
  })
  return new File([new MeshDeformationBinaryCodec().encode(clip)], 'qa.chmd2d', {
    type: 'application/x-chorono-mesh-deformation',
  })
}

function handler(maxBytes = 4096): MeshDeformationHandler {
  const budget = new ResourceBudget({ maxBytes, maxEntries: 16 })
  return new MeshDeformationHandler(new BoundedBinaryReader({ maxBytes, budget }), budget)
}

describe('MeshDeformationHandler', () => {
  it('validates metadata and imports one asset without creating a layer', async () => {
    const source = fixture()
    const preflight = await handler().preflight(source)
    expect(preflight.summary.detectedFeatures).toContain('3 vertices')
    expect(preflight.summary.detectedFeatures).toContain('2 samples')

    const result = await handler().handle(source)
    expect(result.assets).toHaveLength(1)
    expect(result.assets[0]).toMatchObject({ type: 'meshDeformation', name: 'qa.chmd2d' })
    expect(result.layers).toHaveLength(0)
    expect(result.report.created).toMatchObject({ assets: 1, layers: 0 })
    releaseImportSources(result)
  })

  it('rejects malformed and over-budget clips without a successful import', async () => {
    await expect(handler().handle(new File(['CHMD2D01broken'], 'bad.chmd2d'))).rejects.toThrow()
    await expect(handler(16).handle(fixture())).rejects.toThrow(/budget|limit|exceeds/i)
  })
})
