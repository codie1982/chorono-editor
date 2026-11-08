/** A persistent shader/capability failure for this native context. Backends may
 * retain their existing CPU fallback until restoration. Allocation/upload errors
 * remain retryable and must not permanently disable a valid smaller next frame. */
export class GpuBackendUnavailableError extends Error {
  constructor(message: string) { super(message); this.name = 'GpuBackendUnavailableError' }
}
