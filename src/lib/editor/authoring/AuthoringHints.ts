import type { AuthoringHints } from '../../types/authoring'
import { AUTHORING_LIMITS } from './AuthoringValidation'

/** Bounded ephemeral lineage collector for native batches, scripts and private
 * broker jobs. Keeps only identity tuples, never source values/credentials.
 * Incomplete coverage explicitly downgrades unmapped new content to unknown.
 * Dispose by dropping the per-operation instance; no global cache or timers.
 */
export class AuthoringHintCollector {
  private readonly copies: NonNullable<AuthoringHints['copies']>[number][] = []
  private incomplete = false

  /** Borrow immutable tuple records; cap before growth, including nested jobs. */
  add(hints: AuthoringHints): void {
    this.incomplete ||= !!hints.incomplete
    const remaining = AUTHORING_LIMITS.records - this.copies.length
    this.copies.push(...(hints.copies ?? []).slice(0, remaining))
    if ((hints.copies?.length ?? 0) > remaining) this.incomplete = true
  }

  /** Return a caller-owned bounded array over immutable identity tuples. */
  get hints(): AuthoringHints { return { copies: this.copies.slice(), ...(this.incomplete ? { incomplete: true as const } : {}) } }
}
