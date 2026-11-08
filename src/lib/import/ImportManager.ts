import { fileTypeDetector } from './FileTypeDetector'
import { AssetImporter } from './AssetImporter'
import { DocumentImporter } from './DocumentImporter'
import { ImportTransactionBuilder } from './ImportTransactionBuilder'
import { urlValidator } from './security/UrlValidator'
import type { ImportHandler } from './handlers/BaseHandler'
import type { ImportFormat, ImportOptions, ImportResult, ImportPreflight, ImportProgress, ImportEvent } from './types'
import { getImportKind } from './types'
import { releaseImportSources } from './resources/importSources'
import { BoundedBinaryReader, type BinaryInputReader } from '../resources/io'
import { BoundedJobQueue, withPreparationDeadline, type JobExecutor } from '../resources/jobs'
import { editorResourceBudget } from '../resources/budget'
import { editorImportPreparation } from './resources/editorImportPreparation'
import { checkImportExecution, type ImportExecution } from './resources/ImportExecution'
export type { ImportExecution } from './resources/ImportExecution'

type Progress = (progress: ImportProgress) => void
interface Attempt { format: ImportFormat; source: string }
interface ImportWork { execution: ImportExecution; start(file: File, format: ImportFormat): void }

/** Platform input/transport/capacity adapters. Private hosts have an independent
 * 2-active/128-wait queue; the app injects the realm-wide outer import executor.
 * timeoutMs (default 60 seconds) includes queue time, but never races cleanup. */
export interface ImportManagerOptions {
  inputReader?: BinaryInputReader
  fetch?: typeof globalThis.fetch
  executor?: JobExecutor
  timeoutMs?: number
}

/** Routes bounded import jobs into format handlers and atomic transactions.
 * The outer executor owns admission from the first IO through actual handler
 * settlement. Native media services use a separate inner executor (no cycles).
 * Success events/results transfer owned sources only after queue handoff and
 * final cancellation checks. Consumers commit then releaseImportSources, or
 * release on discard. Runtime signals/deadlines never enter serialized options.
 * Legacy non-abortable handlers may finish late; no stale success is published. */
export class ImportManager {
  private readonly assetImporter = new AssetImporter()
  private readonly documentImporter = new DocumentImporter()
  private readonly txBuilder = new ImportTransactionBuilder()
  private readonly listeners = new Set<(event: ImportEvent) => void>()
  private readonly inputReader: BinaryInputReader
  private readonly executor: JobExecutor
  private readonly timeoutMs: number

