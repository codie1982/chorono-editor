// ── ImportManager ─────────────────────────────────────────────────────────────
//
// Main entry point for all imports in Chorono.
// Routes between AssetImporter (simple files) and DocumentImporter (complex docs).
//
// Usage:
//   const result = await importManager.importFile(file, options)
//   dispatchCommand(result.command)

import { fileTypeDetector }    from './FileTypeDetector'
import { AssetImporter }        from './AssetImporter'
import { DocumentImporter }     from './DocumentImporter'
import { ImportTransactionBuilder } from './ImportTransactionBuilder'
import { urlValidator }         from './security/UrlValidator'
import type { ImportHandler }   from './handlers/BaseHandler'
import type {
  ImportFormat,
  ImportKind,
  ImportOptions,
  ImportResult,
  ImportPreflight,
  ImportProgress,
  ImportSource,
  ImportEvent,
} from './types'
import { getImportKind } from './types'

// ── Manager ───────────────────────────────────────────────────────────────────

export class ImportManager {
  private assetImporter    = new AssetImporter()
  private documentImporter = new DocumentImporter()
  private txBuilder        = new ImportTransactionBuilder()
  private listeners        = new Set<(e: ImportEvent) => void>()

  /**
   * Subscribe to import lifecycle events (start / complete / error).
   * Returns an unsubscribe function. Lets the Console / automation observe
   * imports without polling.
   */
  onImportEvent(fn: (e: ImportEvent) => void): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  private emit(e: ImportEvent): void {
    this.listeners.forEach(fn => { try { fn(e) } catch { /* listener errors never break import */ } })
  }

  /**
   * Import a File from a file picker or drag-drop.
   * Auto-detects format and routes to the appropriate importer.
   */
  async importFile(
    file: File,
    options?: ImportOptions,
    onProgress?: (p: ImportProgress) => void,
  ): Promise<ImportResult> {
    onProgress?.({ stage: 'detecting', label: 'Detecting format…', progress: 0.05 })

    const format = await fileTypeDetector.detect(file)
    const kind   = getImportKind(format)

    return this.runHandler(file, format, kind, options, onProgress)
  }

  /**
   * Import a File with an EXPLICIT format, bypassing auto-detection.
   * Used by flows where the format can't be sniffed from bytes — e.g. a sprite
   * sheet (a plain PNG that the user declares as a grid of frames).
   */
  async importFileAs(
    file: File,
    format: ImportFormat,
    options?: ImportOptions,
    onProgress?: (p: ImportProgress) => void,
  ): Promise<ImportResult> {
    return this.runHandler(file, format, getImportKind(format), options, onProgress)
  }

  /**
   * Import from a URL (fetches the file first, then imports).
   */
  async importUrl(
    url: string,
    options?: ImportOptions,
    onProgress?: (p: ImportProgress) => void,
  ): Promise<ImportResult> {
    onProgress?.({ stage: 'reading', label: 'Fetching file…', progress: 0.05 })

    // Security: only allow https (or http on localhost). Blocks file:/data:/js:.
    const validation = urlValidator.validate(url)
    if (!validation.ok) {
      throw new Error(`Refused to import URL: ${validation.reason}`)
    }

    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`)

    const blob = await response.blob()
    const filename = url.split('/').pop() ?? 'imported'
    const file = new File([blob], filename, { type: blob.type })

    return this.importFile(file, options, onProgress)
  }

  /**
   * Import from clipboard (e.g. Cmd+V paste of image).
   */
  async importClipboardItem(
    item: ClipboardItem,
    options?: ImportOptions,
    onProgress?: (p: ImportProgress) => void,
  ): Promise<ImportResult | null> {
    // Try image types first
    const imageTypes = item.types.filter(t => t.startsWith('image/'))
    if (imageTypes.length > 0) {
      const blob = await item.getType(imageTypes[0])
      const file = new File([blob], `clipboard_${Date.now()}.${imageTypes[0].split('/')[1]}`, {
        type: imageTypes[0],
      })
      return this.importFile(file, options, onProgress)
    }
    return null
  }

  /**
   * Run preflight analysis without committing import.
   * Shows the user what will be created and allows choosing options.
   */
  async preflight(file: File, options?: ImportOptions): Promise<ImportPreflight> {
    const format = await fileTypeDetector.detect(file)
    const kind   = getImportKind(format)
    const importer = kind === 'asset' ? this.assetImporter : this.documentImporter
    return importer.preflight(file, format, options)
  }

  /**
   * Check if a file can be imported.
   */
  async canImport(file: File): Promise<{ supported: boolean; format: ImportFormat }> {
    const format = await fileTypeDetector.detect(file)
    return { supported: format !== 'unknown', format }
  }

  /**
   * Register a custom handler (for plugins/extensions).
   */
  registerHandler(handler: ImportHandler): void {
    if (handler.kind === 'asset') {
      this.assetImporter.registerHandler(handler)
    } else {
      this.documentImporter.registerHandler(handler)
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async runHandler(
    file: File,
    format: ImportFormat,
    kind: ImportKind,
    options?: ImportOptions,
    onProgress?: (p: ImportProgress) => void,
  ): Promise<ImportResult> {
    this.emit({ type: 'importStart', format, source: file.name })
    try {
      const importer = kind === 'asset' ? this.assetImporter : this.documentImporter
      const result   = await importer.handle(file, format, options, onProgress)

      onProgress?.({ stage: 'creating', label: 'Building transaction…', progress: 0.95 })

      // Wrap all created items in one atomic undo transaction
      const command = this.txBuilder.build(result)
      result.commands = [command]

      onProgress?.({ stage: 'complete', label: 'Import complete', progress: 1 })

      this.emit({ type: 'importComplete', format, source: file.name, result })
      return result
    } catch (err) {
      this.emit({ type: 'importError', format, source: file.name, error: (err as Error).message })
      throw err
    }
  }
}

/** Singleton — use this throughout the app */
export const importManager = new ImportManager()
