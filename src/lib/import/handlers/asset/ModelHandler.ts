import { withModelContent } from '../../../model3d/content/modelContent'
import { BaseImportHandler } from '../BaseHandler'
import type { ImportFormat, ImportOptions, ImportResult, ImportPreflight, ImportProgress } from '../../types'
import { checkImportExecution, type ImportExecution } from '../../resources/ImportExecution'
import { withImportSource } from '../../resources/importSources'
import { BoundedBinaryReader } from '../../../resources/io'
import { editorResourceBudget } from '../../../resources/budget'
import { MAX_MODEL_BYTES, readModelDocument } from '../../../model3d/source/readModelDocument'
import { modelAssetService } from '../../../model3d/resources/ModelAssetService'
import { newModelLayer } from '../../../model3d/source/modelDefaults'
import type { Asset } from '../../../types'

/** Single-source GLB/self-contained glTF import, using existing atomic import,
 * cancellation, source URL ownership and model residency. Companion-file glTF,
 * compressed codecs remain unsupported; native clips are chosen in the detail editor. */
export class ModelHandler extends BaseImportHandler {
  readonly kind = 'asset' as const
  readonly supportedFormats: ImportFormat[] = ['model/gltf-binary', 'model/gltf+json']
  private readonly reader = new BoundedBinaryReader({ maxBytes: MAX_MODEL_BYTES, budget: editorResourceBudget })
  /** Inspect bounded encoded bytes without native/GPU creation. Input leases
   * survive until metadata validation finishes and release on every failure. */
  private async inspect(file: File, execution?: ImportExecution) {
    checkImportExecution(execution)
    if (file.size > MAX_MODEL_BYTES) throw new Error('3D models must be at most 16 MiB.')
    const input = await this.reader.readResponse(new Response(file.stream()), execution)
    try { checkImportExecution(execution); const info = readModelDocument(input.buffer); return { estimatedBytes: info.estimatedBytes, warnings: info.warnings, emptyScene: info.json.scenes?.[info.json.scene ?? 0]?.extras?.choronoEmptyScene === true } } finally { input.release() }
  }
  /** Return workload/feature limits before the user commits an import. */
  async preflight(file: File, _options?: ImportOptions, execution?: ImportExecution): Promise<ImportPreflight> {
    const info = await this.inspect(file, execution)
    return { source: this.makeSource(file), format: this.format(file), kind: 'asset',
      summary: { estimatedLayers: 1, estimatedAssets: 1, estimatedGroups: 0, estimatedTracks: 0, estimatedMemoryBytes: info.estimatedBytes,
        detectedFeatures: ['3D model hierarchy', 'PBR materials', 'embedded textures', 'native clip inventory'], unsupportedFeatures: ['external companion files', 'rig/weight authoring'] },
      availableOptions: { centerInComposition: true }, defaultOptions: { centerInComposition: true }, warnings: info.warnings }
  }
  /** Validate actual parser readiness before publishing one model asset/layer.
   * A failed/aborted import never adopts its source or commits a partial layer. */
  async handle(file: File, _options?: ImportOptions, progress?: (value: ImportProgress) => void, execution?: ImportExecution): Promise<ImportResult> {
    const started = Date.now(), info = await this.inspect(file, execution)
    this.reportProgress(progress, 'converting', 'Preparing 3D model…', .4)
    return withImportSource(file, async url => {
      const asset: Asset = { id: this.generateAssetId(), name: file.name, type: 'model3d', url,
        storage: { mode: 'external', originalFileName: file.name }, runtime: { objectUrl: url }, metadata: { filesize: file.size, importedAt: Date.now() } }
      const lease = await modelAssetService.acquire(asset, execution)
      const inventory = lease.value.inventory
      lease.release(); checkImportExecution(execution)
      const layer = newModelLayer(`model3d_${crypto.randomUUID()}`, asset.id, file.name)
      if (info.emptyScene) {
        if (!inventory) throw new Error('The prepared empty model has no inventory.')
        layer.model3d = withModelContent(layer.model3d!, inventory)
      }
      const warnings: ImportResult['warnings'] = info.warnings.map(message => ({ code: 'unsupported_feature', severity: 'info', message }))
      this.reportProgress(progress, 'complete', '3D model imported', 1)
      return { id: this.generateId(), source: this.makeSource(file), format: this.format(file), kind: 'asset', assets: [asset], layers: [layer], groups: [], tracks: [], timelines: [], commands: [], warnings, errors: [], unsupportedFeatures: [],
        report: { title: '3D Model Import', sourceFileName: file.name, format: this.format(file), created: { assets: 1, layers: 1, groups: 0, tracks: 0, compositions: 0 }, warnings, errors: [], unsupportedFeatures: [], suggestions: [], durationMs: Date.now() - started } }
    })
  }
  /** Extension only labels a container already validated by inspect. */
  private format(file: File): ImportFormat { return file.name.toLowerCase().endsWith('.gltf') ? 'model/gltf+json' : 'model/gltf-binary' }
}
