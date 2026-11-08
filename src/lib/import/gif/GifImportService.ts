import { ResourceBudget, ResourceBudgetGroup, type ResourceAllocator } from '../../resources/budget'
import { BoundedBinaryReader, type BinaryInputReader, type BinaryInputLease } from '../../resources/io'
import { BoundedJobQueue, withPreparationDeadline, type JobExecutor } from '../../resources/jobs'
import { GifDecodeWorkerClient } from '../workers/GifDecodeWorkerClient'
import { checkImportExecution, type ImportExecution } from '../resources/ImportExecution'
import { readGifMetadata } from './readGifMetadata'
import { planGifSheet } from './planGifSheet'
import { mainThreadGifComposer } from './browserGifPlatform'
import { browserGifStaticProbe } from './browserGifStaticProbe'
import { PreparedGif } from './PreparedGif'
import { GifBackendUnavailable, resolveGifLimits, type GifLimits, type GifMetadata, type GifSheetPlan, type GifSheetComposer } from './types'

/** Handler depends only on metadata/preparation, not budgets or worker lifecycle. */
export interface GifImportProvider {
  readonly canAnimate: boolean
  inspect(file: File, execution?: ImportExecution): Promise<GifSheetPlan>
  prepare(file: File, execution?: ImportExecution): Promise<PreparedGif>
}

export interface GifImportServiceOptions extends Partial<GifLimits> {
  budget?: ResourceAllocator
  executor?: JobExecutor
  inputReader?: BinaryInputReader
  worker?: GifSheetComposer | false
  main?: GifSheetComposer | false
  probeStatic?: (file: File, metadata: GifMetadata, execution?: ImportExecution) => Promise<void>
  timeoutMs?: number
}

/** GIF input/native/output orchestration, separate from scene/source creation.
 * A bounded queue (or borrowed shared executor) starts IO only after admission.
 * Input plus native codec-copy scope, one frame, full padded canvas and PNG
 * output policy overlap before decoding. Workspace ends only after actual backend
 * cleanup; returned PNG stays admitted until PreparedGif.release/adoption.
 * Local 256 MiB/8192 and optional host limits overlap, never sum. Native internals
 * remain estimates, not total RAM. No ordinary scene/undo payload is retained. */
export class GifImportService implements GifImportProvider {
  private readonly local = new ResourceBudget({ maxBytes: 256 * 1024 ** 2, maxEntries: 8192 })
  private readonly budget: ResourceAllocator
  private readonly limits: GifLimits
  private readonly input: BinaryInputReader
  private readonly jobs: JobExecutor
  private readonly worker?: GifSheetComposer
  private readonly main?: GifSheetComposer
  private readonly probeStatic: NonNullable<GifImportServiceOptions['probeStatic']>
  private readonly timeoutMs: number

