import { Mesh2DTopologyHasher, Mesh2DTopologyValidator } from '@/lib/geometry/mesh2d'
import { canonicalJson, hashCanonicalRecords } from '@/lib/hash/CanonicalRecordHash'
import { DEFAULT_MESH2D_TEXTURE_TRANSFORM } from '@/lib/mesh2d/Mesh2DTextureMapping'
import { pathFromPoints, type ChronoScene, type Layer } from '@/lib/types'
import type {
  FractureAppearanceSnapshot,
  FractureGeneration,
  FragmentGeometry,
} from '@/lib/types/fracture'
import type { Mesh2DData, Mesh2DTextureFit, Mesh2DTopology } from '@/lib/types/mesh2d'

export type FractureFragmentAppearance = Pick<Layer, 'type' | 'path' | 'mesh2d' | 'style'>

/**
 * Converts one supported rectangle source appearance into bake-owned fragments.
 *
 * Solid shapes remain editable path layers. Image layers become fixed-topology
 * Mesh2D fragments that reuse the existing texture renderer and keep normalized
 * UVs in the complete source-rectangle space. The compiler stores no decoded
 * media or mutable state; asset dimensions come from portable scene metadata.
 * Unsupported effects and missing metadata fail before simulation starts so a
 * bake cannot silently lose appearance.
 */
export class FractureAppearanceCompiler {
  constructor(
    private readonly topologyHasher = new Mesh2DTopologyHasher(),
    private readonly topologyValidator = new Mesh2DTopologyValidator(),
  ) {}

  /** Validate and capture the supported source appearance without mutation. */
  snapshot(scene: Pick<ChronoScene, 'assets'>, source: Layer): FractureAppearanceSnapshot {
    this.assertCommonSource(source)
    if (source.type === 'shape') {
      if ((source.shapeKind ?? source.shape ?? 'rect') !== 'rect' || !source.size
        || (source.style?.cornerRadius ?? 0) !== 0 || source.style?.fill?.type !== 'solid') {
        throw new Error('Fracture shape source must be a sharp rectangle with a solid fill.')
      }
      return Object.freeze({
        schemaVersion: 1,
        kind: 'solid',
        sourceLayerId: source.id,
        contentHash: hashCanonicalRecords('fracture-solid-appearance-v1', [canonicalJson({
          style: source.style,
          blendMode: source.blendMode ?? 'source-over',
          opacity: source.opacity,
        })]),
      })
    }
    if (source.type === 'image' && source.image && source.size) {
      const asset = scene.assets.find(candidate => candidate.id === source.image!.assetId)
      if (!asset) throw new Error('Fracture image asset is missing. Relink or import the image before Preview.')
      if (asset.type !== 'image') throw new Error('Fracture image source must reference a decoded image asset.')
      if (!Number.isFinite(asset.width) || !Number.isFinite(asset.height)
        || !asset.width || asset.width <= 0 || !asset.height || asset.height <= 0) {
        throw new Error('Fracture image asset needs positive persisted width and height metadata.')
      }
      const objectFit = source.image.objectFit ?? 'contain'
      if (!['fill', 'contain', 'cover', 'none'].includes(objectFit)) {
        throw new Error(`Unsupported fracture image fit: ${String(objectFit)}`)
      }
      return Object.freeze({
        schemaVersion: 1,
        kind: 'image',
        sourceLayerId: source.id,
        contentHash: hashCanonicalRecords('fracture-image-appearance-v1', [canonicalJson({
          image: source.image,
          size: source.size,
          asset: { id: asset.id, type: asset.type, width: asset.width, height: asset.height },
          blendMode: source.blendMode ?? 'source-over',
          opacity: source.opacity,
        })]),
        assetId: asset.id,
        assetWidth: asset.width,
        assetHeight: asset.height,
        objectFit,
      })
    }
    throw new Error('Fracture source must be a supported rectangle shape or image layer.')
  }

