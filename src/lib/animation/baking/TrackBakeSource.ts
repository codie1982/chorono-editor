import type { Track } from '@/lib/types'

/**
 * Compares the complete immutable track source used by preview and commit.
 *
 * JSON structural equality intentionally matches the existing detached script
 * handle/command semantics. Runtime-only values must not enter Track records.
 * This is a stale-source predicate, not a cryptographic content checksum.
 */
export function isSameTrackBakeSource(expected: Track, current: Track | undefined): boolean {
  return current !== undefined && JSON.stringify(current) === JSON.stringify(expected)
}
