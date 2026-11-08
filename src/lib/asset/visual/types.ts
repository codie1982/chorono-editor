import type { ResourceLease } from '../../resources/residency'

export type VisualKind = 'image' | 'video'
/** Original source identity. Video consumer identity is separate from its URL:
 * independent clip clocks must never share one mutable HTMLVideoElement. */
export interface VisualInput {
  kind: VisualKind; url: string
  /** Owner's runtime admission hook. Default video backend invokes it on metadata
   * before requesting first-frame preload; images invoke before ready publication.
   * Image allocation-before-native relies on the owner's separate header reader.
   * Throws refuse preparation; never serialized or included in source identity. */
  admitFrame?: (width: number, height: number) => void
}
/** Decoder-owned native handle. Creation must not start unbounded work outside
 * the caller's reservation/queue. ready resolves only when dimensions and a
 * drawable frame exist; failures leave the handle for the owner to dispose.
 * dispose requests pending cancellation and resets native sources. ready must
 * still track actual native promise settlement rather than an early abort race;
 * its owner retains reservation/slot until that settles. Terminal callbacks are
 * detached at settlement. Repeated disposal must be safe for cleanup retry.
 * Width/height are pixels; bytes measure one RGBA frame, not decoder internals. */
export interface VisualResource {
  readonly element: HTMLImageElement | HTMLVideoElement
  readonly width: number; readonly height: number
  readonly ready: Promise<void>
  dispose(): void
}
/** A resource lease is required for every retained use; DOM elements must not
 * escape past release. retain forks ownership, including invalidated entries. */
export type VisualLease = ResourceLease<VisualResource>
export type VisualDecoder = (input: VisualInput, signal: AbortSignal) => VisualResource
