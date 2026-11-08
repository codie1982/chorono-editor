import type { Matrix2D } from '../geometry/Matrix2D'
import type { ChronoScene } from '../types'
import type { CloneForestCommand } from '../clone/CloneForestTypes'
import type { ArraySettings } from './ArrayTypes'

export interface ArrayForestOptions {
  sourceIds: readonly string[]
  primaryId?: string
  timeMs: number
  settings: ArraySettings
  pivotMode?: 'selectionCenter' | 'active'
}
export interface ArrayForestSummary {
  sourceRoots: number; sourceLayers: number; totalOccurrences: number
  newOccurrences: number; newLayers: number; newKeys: number
}
/** Runtime-only bounded composition-space bounding outlines. No source layers,
 * GPU handles or allocated clone records are retained by this preview. */
export interface ArrayForestPreview {
  outlines: readonly { occurrenceIndex: number; rootId: string; points: readonly { x: number; y: number }[] }[]
  truncated: boolean
}
/** One settings/source/time preparation. Math and preview are computed once;
 * buildCommand lazily allocates native clone templates once and caches the
 * exact result for Apply/retry. Drop the whole plan on source/scope changes. */
export interface ArrayForestPlan {
  readonly sourceRootIds: readonly string[]
  readonly summary: Readonly<ArrayForestSummary>
  readonly preview: ArrayForestPreview
  readonly diagnostics: readonly string[]
  readonly reference: { pivotWorld: { x: number; y: number }; spaceToWorld: Matrix2D; worldToSpace: Matrix2D }
  assertCurrent(scene: ChronoScene): void
  buildCommand(): CloneForestCommand
}
