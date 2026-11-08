// ── AudioHandler ───────────────────────────────────────────────────────────────
//
// Handles MP3, WAV, AAC, OGG imports.
// Creates one AudioAsset + one AudioLayer (no visual size — audio only).

import type { MediaProbeSource } from '../../../asset/metadata'
import { editorMediaProbes } from '../../../asset/metadata/editorMediaProbes'
import { checkImportExecution, type ImportExecution } from '../../resources/ImportExecution'
import { withImportSource } from '../../resources/importSources'
import { BaseImportHandler } from '../BaseHandler'
import { newAudioLayer }     from '../../../defaults'
import type { ImportFormat, ImportOptions, ImportResult, ImportPreflight, ImportProgress, ImportWarning } from '../../types'
import type { Asset } from '../../../asset/types'

/** Import orchestration borrows the shared probe owner; native handles, byte
 * reservations and cancellation never enter asset/scene/undo JSON. */
export class AudioHandler extends BaseImportHandler {
  /** Private hosts can inject a narrow probe port without constructing DOM media. */
  constructor(private readonly probes: MediaProbeSource = editorMediaProbes) { super() }

  readonly kind = 'asset' as const
  readonly supportedFormats: ImportFormat[] = [
    'audio/mp3',  // canonical — FileTypeDetector maps audio/mpeg → audio/mp3
    'audio/wav',
    'audio/aac',
    'audio/ogg',
  ]

  /** Probe source metadata within bounded shared capacity, without retaining a native handle. */
  async preflight(file: File, options?: ImportOptions, execution?: ImportExecution): Promise<ImportPreflight> {
    const { durationMs } = await this.probes.audio(file, execution)
    const source  = this.makeSource(file)
    const format  = this.getFormat(file)
    const features: string[] = []
    if (durationMs > 0) {
      const sec = durationMs / 1000
      features.push(sec >= 60 ? `${(sec / 60).toFixed(1)} min` : `${sec.toFixed(1)} s`)
    }

    return {
      source,
      format,
      kind:    'asset',
      summary: {
        estimatedLayers:      1,
        estimatedAssets:      1,
        estimatedGroups:      0,
        estimatedTracks:      0,
        estimatedMemoryBytes: file.size * 3, // rough decoded PCM estimate
        detectedFeatures:     features,
        unsupportedFeatures:  [],
      },
      availableOptions: {
        collection: true,
      },
      defaultOptions:  {},
      warnings: durationMs > 0 ? [] : ['Audio duration could not be read. A temporary clip duration will be used; check the imported source.'],
    }
  }

  /** Validate/probe before creator source adoption; caller owns final result publication. */
  async handle(
    file: File,
    options?: ImportOptions,
    onProgress?: (p: ImportProgress) => void,
    execution?: ImportExecution,
  ): Promise<ImportResult> {
    const startMs = Date.now()
    this.reportProgress(onProgress, 'reading', 'Reading audio…', 0.1)

    const { durationMs } = await this.probes.audio(file, execution)
    checkImportExecution(execution)
    return withImportSource(file, async (url) => {
      const assetId  = this.generateAssetId()
      const format   = this.getFormat(file)

      this.reportProgress(onProgress, 'converting', 'Creating layer…', 0.7)

      const asset: Asset = {
        id:         assetId,
        name:       file.name,
        type:       'audio',
        url,
        durationMs: durationMs > 0 ? durationMs : undefined,
        storage:  { mode: 'external', originalFileName: file.name },
        metadata: {
          filesize:   file.size,
          importedAt: Date.now(),
          tags:       [],
        },
        runtime: { objectUrl: url },
      }

      const layer = newAudioLayer(assetId, durationMs > 0 ? durationMs : undefined)
      layer.name = file.name
      const warnings: ImportWarning[] = durationMs > 0 ? [] : [{ code: 'parse_error', severity: 'warning', message: 'Audio duration could not be read. A temporary clip duration was used; check the imported source.', affectedIds: [layer.id] }]

      this.reportProgress(onProgress, 'complete', 'Done', 1)
      checkImportExecution(execution)

      return {
        id:      this.generateId(),
        source:  this.makeSource(file),
        format,
        kind:    'asset',
        assets:  [asset],
        layers:  [layer],
        groups:  [],
        tracks:  [],
        timelines: [],
        commands: [],
        warnings,
        errors:             [],
        unsupportedFeatures: [],
        report: {
          title:          'Audio Import',
          sourceFileName: file.name,
          format,
          created:        { assets: 1, layers: 1, groups: 0, tracks: 0, compositions: 0 },
          warnings,
          errors:         [],
          unsupportedFeatures: [],
          suggestions:    [],
          durationMs:     Date.now() - startMs,
        },
      }
    })
  }

  // ── Private ────────────────────────────────────────────────────────────────


  private getFormat(file: File): ImportFormat {
    const mime = file.type.toLowerCase()
    // Map browser MIME types → canonical ImportFormat values
    if (mime === 'audio/mpeg' || mime === 'audio/mp3') return 'audio/mp3'
    if (mime === 'audio/wav'  || mime === 'audio/wave' || mime === 'audio/x-wav') return 'audio/wav'
    if (mime === 'audio/aac'  || mime === 'audio/mp4') return 'audio/aac'
    if (mime === 'audio/ogg'  || mime === 'audio/vorbis') return 'audio/ogg'
    // Fallback by extension
    const lower = file.name.toLowerCase()
    if (lower.endsWith('.wav'))  return 'audio/wav'
    if (lower.endsWith('.aac'))  return 'audio/aac'
    if (lower.endsWith('.m4a'))  return 'audio/aac'
    if (lower.endsWith('.ogg'))  return 'audio/ogg'
    return 'audio/mp3'
  }
}