  /**
   * Build portable appearance fields for one generated fragment.
   *
   * The supplied snapshot must still match the scene; a mismatch is treated as
   * stale preparation. Returned objects are detached from the source layer.
   */
  createFragmentAppearance(
    scene: Pick<ChronoScene, 'assets'>,
    source: Layer,
    generation: FractureGeneration,
    fragment: FragmentGeometry,
    snapshot: FractureAppearanceSnapshot,
  ): FractureFragmentAppearance {
    const current = this.snapshot(scene, source)
    if (current.kind !== snapshot.kind || current.sourceLayerId !== snapshot.sourceLayerId
      || current.contentHash !== snapshot.contentHash) {
      throw new Error('Fracture source appearance changed. Prepare a new bake preview.')
    }
    if (snapshot.kind === 'solid') {
      return {
        type: 'path',
        path: pathFromPoints(fragment.polygon.map(point => [point.x, point.y])),
        style: source.style ? structuredClone(source.style) : undefined,
      }
    }
    if (!source.size) throw new Error('Fracture image source size is missing.')
    return {
      type: 'mesh2d',
      mesh2d: this.createImageFragmentMesh(source, generation, fragment, snapshot),
    }
  }

  private createImageFragmentMesh(
    source: Layer,
    generation: FractureGeneration,
    fragment: FragmentGeometry,
    snapshot: Extract<FractureAppearanceSnapshot, { kind: 'image' }>,
  ): Mesh2DData {
    const width = source.size!.width
    const height = source.size!.height
    const vertexIds = fragment.polygon.map((_, index) => `${fragment.id}-vertex-${index}`)
    const triangleIndices: number[] = []
    for (let index = 1; index < fragment.polygon.length - 1; index++) {
      triangleIndices.push(0, index, index + 1)
    }
    const topologyWithoutHash: Omit<Mesh2DTopology, 'topologyHash'> = {
      schemaVersion: 1,
      vertexIds,
      triangleIndices,
    }
    const topology: Mesh2DTopology = {
      ...topologyWithoutHash,
      topologyHash: this.topologyHasher.hash(topologyWithoutHash),
    }
    const mesh: Mesh2DData = {
      schemaVersion: 1,
      source: {
        kind: 'fractureFragment',
        sourceLayerId: source.id,
        generationId: generation.generationId,
        fragmentId: fragment.id,
        sourceAppearanceHash: snapshot.contentHash,
        generatorVersion: 1,
      },
      geometry: {
        positions: fragment.polygon.flatMap(point => [point.x, point.y]),
        uvs: fragment.polygon.flatMap(point => [point.x / width, point.y / height]),
        topology,
        textureReferenceBounds: { x: 0, y: 0, width, height },
      },
      appearance: {
        schemaVersion: 1,
        kind: 'texture',
        textureAssetId: snapshot.assetId,
        sampling: 'linear',
        textureTransform: {
          ...DEFAULT_MESH2D_TEXTURE_TRANSFORM,
          fit: imageFitToMeshFit(snapshot.objectFit),
        },
      },
    }
    const validation = this.topologyValidator.validate(mesh.geometry)
    if (!validation.valid) {
      throw new Error(`Fracture fragment generated invalid Mesh2D topology: ${validation.diagnostics.map(item => item.code).join(', ')}`)
    }
    return mesh
  }

  private assertCommonSource(source: Layer): void {
    if (source.opacity !== 1) throw new Error('Fracture source must be fully opaque.')
    const hasLegacyEffects = !!source.effects && Object.values(source.effects).some(value => value !== undefined)
    const hasPluginEffects = source.effectsChain?.some(effect => effect.enabled) ?? false
    if (hasLegacyEffects || hasPluginEffects || source.masks?.length || source.motionBlur?.enabled) {
      throw new Error('Fracture source effects, masks and motion blur must be baked or removed before Preview.')
    }
  }
}

function imageFitToMeshFit(fit: Extract<FractureAppearanceSnapshot, { kind: 'image' }>['objectFit']): Mesh2DTextureFit {
  if (fit === 'fill') return 'stretch'
  if (fit === 'none') return 'original'
  return fit
}
