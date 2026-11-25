import type { Asset } from '@/lib/asset/types'
import { MeshDeformationBinaryCodec } from '@/lib/mesh2d'
import type { ResourceAllocator } from '@/lib/resources/budget'
import { editorResourceBudget } from '@/lib/resources/budget'
import { BoundedBinaryReader, type BinaryInputReader } from '@/lib/resources/io'
import { checkImportExecution, type ImportExecution } from '../../resources/ImportExecution'
import { withImportSource } from '../../resources/importSources'
import type { ImportFormat, ImportOptions, ImportPreflight, ImportProgress, ImportResult } from '../../types'
import { BaseImportHandler } from '../BaseHandler'

const FORMAT: ImportFormat = 'application/x-chorono-mesh-deformation'
interface ClipSummary {
  readonly topologyHash: string
  readonly vertexCount: number
  readonly componentCount: 2 | 3
  readonly sampleCount: number
  readonly byteLength: number
}

/**
 * Imports one validated CHMD2D01 clip as an asset without creating a layer.
 *
 * Binary input and the transient decoded copy are admitted before allocation.
 * The resulting Blob URL is owned by the normal import-source lifecycle and is
 * embedded by portable project saving. Dense samples remain outside scene JSON;
 * users bind the returned asset id to a compatible fixed-topology Mesh2D layer.
 */
export class MeshDeformationHandler extends BaseImportHandler {
  readonly kind = 'asset' as const
  readonly supportedFormats: ImportFormat[] = [FORMAT]
  private readonly codec = new MeshDeformationBinaryCodec()

  constructor(
    private readonly reader: BinaryInputReader = new BoundedBinaryReader({
      budget: editorResourceBudget,
      maxBytes: 64 * 1024 ** 2,
    }),
    private readonly budget: ResourceAllocator = editorResourceBudget,
  ) { super() }

  /** Reads and validates the complete binary clip; no native/source handle escapes. */
  async preflight(file: File, _options?: ImportOptions, execution?: ImportExecution): Promise<ImportPreflight> {
    const clip = await this.inspect(file, execution)
    return {
      source: this.makeSource(file), format: FORMAT, kind: 'asset',
      summary: {
        estimatedLayers: 0, estimatedAssets: 1, estimatedGroups: 0, estimatedTracks: 0,
        estimatedMemoryBytes: clip.byteLength,
        detectedFeatures: [
          `${clip.vertexCount} vertices`, `${clip.sampleCount} samples`,
          `${clip.componentCount} components`, `topology ${clip.topologyHash}`,
        ],
        unsupportedFeatures: [],
      },
      availableOptions: { collection: true }, defaultOptions: {}, warnings: [],
    }
  }

  /** Publishes one portable asset only after complete codec validation. */
  async handle(
    file: File,
    _options?: ImportOptions,
    onProgress?: (progress: ImportProgress) => void,
    execution?: ImportExecution,
  ): Promise<ImportResult> {
    const startedAt = Date.now()
    this.reportProgress(onProgress, 'reading', 'Reading deformation clip…', 0.1)
    const clip = await this.inspect(file, execution)
    checkImportExecution(execution)
    return withImportSource(file, (url): ImportResult => {
      const asset: Asset = {
        id: this.generateAssetId(), name: file.name, type: 'meshDeformation', url,
        storage: { mode: 'external', originalFileName: file.name },
        metadata: {
          filesize: file.size, importedAt: Date.now(), tags: ['mesh2d', 'deformation'],
          notes: `${clip.vertexCount} vertices · ${clip.sampleCount} samples · ${clip.topologyHash}`,
        },
        runtime: { objectUrl: url },
      }
      this.reportProgress(onProgress, 'complete', 'Done', 1)
      checkImportExecution(execution)
      return {
        id: this.generateId(), source: this.makeSource(file), format: FORMAT, kind: 'asset',
        assets: [asset], layers: [], groups: [], tracks: [], timelines: [], commands: [],
        warnings: [], errors: [], unsupportedFeatures: [],
        report: {
          title: 'Mesh2D Deformation Import', sourceFileName: file.name, format: FORMAT,
          created: { assets: 1, layers: 0, groups: 0, tracks: 0, compositions: 0 },
          warnings: [], errors: [], unsupportedFeatures: [], suggestions: [
            'Bind this clip to a Mesh2D layer with the same topology hash and vertex count.',
          ], durationMs: Date.now() - startedAt,
        },
      }
    })
  }

  private async inspect(file: File, execution?: ImportExecution): Promise<ClipSummary> {
    checkImportExecution(execution)
    const input = await this.reader.readResponse(new Response(file), { signal: execution?.signal })
    const reservation = this.budget.reserve('derived', Math.max(1, input.byteLength))
    if (!reservation) {
      input.release()
      throw new RangeError('Mesh deformation decode exceeds the managed resource budget')
    }
    try {
      const clip = this.codec.decode(input.buffer)
      reservation.commit()
      checkImportExecution(execution)
      return {
        topologyHash: clip.topologyHash,
        vertexCount: clip.vertexCount,
        componentCount: clip.componentCount,
        sampleCount: clip.sampleCount,
        byteLength: clip.byteLength,
      }
    } finally {
      reservation.release()
      input.release()
    }
  }
}
