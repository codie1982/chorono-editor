import type { ImportExecution } from '../resources/ImportExecution'

/** Scalar header scan, no decoded frames/DOM/native handles. Pixel units. */
export interface GifMetadata { readonly width: number; readonly height: number; readonly frameCount: number }
/** Explicit admission/rejection policy. Native codec/encoder internals and
 * process RAM remain outside these owned-buffer and RGBA policy estimates. */
export interface GifLimits {
  readonly maxInputBytes: number
  readonly maxFrames: number
  readonly maxDimension: number
  readonly maxFrameBytes: number
  readonly maxSheetBytes: number
  readonly maxOutputBytes: number
}
export interface GifSheetPlan extends GifMetadata {
  readonly columns: number; readonly rows: number
  readonly sheetWidth: number; readonly sheetHeight: number
  readonly frameBytes: number; readonly sheetBytes: number; readonly encodeReserveBytes: number
}
export interface DecodedGifSheet {
  readonly blob: Blob
  readonly sheetWidth: number; readonly sheetHeight: number
  readonly frameWidth: number; readonly frameHeight: number
  readonly frameCount: number; readonly columns: number; readonly rows: number
  readonly avgFrameMs: number
}
/** Backend borrows input through actual native completion (worker may transfer
 * it). Returned Blob has no source URL. Consumer supplies admission before work.
 * Abort must await running native cleanup or explicit worker termination. */
export interface GifSheetComposer {
  compose(buffer: ArrayBuffer, plan: GifSheetPlan, limits: GifLimits, execution?: ImportExecution): Promise<DecodedGifSheet>
}
/** Explicit setup/capability failure only. It permits one safe backend fallback
 * before input transfer. Capacity, timeout, cancellation and decode failures do
 * not use this type and must never restart an unbounded/alternate decode path. */
export class GifBackendUnavailable extends Error {
  constructor(message: string) { super(message); this.name = 'GifBackendUnavailable' }
}

/** Resolve immutable safe-integer policies; file data never selects its limits. */
export function resolveGifLimits(options: Partial<GifLimits> = {}): GifLimits {
  const limits: GifLimits = { maxInputBytes: options.maxInputBytes ?? 128 * 1024 ** 2,
    maxFrames: options.maxFrames ?? 4096, maxDimension: options.maxDimension ?? 16384,
    maxFrameBytes: options.maxFrameBytes ?? 64 * 1024 ** 2, maxSheetBytes: options.maxSheetBytes ?? 64 * 1024 ** 2,
    maxOutputBytes: options.maxOutputBytes ?? 128 * 1024 ** 2 }
  for (const [name, value] of Object.entries(limits)) if (!Number.isSafeInteger(value) || value <= 0 || value > 0x7fffffff) throw new RangeError(`Invalid GIF limit: ${name}.`)
  return Object.freeze(limits)
}
