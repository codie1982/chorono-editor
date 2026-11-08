import type { CloneMode } from './CloneTypes'
import type { CloneArrayCommand } from '../editor/commands-clone'

/** A translation in each selected root's existing parent coordinate space. */
export type CloneForestOffsets = Readonly<Record<string, { x: number; y: number }>>

/** Pre-multiplied transform in a root's EXISTING parent space. Rotation/scale
 * use an explicit placement parent, preserving animated source channels. */
export interface CloneRootPlacement { x: number; y: number; rotationDeg?: number; scaleX?: number; scaleY?: number }
/** One occurrence; time is an additive source-key/clip offset in milliseconds. */
export interface CloneOccurrencePlacement {
  roots: Readonly<Record<string, CloneRootPlacement>>
  timeOffsetMs?: number
}

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
  /** Explicit per-occurrence placements; never multiplies by occurrence index. */
  atPlacements(placements: readonly CloneOccurrencePlacement[]): CloneForestCommand
}
