/** Exclusive ownership of a compact binary input. buffer is borrowed only until
 * release; never retain it afterwards. Native consumers that ignore abort keep
 * this lease until actual settlement, even if decode detaches the ArrayBuffer. */
export interface BinaryInputLease {
  readonly buffer: ArrayBuffer
  readonly byteLength: number
  /** Reserve another full-size input copy while work converts/uses it. The
   * callback must own any returned persistent representation independently;
   * browser Blob/source storage after this scope is not measured by this lease.
   * A release request during work defers dropping the original charge until
   * work actually settles. Failure never invokes work outside admission. */
  withCopy<T>(work: (buffer: ArrayBuffer) => T | Promise<T>): Promise<T>
  release(): void
}

/** Consume one unlocked response body into an owned compact buffer. The reader
 * enforces actual bytes as well as usable size hints, cancels rejected bodies,
 * and settles only after its underlying read/cancel operations settle. The
 * caller owns response creation/fetch cancellation and returned lease release.
 * Non-success HTTP responses reject and cancel their bodies. No unbounded
 * arrayBuffer/blob fallback is allowed for an unreadable body. */
export interface BinaryInputReader {
  readResponse(response: Response, options?: { signal?: AbortSignal }): Promise<BinaryInputLease>
}

/** Header-only capability, separate from complete-response consumers. Returned
 * prefix is owned and immutable until release. Remaining body cancellation must
 * actually settle before delivery; this does not cap the source's full byte size. */
export interface BinaryPrefixReader {
  readPrefix(response: Response, maxBytes: number, options?: { signal?: AbortSignal }): Promise<BinaryInputLease>
}
