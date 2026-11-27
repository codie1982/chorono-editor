import { describe, expect, it } from 'vitest'
import { newStructuredGridMesh2DLayer } from '@/lib/registry/definitions/mesh2d/Mesh2DDefinition'
import { ResourceBudget } from '@/lib/resources/budget'
import { MeshDeformationBinaryCodec } from '@/lib/mesh2d'
import { BakeService } from '../BakeService'
import {
  MeshDeformationBakeAdapter,
  createMeshDeformationBakeRecipe,
} from '../adapters/MeshDeformationBakeAdapter'

function fixture() {
  const layer = newStructuredGridMesh2DLayer(), geometry = layer.mesh2d!.geometry
  const sampleTimesMs = [0, 500, 1000]
  const positions = Float32Array.from(sampleTimesMs.flatMap((_time, sample) => geometry.positions.map((value, index) => (
    index % 2 ? value + sample * 12 * Math.sin((index / 2) * .4) : value
  ))))
  const recipe = createMeshDeformationBakeRecipe({
    layerId: layer.id,
    geometry,
    componentCount: 2,
    sampleTimesMs,
    solverVersion: 'fixture-solver-1',
    sourceVersion: 'pins:none|gravity:0',
  })
  return { layer, geometry, positions, recipe }
}

describe('MeshDeformationBakeAdapter', () => {
  it('prepares a budgeted CHMD2D01 preview and releases it with the job', async () => {
    const { geometry, positions, recipe } = fixture()
    const budget = new ResourceBudget({ maxBytes: 4 * 1024 ** 2 })
    const adapter = new MeshDeformationBakeAdapter(geometry, positions, { allocator: budget })
    const service = new BakeService()
    const job = service.createJob({
      kind: adapter.kind,
      label: 'Mesh deformation fixture',
      source: recipe.source,
      isSourceCurrent: () => true,
      prepare: context => adapter.prepare(recipe, context),
      discardPreview: preview => preview.release(),
    })
    await job.start()
    const preview = job.getSnapshot().preview!
    expect(job.getSnapshot().status).toBe('preview-ready')
    expect(preview.report).toMatchObject({
      vertexCount: geometry.topology.vertexIds.length,
      sampleCount: 3,
      durationMs: 1000,
      topologyHash: geometry.topology.topologyHash,
      codec: 'CHMD2D01',
    })
    const decoded = preview.withEncodedBytes(bytes => new MeshDeformationBinaryCodec().decode(bytes.slice(0)))
    expect(decoded.sourceRecipeHash).toBe(recipe.sourceRecipeHash)
    expect(decoded.samplePositions(1000)).toEqual(positions.slice(positions.length - geometry.positions.length))
    expect(budget.getSnapshot().chargedBytes).toBe(preview.report.payloadBytes + preview.report.encodedBytes)
    job.dispose()
    expect(budget.getSnapshot().chargedBytes).toBe(0)
    expect(() => preview.withEncodedBytes(() => undefined)).toThrow(/released/)
    service.dispose()
  })

  it('rejects cancellation, stale geometry, oversized payload and invalid samples without leaked budget', () => {
    const { geometry, positions, recipe } = fixture()
    const budget = new ResourceBudget({ maxBytes: 4 * 1024 ** 2 })
    const cancelled = new AbortController(); cancelled.abort()
    const context = { signal: cancelled.signal, reportProgress: () => {} }
    expect(() => new MeshDeformationBakeAdapter(geometry, positions, { allocator: budget }).prepare(recipe, context)).toThrow(/cancel/i)
    expect(budget.getSnapshot().entries).toBe(0)

    const changed = { ...geometry, positions: geometry.positions.map((value, index) => index ? value : value + 1) }
    expect(() => new MeshDeformationBakeAdapter(changed, positions, { allocator: budget }).prepare(recipe, {
      signal: new AbortController().signal, reportProgress: () => {},
    })).toThrow(/stale/)
    expect(() => new MeshDeformationBakeAdapter(geometry, positions, { allocator: budget, maxPayloadBytes: 16 }).prepare(recipe, {
      signal: new AbortController().signal, reportProgress: () => {},
    })).toThrow(/exceeds 16/)
    const invalid = positions.slice(); invalid[5] = NaN
    expect(() => new MeshDeformationBakeAdapter(geometry, invalid, { allocator: budget }).prepare(recipe, {
      signal: new AbortController().signal, reportProgress: () => {},
    })).toThrow(/finite/)
    expect(budget.getSnapshot().chargedBytes).toBe(0)
  })
})
