import type { CloneMode } from './CloneTypes'
import type { CloneArrayCommand } from '../editor/commands-clone'

/** A translation in each selected root's existing parent coordinate space. */
export type CloneForestOffsets = Readonly<Record<string, { x: number; y: number }>>

/** New forest contract; unlike legacy makeCloneCmd, omitted timelineIds means
 * all timelines. Source/asset/parameter data is never consumed or mutated. */
export interface CloneForestOptions {
  sourceIds: readonly string[]
  mode?: CloneMode
  count?: number
  duplicateAnimation?: boolean
  timelineIds?: readonly string[]
}

/** Atomic command with captured IDs. The result selects copied roots (or an
 * explicit placement group for driven roots), never every descendant. */
export interface CloneForestCommand extends CloneArrayCommand {
  diagnostics: string[]
  idMaps: Record<string, string>[]
  sourceRootIds: string[]
}

/** One immutable source preparation per gesture. atOffsets never allocates new
 * IDs; dispose by dropping this plan on source/scope change, cancel or commit.
 * The plan borrows source records and owns cloned serializable templates. */
export interface PreparedCloneForest {
  readonly sourceRootIds: readonly string[]
  atOffsets(offsets: CloneForestOffsets): CloneForestCommand
}