  /** Construction performs no IO. Borrowed executors/readers remain host-owned. */
  constructor(private readonly dependencies: ImportManagerOptions = {}) {
    this.inputReader = dependencies.inputReader ?? new BoundedBinaryReader()
    this.executor = dependencies.executor ?? new BoundedJobQueue({ concurrency: 2, maxQueued: 128 })
    this.timeoutMs = dependencies.timeoutMs ?? 60_000
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 2147483647) throw new RangeError('Invalid import deadline.')
  }

  /** Subscribe to lifecycle events; listener failures do not fail an import.
   * importComplete is synchronous publication, not proof of editor adoption. */
  onImportEvent(listener: (event: ImportEvent) => void): () => void {
    this.listeners.add(listener); return () => { this.listeners.delete(listener) }
  }

  /** Detect a File after admission, then build one atomic undo transaction. */
  importFile(file: File, options?: ImportOptions, progress?: Progress, execution?: ImportExecution): Promise<ImportResult> {
    return this.runImport(work => this.detectAndPrepare(file, options, progress, work), progress, execution)
  }

  /** Explicit format (e.g. sprite grid); shares admission/ownership with detection. */
  importFileAs(file: File, format: ImportFormat, options?: ImportOptions, progress?: Progress,
    execution?: ImportExecution): Promise<ImportResult> {
    return this.runImport(work => this.prepare(file, format, options, progress, work), progress, execution)
  }

  /** Bound actual response bytes and admit File-copy overlap until conversion
   * settles. URL → File dispatch stays inside ONE outer slot, avoiding nested
   * queue deadlocks. Persistent Blob storage/native internals are separate. */
  importUrl(url: string, options?: ImportOptions, progress?: Progress, execution?: ImportExecution): Promise<ImportResult> {
    return this.runImport(async work => {
      const validation = urlValidator.validate(url)
      if (!validation.ok) throw new Error(`Refused to import URL: ${validation.reason}`)
      progress?.({ stage: 'reading', label: 'Fetching file…', progress: 0.05 })
      checkImportExecution(work.execution)
      const response = await (this.dependencies.fetch ?? globalThis.fetch)(url, { signal: work.execution.signal })
      const input = await this.inputReader.readResponse(response, work.execution)
      try {
        return await input.withCopy(buffer => {
          checkImportExecution(work.execution)
          const file = new File([buffer], url.split('/').pop() || 'imported', { type: response.headers.get('content-type') ?? '' })
          return this.detectAndPrepare(file, options, progress, work)
        })
      } finally { input.release() }
    }, progress, execution)
  }

  /** Clipboard Blob acquisition shares the same outer slot and cancellation.
   * Native getType may ignore abort; its late result is checked before File IO. */
  importClipboardItem(item: ClipboardItem, options?: ImportOptions, progress?: Progress,
    execution?: ImportExecution): Promise<ImportResult | null> {
    return this.runImport(async work => {
      const type = item.types.find(value => value.startsWith('image/'))
      if (!type) return null
      const blob = await item.getType(type)
      checkImportExecution(work.execution)
      const file = new File([blob], `clipboard_${Date.now()}.${type.split('/')[1]}`, { type })
      return this.detectAndPrepare(file, options, progress, work)
    }, progress, execution)
  }

  /** Preflight starts no IO while queued. No source/result ownership is returned. */
  preflight(file: File, options?: ImportOptions, execution?: ImportExecution): Promise<ImportPreflight> {
    return this.submit(async signal => {
      const scope = { signal }, format = await fileTypeDetector.detect(file)
      checkImportExecution(scope)
      const importer = getImportKind(format) === 'asset' ? this.assetImporter : this.documentImporter
      const result = await importer.preflight(file, format, options, scope)
      checkImportExecution(scope)
      return result
    }, execution)
  }

  /** Detection reads only bounded magic/sniff slices, after queue admission. */
  canImport(file: File, execution?: ImportExecution): Promise<{ supported: boolean; format: ImportFormat }> {
    return this.submit(async signal => {
      const format = await fileTypeDetector.detect(file)
      checkImportExecution({ signal })
      return { supported: format !== 'unknown', format }
    }, execution)
  }

  /** Register a compatible plugin format handler; existing routing is preserved. */
  registerHandler(handler: ImportHandler): void {
    if (handler.kind === 'asset') this.assetImporter.registerHandler(handler)
    else this.documentImporter.registerHandler(handler)
  }

  /** Numeric queue policy/lifetime only; no files, callbacks or signals escape. */
  private emit(event: ImportEvent): void {
    this.listeners.forEach(listener => { try { listener(event) } catch { /* Observer isolation. */ } })
  }

  /** Deadline observes actual work settlement. discard owns only a result lost
   * at the executor handoff; the caller owns a successfully returned result. */
  private submit<T>(work: (signal: AbortSignal) => Promise<T>, execution?: ImportExecution,
    discard?: (result: T) => void): Promise<T> {
    return withPreparationDeadline('Import', this.timeoutMs, execution?.signal,
      signal => this.executor.submit(work, { signal, discard }))
  }

  /** Keep publication outside executor handoff. Abort may win after a producer
   * returns, in progress callbacks or between awaiting and resuming. Exactly one
   * owner cleans discarded sources; no complete event precedes these checks. */
  private async runImport<T extends ImportResult | null>(prepare: (work: ImportWork) => Promise<T>, progress?: Progress,
    execution?: ImportExecution): Promise<T> {
    let attempt: Attempt | undefined, result: T | undefined
    try {
      return await withPreparationDeadline('Import', this.timeoutMs, execution?.signal, async signal => {
        result = await this.executor.submit(jobSignal => prepare({ execution: { signal: jobSignal },
          start: (file, format) => {
            attempt = { format, source: file.name }
            this.emit({ type: 'importStart', ...attempt })
          } }), { signal, discard: value => { if (value) releaseImportSources(value) } })
        checkImportExecution({ signal })
        if (result) {
          progress?.({ stage: 'complete', label: 'Import complete', progress: 1 })
          checkImportExecution({ signal })
          this.emit({ type: 'importComplete', format: result.format, source: result.report.sourceFileName, result })
        }
        return result
      })
    } catch (error) {
      if (result) releaseImportSources(result)
      if (attempt) this.emit({ type: 'importError', ...attempt, error: (error as Error).message })
      throw error
    }
  }

  /** Internal detection deliberately bypasses public admission for URL/clipboard. */
  private async detectAndPrepare(file: File, options: ImportOptions | undefined, progress: Progress | undefined,
    work: ImportWork): Promise<ImportResult> {
    checkImportExecution(work.execution)
    progress?.({ stage: 'detecting', label: 'Detecting format…', progress: 0.05 })
    const format = await fileTypeDetector.detect(file)
    return this.prepare(file, format, options, progress, work)
  }

  /** Format conversion and transaction creation own untransferred source leases.
   * After return the executor's discard hook becomes the sole handoff owner. */
  private async prepare(file: File, format: ImportFormat, options: ImportOptions | undefined, progress: Progress | undefined,
    work: ImportWork): Promise<ImportResult> {
    checkImportExecution(work.execution)
    work.start(file, format)
    checkImportExecution(work.execution)
    let result: ImportResult | undefined
    try {
      const importer = getImportKind(format) === 'asset' ? this.assetImporter : this.documentImporter
      result = await importer.handle(file, format, options, progress, work.execution)
      checkImportExecution(work.execution)
      progress?.({ stage: 'creating', label: 'Building transaction…', progress: 0.95 })
      result.commands = [this.txBuilder.build(result, options)]
      checkImportExecution(work.execution)
      return result
    } catch (error) { if (result) releaseImportSources(result); throw error }
  }
}

/** Application composition root: one bounded outer queue and shared byte ledger. */
export const importManager = new ImportManager({ executor: editorImportPreparation,
  inputReader: new BoundedBinaryReader({ budget: editorResourceBudget }) })
