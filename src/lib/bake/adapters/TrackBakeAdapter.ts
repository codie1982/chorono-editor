import { prepareBake, validateBakeOptions, type BakeReport } from '@/lib/animation/baking/bake'
import type { BakeAdapter, BakePreparationContext, BakeSourceIdentity } from '../BakeContracts'
import type { Track } from '@/lib/types'

/** Serializable track conversion recipe. Runtime cancellation is deliberately
 * excluded; timeline-local times use milliseconds and FPS is samples/second. */
export interface TrackBakeRecipe {
  version: 1
  kind: 'track'
  source: BakeSourceIdentity
  timelineId: string
  target: string
  timelineDurationMs: number
  startMs: number
  endMs: number
  fps: number
  tolerance: number
}

/** Prepared scalar keyframe artifact. It remains transient until the editor
 * applies it through the existing stale-safe, single-undo track command. */
export interface TrackBakePreview {
  recipe: TrackBakeRecipe
  track: Track
  report: BakeReport
}

/**
 * Adapts the existing deterministic scalar track baker to BakeService.
 *
 * The source track is borrowed immutable scene data. Preparation creates a new
 * track and report, never mutates the source, and persists no dense sample
 * buffers. Cancellation uses the shared signal already supported by the baker.
 */
export class TrackBakeAdapter implements BakeAdapter<TrackBakeRecipe, TrackBakePreview> {
  readonly kind = 'track'

  constructor(private readonly source: Track) {}

  /** Validates bounds before allocation, then prepares and measures one preview. */
  prepare(recipe: TrackBakeRecipe, context: BakePreparationContext): TrackBakePreview {
    if (recipe.kind !== this.kind || recipe.version !== 1 || recipe.target !== this.source.target) {
      throw new Error('Track bake recipe does not match its source track.')
    }
    const options = {
      startMs: recipe.startMs,
      endMs: recipe.endMs,
      fps: recipe.fps,
      tolerance: recipe.tolerance,
      keyIdPrefix: recipe.timelineId,
      signal: context.signal,
    }
    validateBakeOptions(options)
    if (!Number.isFinite(recipe.timelineDurationMs) || recipe.timelineDurationMs < 0 || recipe.endMs > recipe.timelineDurationMs) {
      throw new Error('The bake window must be inside the active timeline.')
    }
    context.reportProgress({ value: 0.1, phase: 'validate', message: 'Track and sample bounds validated.' })
    const result = prepareBake(this.source, options)
    context.reportProgress({ value: 0.95, phase: 'verify', message: 'Preview quality report measured.' })
    return { recipe, ...result }
  }
}

/** Builds a data-only recipe from the current editor source version. */
export function createTrackBakeRecipe(input: Omit<TrackBakeRecipe, 'version' | 'kind'>): TrackBakeRecipe {
  return { version: 1, kind: 'track', ...input }
}
