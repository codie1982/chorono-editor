import { beforeAll, describe, expect, it } from 'vitest'
import { actionRegistry } from '@/lib/ai/ActionRegistry'
import { emptyScene, newRectLayer } from '@/lib/defaults'
import type { ChronoScene } from '@/lib/types'
import { bootstrapMCPActions } from '../actions'
import { getToolCatalog, validateToolCall } from '../catalog'

const sourceAccess = { expectedRevision: 0, readToken: 'a'.repeat(64) }

/** Execute one registered native action exactly as the MCP editor batch does. */
function execute(scene: ChronoScene, name: string, params: Record<string, unknown>): ChronoScene {
  const command = actionRegistry.get(name)?.toCommand?.(params, scene)
  if (!command) throw new Error(`Missing command for ${name}`)
  return command.execute(scene)
}

describe('Mesh2D MCP actions', () => {
  beforeAll(() => bootstrapMCPActions())

  it('publishes focused Mesh2D authoring workflows in the standard catalog', async () => {
    const names = (await getToolCatalog()).map(tool => tool.name)
    expect(names).toEqual(expect.arrayContaining([
      'create_mesh2d_from_source',
      'regenerate_mesh2d',
      'set_mesh2d_texture',
      'set_mesh2d_pins',
      'set_mesh2d_deformation',
    ]))
    await expect(validateToolCall('set_mesh2d_texture', {
      ...sourceAccess,
      layerId: 'mesh',
      textureAssetId: 'fabric',
      transform: { fit: 'cover', offsetX: 12, scaleX: 1.25 },
    })).resolves.toHaveProperty('name', 'set_mesh2d_texture')
  })

  it('creates, textures, pins and binds deformation through native undo commands', async () => {
    const source = { ...newRectLayer(), id: 'source-shape', name: 'Flag source' }
    let scene: ChronoScene = {
      ...emptyScene(),
      layers: [source],
      assets: [
        { id: 'fabric', name: 'Fabric', type: 'image', url: 'memory:fabric', width: 64, height: 64 },
        { id: 'motion', name: 'Motion', type: 'meshDeformation', url: 'memory:motion' },
      ],
    }

    scene = execute(scene, 'create_mesh2d_from_source', { sourceLayerId: source.id, flattenTolerance: 0.5 })
    const meshId = scene.layers.find(layer => layer.type === 'mesh2d')!.id
    scene = execute(scene, 'set_mesh2d_texture', {
      layerId: meshId,
      textureAssetId: 'fabric',
      sampling: 'nearest',
      transform: { fit: 'cover', offsetX: 8, rotationDeg: 15 },
    })
    scene = execute(scene, 'set_mesh2d_pins', { layerId: meshId, preset: 'corners' })
    scene = execute(scene, 'set_mesh2d_deformation', {
      layerId: meshId,
      assetId: 'motion',
      startTimeMs: 250,
      playbackRate: 0.5,
      loop: true,
    })

    const mesh = scene.layers.find(layer => layer.id === meshId)!
    expect(mesh.mesh2d?.source).toMatchObject({ kind: 'shapeBoundary', sourceLayerId: source.id })
    expect(mesh.mesh2d?.appearance).toMatchObject({
      kind: 'texture',
      textureAssetId: 'fabric',
      sampling: 'nearest',
      textureTransform: { fit: 'cover', offsetX: 8, rotationDeg: 15 },
    })
    expect(mesh.mesh2d?.pins?.vertexIds).toHaveLength(4)
    expect(mesh.mesh2d?.deformation).toMatchObject({ assetId: 'motion', startTimeMs: 250, playbackRate: 0.5, loop: true })
  })

  it('regenerates from the linked source and rejects incompatible assets', async () => {
    const source = { ...newRectLayer(), id: 'source-shape' }
    let scene: ChronoScene = {
      ...emptyScene(),
      layers: [source],
      assets: [{ id: 'audio', name: 'Audio', type: 'audio', url: 'memory:audio' }],
    }
    scene = execute(scene, 'create_mesh2d_from_source', { sourceLayerId: source.id })
    const mesh = scene.layers.find(layer => layer.type === 'mesh2d')!
    const changed = { ...source, size: { width: 240, height: 120 } }
    scene = { ...scene, layers: scene.layers.map(layer => layer.id === source.id ? changed : layer) }
    const regenerated = execute(scene, 'regenerate_mesh2d', { layerId: mesh.id })
    expect(regenerated.layers.find(layer => layer.id === mesh.id)?.size).toEqual({ width: 240, height: 120 })
    expect(() => execute(regenerated, 'set_mesh2d_texture', { layerId: mesh.id, textureAssetId: 'audio' }))
      .toThrow(/image or spriteSheet/)
    expect(() => execute(regenerated, 'set_mesh2d_pins', { layerId: mesh.id, preset: 'corners', vertexIds: [] }))
      .toThrow(/exactly one/)
  })
})