  /** Immutable policies/ports; constructors allocate no worker/decoder/pixels. */
  constructor(options: GifImportServiceOptions = {}) {
    this.limits = resolveGifLimits(options)
    this.timeoutMs = options.timeoutMs ?? 30000
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs <= 0 || this.timeoutMs > 0x7fffffff) throw new RangeError('Invalid GIF preparation deadline.')
    this.budget = options.budget ? new ResourceBudgetGroup([this.local, options.budget]) : this.local
    this.input = options.inputReader ?? new BoundedBinaryReader({ maxBytes: this.limits.maxInputBytes, budget: this.budget })
    this.jobs = options.executor ?? new BoundedJobQueue({ concurrency: 2, maxQueued: 128 })
    this.worker = options.worker === false ? undefined : options.worker ?? (GifDecodeWorkerClient.isSupported() ? new GifDecodeWorkerClient() : undefined)
    this.main = options.main === false ? undefined : options.main ?? (typeof ImageDecoder !== 'undefined' ? mainThreadGifComposer : undefined)
    this.probeStatic = options.probeStatic ?? browserGifStaticProbe
  }

  /** Header-only preflight: no native decoded frame is needed for dimensions or
   * count. File/queue admission and cancellation still apply. Returned plan has
   * only immutable scalar pixel/byte values, no live resource ownership. */
  inspect(file: File, execution?: ImportExecution) {
    return withPreparationDeadline('GIF preflight', this.timeoutMs, execution?.signal,
      signal => this.jobs.submit(jobSignal => this.withInput(file, input => planGifSheet(readGifMetadata(input.buffer, this.limits), this.limits), { signal: jobSignal }), { signal }))
  }

  /** Prepare one image/sequence. Only an explicit pre-transfer worker capability
   * failure may try the main backend once. Unsupported native animation imports
   * a validated still; abort/capacity/timeout/decode errors never restart work. */
  prepare(file: File, execution?: ImportExecution): Promise<PreparedGif> {
    return withPreparationDeadline('GIF preparation', this.timeoutMs, execution?.signal, signal => this.jobs.submit(signal => this.withInput(file, async input => {
      const metadata = readGifMetadata(input.buffer, this.limits), plan = planGifSheet(metadata, this.limits)
      const animated = metadata.frameCount > 1 && Boolean(this.worker || this.main)
      const workspace = this.budget.reserve('input', plan.frameBytes + (animated ? plan.sheetBytes : 0))
      if (!workspace) throw new RangeError('GIF workspace exceeds the managed resource budget.')
      let output: ReturnType<ResourceAllocator['reserve']> = null
      try {
        if (animated) {
          output = this.budget.reserve('input', plan.encodeReserveBytes)
          if (!output) throw new RangeError('GIF encoding exceeds the managed resource budget.')
        }
        const sheet = await input.withCopy(async buffer => {
          checkImportExecution({ signal })
          if (metadata.frameCount > 1) {
            if (this.worker) {
              try { return await this.worker.compose(buffer, plan, this.limits, { signal }) }
              catch (error) {
                if (!(error instanceof GifBackendUnavailable) || buffer.byteLength !== input.byteLength) throw error
                checkImportExecution({ signal })
              }
            }
            if (this.main) {
              try { return await this.main.compose(buffer, plan, this.limits, { signal }) }
              catch (error) { if (!(error instanceof GifBackendUnavailable)) throw error; checkImportExecution({ signal }) }
            }
          }
          await this.probeStatic(file, metadata, { signal }); return undefined
        })
        checkImportExecution({ signal })
        if (!sheet) return new PreparedGif(metadata)
        if (!output || !(sheet.blob instanceof Blob) || !sheet.blob.size || sheet.blob.size > plan.encodeReserveBytes
          || sheet.frameCount !== plan.frameCount || sheet.frameWidth !== plan.width || sheet.frameHeight !== plan.height
          || sheet.columns !== plan.columns || sheet.rows !== plan.rows || sheet.sheetWidth !== plan.sheetWidth || sheet.sheetHeight !== plan.sheetHeight
          || !Number.isFinite(sheet.avgFrameMs) || sheet.avgFrameMs <= 0) throw new Error('GIF backend output differs from its admitted plan.')
        if (!output.resize(sheet.blob.size)) throw new RangeError('GIF output exceeds the managed resource budget.')
        output.commit()
        const result = new PreparedGif(metadata, sheet, output); output = null
        return result
      } finally { workspace.release(); output?.release() }
    }, { signal }), { signal, discard: result => result.release() }))
  }

  /** Detached local policy counters, not a sum with reader/global/known RAM. */
  getSnapshot() { return this.local.getSnapshot() }

  /** Available setup paths, not a guarantee a particular codec/file will decode. */
  get canAnimate(): boolean { return Boolean(this.worker || this.main) }

  /** Bound actual File stream bytes; retain original through callback/native
   * settlement. Blob storage and returned persistent assets have other owners. */
  private async withInput<T>(file: File, work: (input: BinaryInputLease) => T | Promise<T>, execution?: ImportExecution): Promise<T> {
    checkImportExecution(execution)
    if (file.size > this.limits.maxInputBytes) throw new RangeError('GIF file exceeds the input byte limit.')
    const input = await this.input.readResponse(new Response(file.stream(), { headers: { 'content-length': String(file.size) } }), execution)
    // The executor performs the final abort/discard handoff. Checking here
    // after an owned result exists could throw without releasing that result.
    try { return await work(input) }
    finally { input.release() }
  }
}
