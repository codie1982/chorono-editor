import type { ImportExecution } from './resources/ImportExecution'
// ── AssetImporter ─────────────────────────────────────────────────────────────
//
// Handles simple asset imports: Image, Video, Audio, Font.
// Each creates exactly one Asset + one Layer.
//
// Delegates to registered AssetHandlers (ImageHandler, VideoHandler, etc.)

import type { ImportHandler } from './handlers/BaseHandler'
import type {
  ImportFormat,
  ImportOptions,
  ImportResult,
  ImportPreflight,
  ImportProgress,
  ImportWarning,
} from './types'
import { FileTypeDetector } from './FileTypeDetector'

export class AssetImporter {
  private handlers: ImportHandler[] = []

  registerHandler(handler: ImportHandler): void {
    this.handlers.push(handler)
  }

  /** Run preflight for a specific format */
  async preflight(file: File, format: ImportFormat, options?: ImportOptions, execution?: ImportExecution): Promise<ImportPreflight> {
    const handler = this.findHandler(format)
    if (!handler) return this.unsupportedPreflight(file, format)
    return handler.preflight(file, options, execution)
  }

  /** Run the import */
  async handle(
    file: File,
    format: ImportFormat,
    options?: ImportOptions,
    onProgress?: (p: ImportProgress) => void,
    execution?: ImportExecution,
  ): Promise<ImportResult> {
    onProgress?.({ stage: 'reading', label: 'Reading file…', progress: 0.1 })

    const handler = this.findHandler(format)
    if (!handler) {
      throw new Error(`No handler registered for asset format: ${format} (${file.name})`)
    }

    return handler.handle(file, options, onProgress, execution)
  }

  private findHandler(format: ImportFormat): ImportHandler | undefined {
    return this.handlers.find(h => h.canHandle(format))
  }

  private unsupportedPreflight(file: File, format: ImportFormat): ImportPreflight {
    const warning: ImportWarning = {
      code: 'unsupported_feature',
      severity: 'error',
      message: `Format not supported: ${FileTypeDetector.label(format)}`,
    }
    return {
      source:  { kind: 'file', value: file.name, size: file.size, timestamp: Date.now() },
      format,
      kind:    'asset',
      summary: {
        estimatedLayers: 0, estimatedAssets: 0, estimatedGroups: 0,
        estimatedTracks: 0, estimatedMemoryBytes: 0,
        detectedFeatures: [], unsupportedFeatures: [FileTypeDetector.label(format)],
      },
      availableOptions: {},
      defaultOptions:   {},
      warnings:         [warning.message],
    }
  }
}
