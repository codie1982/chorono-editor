import { hashMeshDeformationBakeGeometry, type MeshDeformationBakeRecipe } from '@/lib/bake'
import { setMesh2DDeformation } from '@/lib/mesh2d'
import type { Asset, ChronoScene, Layer } from '@/lib/types'
import type { Mesh2DDeformationBinding } from '@/lib/types/mesh2d'
import type { EditorCommand } from './commands-keyframe'

/** Returns whether the live rest geometry still matches a prepared bake source. */
export function isMeshDeformationBakeSourceCurrent(recipe: MeshDeformationBakeRecipe, layer: Layer | undefined): boolean {
  return layer?.id === recipe.layerId
    && layer.type === 'mesh2d'
    && !!layer.mesh2d
    && layer.mesh2d.geometry.topology.topologyHash === recipe.topologyHash
    && layer.mesh2d.geometry.topology.vertexIds.length === recipe.vertexCount
    && hashMeshDeformationBakeGeometry(layer.mesh2d.geometry) === recipe.source.revision
}

/**
 * Adds one generated binary asset and binds it to its compatible Mesh2D layer.
 *
 * The command rechecks rest geometry atomically, preserves unrelated live layer
 * edits, rejects asset-id collisions, and owns exactly one undo step. Blob URL
 * lifetime is supplied by the caller/editor source owner, not this command.
 */
export function makeApplyMeshDeformationBakeCmd(input: {
  readonly recipe: MeshDeformationBakeRecipe
  readonly asset: Asset
  readonly playback?: Partial<Omit<Mesh2DDeformationBinding, 'schemaVersion' | 'assetId'>>
}): EditorCommand {
  const { recipe, asset, playback } = input
  if (asset.type !== 'meshDeformation') throw new TypeError('Mesh deformation bake requires a meshDeformation asset')
  let beforeLayer: Layer | undefined
  return {
    label: `Bake Mesh2D Deformation (${recipe.sampleTimesMs.length} samples)`,
    execute(scene: ChronoScene): ChronoScene {
      const current = scene.layers.find(layer => layer.id === recipe.layerId)
      if (!isMeshDeformationBakeSourceCurrent(recipe, current)) {
        throw new Error('Mesh2D geometry changed. Prepare a new deformation bake preview.')
      }
      if (scene.assets.some(candidate => candidate.id === asset.id)) {
        throw new Error(`Mesh deformation asset id already exists: ${asset.id}`)
      }
      beforeLayer = current
      const nextLayer = setMesh2DDeformation(current!, asset.id, playback)
      return {
        ...scene,
        assets: [...scene.assets, asset],
        layers: scene.layers.map(layer => layer.id === recipe.layerId ? nextLayer : layer),
      }
    },
    undo(scene: ChronoScene): ChronoScene {
      return {
        ...scene,
        assets: scene.assets.filter(candidate => candidate.id !== asset.id),
        layers: beforeLayer
          ? scene.layers.map(layer => layer.id === recipe.layerId ? beforeLayer! : layer)
          : scene.layers,
      }
    },
  }
}
