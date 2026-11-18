import { describe, expect, it, vi } from 'vitest'
import { emptyScene } from '@/lib/defaults'
import { makeApplyMeshDeformationBakeCmd } from '@/lib/editor/commands-mesh-deformation-bake'
import { MeshDeformationBinaryCodec, resolveMesh2DDeformation } from '@/lib/mesh2d'
import { newStructuredGridMesh2DLayer } from '@/lib/registry/definitions/mesh2d/Mesh2DDefinition'
import { ResourceBudget } from '@/lib/resources/budget'
import type { AssetSourcePool } from '@/lib/asset/sources'
import {
  MeshDeformationBakeAdapter,
  createMeshDeformationBakeRecipe,
} from '../adapters/MeshDeformationBakeAdapter'
import { createMeshDeformationBakeAsset } from '../meshDeformation/MeshDeformationBakeAsset'

function prepare() {
  const layer = newStructuredGridMesh2DLayer(), geometry = layer.mesh2d!.geometry
  const times = [0, 1000]
  const positions = Float32Array.from(times.flatMap((_time, sample) => geometry.positions.map((value, index) => (
    index % 2 ? value + sample * 20 : value + sample * 5
  ))))
  const recipe = createMeshDeformationBakeRecipe({
    layerId: layer.id, geometry, componentCount: 2, sampleTimesMs: times,
    solverVersion: 'fixture-1', sourceVersion: 'fixture-source-1',
  })
  const preview = new MeshDeformationBakeAdapter(geometry, positions, {
    allocator: new ResourceBudget({ maxBytes: 4 * 1024 ** 2 }),
  }).prepare(recipe, { signal: new AbortController().signal, reportProgress: () => {} })
  return { layer, geometry, positions, recipe, preview }
}

describe('Mesh deformation bake asset commit', () => {
  it('adds asset plus binding in one undo step and plays without a solver', async () => {
    const { layer, geometry, positions, recipe, preview } = prepare()
    let blob!: Blob
    const release = vi.fn()
    const pool: Pick<AssetSourcePool, 'create'> = {
      create: value => { blob = value; return { url: 'blob:mesh-bake', release } },
    }
    const prepared = createMeshDeformationBakeAsset(preview, { assetId: 'baked-flag', name: 'Baked Flag' }, pool)
    const edited = { ...layer, name: 'Human renamed mesh', transform: { ...layer.transform, x: 345 } }
    const scene = { ...emptyScene(), layers: [edited] }
    const command = makeApplyMeshDeformationBakeCmd({
      recipe,
      asset: prepared.asset,
      playback: { startTimeMs: 250, playbackRate: 1, loop: false },
    })
    const next = command.execute(scene)
    expect(next.assets).toEqual([prepared.asset])
    expect(next.layers[0]).toMatchObject({ name: 'Human renamed mesh', transform: { x: 345 },
      mesh2d: { deformation: { assetId: 'baked-flag', startTimeMs: 250, playbackRate: 1, loop: false } } })
    const decoded = new MeshDeformationBinaryCodec().decode(await blob.arrayBuffer())
    const resolution = resolveMesh2DDeformation(next.layers[0], decoded, 1250)
    expect(resolution.status).toBe('playing')
    expect(resolution.positions).toEqual(positions.slice(positions.length - geometry.positions.length))
    expect(command.undo(next)).toEqual(scene)
    prepared.release(); prepared.release(); expect(release).toHaveBeenCalledOnce()
    preview.release()
  })

  it('rejects stale rest positions and asset id collisions atomically', () => {
    const { layer, recipe, preview } = prepare()
    const pool: Pick<AssetSourcePool, 'create'> = { create: () => ({ url: 'blob:mesh-bake', release: () => {} }) }
    const prepared = createMeshDeformationBakeAsset(preview, { assetId: 'baked-flag', name: 'Baked Flag' }, pool)
    const command = makeApplyMeshDeformationBakeCmd({ recipe, asset: prepared.asset })
    const changed = { ...layer, mesh2d: { ...layer.mesh2d!, geometry: {
      ...layer.mesh2d!.geometry,
      positions: layer.mesh2d!.geometry.positions.map((value, index) => index ? value : value + 1),
    } } }
    expect(() => command.execute({ ...emptyScene(), layers: [changed] })).toThrow(/changed/)
    expect(() => command.execute({ ...emptyScene(), layers: [layer], assets: [prepared.asset] })).toThrow(/already exists/)
    prepared.release(); preview.release()
  })
})
