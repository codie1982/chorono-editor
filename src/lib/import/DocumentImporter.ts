// ── DocumentImporter ──────────────────────────────────────────────────────────
//
// Handles complex document imports: SVG, Lottie, DXF, AE packages, etc.
// Each can create multiple Assets + multiple Layers + Groups + Tracks.
//
// Delegates to registered DocumentHandlers (SvgDocumentHandler, etc.)

import type { ImportHandler }  from './handlers/BaseHandler'
import type {
  ImportFormat,
  ImportOptions,
  ImportResult,
  ImportPreflight,
  ImportProgress,
  ImportWarning,
} from './types'
import { FileTypeDetector } from './FileTypeDetector'

export class DocumentImporter {
  private handlers: ImportHandler[] = []

  registerHandler(handler: ImportHandler): void {
    this.handlers.push(handler)
  }

  async preflight(file: File, format: ImportFormat, options?: ImportOptions): Promise<ImportPreflight> {
    const handler = this.findHandler(format)
    if (!handler) return this.unsupportedPreflight(file, format)
    return handler.preflight(file, options)
  }

  async handle(
    file: File,
    format: ImportFormat,
    options?: ImportOptions,
    onProgress?: (p: ImportProgress) => void,
  ): Promise<ImportResult> {
    onProgress?.({ stage: 'reading', label: 'Reading document…', progress: 0.05 })

    const handler = this.findHandler(format)
    if (!handler) {
      throw new Error(`No handler registered for document format: ${format} (${file.name})`)
    }

    return handler.handle(file, options, onProgress)
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
      kind:    'document',
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
