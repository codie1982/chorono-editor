import { assetSourcePool, type AssetSourceLease, type AssetSourcePool } from '@/lib/asset/sources'
import type { Asset } from '@/lib/types'
import type { MeshDeformationBakePreview } from '../adapters/MeshDeformationBakeAdapter'

export const MESH_DEFORMATION_MIME = 'application/x-chorono-mesh-deformation'

export interface MeshDeformationBakeAssetResult {
  readonly asset: Asset
  /** Idempotent creator release; document adoption transfers it automatically. */
  release(): void
}

/**
 * Adopts one live bake preview into a portable Blob-backed asset descriptor.
 *
 * Blob URL creation is kept outside the numerical adapter. The caller must
 * synchronously dispatch the asset/layer command and then call `release` in a
 * finally block; editor history acquires its own lease before creator release.
 */
export function createMeshDeformationBakeAsset(
  preview: MeshDeformationBakePreview,
  input: { readonly assetId: string; readonly name: string },
  pool: Pick<AssetSourcePool, 'create'> = assetSourcePool,
): MeshDeformationBakeAssetResult {
  if (!input.assetId.trim() || !input.name.trim()) throw new Error('Mesh deformation bake asset requires an id and name')
  let source: (AssetSourceLease & { readonly url: string }) | undefined
  try {
    const blob = preview.withEncodedBytes(bytes => new Blob([bytes], { type: MESH_DEFORMATION_MIME }))
    source = pool.create(blob)
    const fileName = input.name.toLowerCase().endsWith('.chmd2d') ? input.name : `${input.name}.chmd2d`
    const report = preview.report
    const asset: Asset = {
      id: input.assetId,
      name: fileName,
      type: 'meshDeformation',
      url: source.url,
      storage: { mode: 'external', originalFileName: fileName },
      metadata: {
        filesize: blob.size,
        tags: ['mesh2d', 'deformation', 'bake'],
        notes: `${report.vertexCount} vertices · ${report.sampleCount} samples · ${report.topologyHash} · recipe ${report.sourceRecipeHash}`,
      },
      runtime: { objectUrl: source.url },
    }
    let released = false
    return { asset, release: () => { if (!released) { released = true; source?.release() } } }
  } catch (error) {
    source?.release()
    throw error
  }
}
