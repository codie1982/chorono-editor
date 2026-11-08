import type { ChronoScene } from '../../types'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'
import { BoundedTextReader, type TextInputReader } from '../../resources/io'
import { BoundedJobQueue, withPreparationDeadline, type JobExecutor } from '../../resources/jobs'

/** Prepared source only: caller chooses when to replace editor/history. */
export interface SceneDocumentSource {
  load(file: File, execution?: { signal?: AbortSignal }): Promise<ChronoScene>
}

/** Bounded project-file reading/conversion, separate from merge transactions and
 * UI state. Input/text survive actual parsing settlement; returned scene owns
 * its parsed data but no reader/native handles. Host supplies an outer executor
 * (never the same inner media queue it may await). No scene/history/cache is kept.
 * JSON parsing is synchronous platform work; abort prevents handoff but cannot
 * interrupt a running JSON.parse. Deep scene validation remains a separate domain. */
export class SceneDocumentLoader implements SceneDocumentSource {
  private readonly reader: TextInputReader
  private readonly executor: JobExecutor
  private readonly timeoutMs: number

  /** Private defaults bound concurrency, waiting records, actual bytes and text.
   * App injects the common outer import executor and shared managed byte ledger. */
  constructor(options: { reader?: TextInputReader; executor?: JobExecutor; timeoutMs?: number } = {}) {
    this.reader = options.reader ?? new BoundedTextReader()
    this.executor = options.executor ?? new BoundedJobQueue({ concurrency: 1, maxQueued: 8 })
    this.timeoutMs = options.timeoutMs ?? 60_000
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 2147483647) throw new RangeError('Invalid scene-open deadline.')
  }

  /** Starts no file IO while queued; effective cancellation/deadline is checked
   * at queue handoff. Rejected parsed objects have no explicit native owner. */
  load(file: File, execution?: { signal?: AbortSignal }): Promise<ChronoScene> {
    return withPreparationDeadline('Open scene', this.timeoutMs, execution?.signal, signal =>
      this.executor.submit(jobSignal => this.reader.withBlob(file, text => parseSceneJson(text, true),
        { signal: jobSignal, label: 'Scene JSON text' }), { signal }))
  }
}
