import type { ImportExecution } from '../resources/ImportExecution'
// ── BaseHandler ───────────────────────────────────────────────────────────────
//
// Interface and abstract base for all import handlers.
// Every format implements this contract.

import type { ImportFormat, ImportKind, ImportOptions, ImportResult, ImportPreflight, ImportProgress } from '../types'

// ── Handler Interface ─────────────────────────────────────────────────────────

export interface ImportHandler {
  /** Formats this handler can process */
  readonly supportedFormats: ImportFormat[]
  readonly kind: ImportKind

  /** Returns true if this handler can process the given format */
  canHandle(format: ImportFormat): boolean

  /**
   * Run pre-import analysis without committing anything.
   * Used to show the user a preflight summary and options.
   */
  preflight(file: File, options?: ImportOptions, execution?: ImportExecution): Promise<ImportPreflight>

  /**
   * Run the full import and return the result.
   * Recoverable conversion gaps collect warnings. Cancellation, byte/budget
   * refusal and malformed containers reject; never retry via an unbounded fallback.
   * Optional runtime execution is forwarded to aware handlers; legacy handlers
   * remain valid and are checked for stale publication by ImportManager.
   * Owned persistent Blob URLs use import/resources/withImportSource; callers
   * releaseImportSources after commit/discard. Temporary probe URLs remain local
   * to their probe. Runtime source leases never enter the serialized result.
   */
  handle(
    file: File,
    options?: ImportOptions,
    onProgress?: (p: ImportProgress) => void,
    execution?: ImportExecution,
  ): Promise<ImportResult>
}

// ── Abstract Base ─────────────────────────────────────────────────────────────

export abstract class BaseImportHandler implements ImportHandler {
  abstract readonly supportedFormats: ImportFormat[]
  abstract readonly kind: ImportKind

  canHandle(format: ImportFormat): boolean {
    return this.supportedFormats.includes(format)
  }

  abstract preflight(file: File, options?: ImportOptions, execution?: ImportExecution): Promise<ImportPreflight>
  abstract handle(
    file: File,
    options?: ImportOptions,
    onProgress?: (p: ImportProgress) => void,
    execution?: ImportExecution,
  ): Promise<ImportResult>

  // ── Shared Helpers ────────────────────────────────────────────────────────

  protected makeSource(file: File): import('../types').ImportSource {
    return {
      kind:      'file',
      value:     file.name,
      size:      file.size,
      mimeType:  file.type,
      timestamp: Date.now(),
    }
  }

  protected generateId(): string {
    return `import_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  }

  protected generateAssetId(): string {
    return `asset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  }

  protected reportProgress(
    onProgress: ((p: ImportProgress) => void) | undefined,
    stage: ImportProgress['stage'],
    label: string,
    progress: number,
  ): void {
    onProgress?.({ stage, label, progress })
  }
}
