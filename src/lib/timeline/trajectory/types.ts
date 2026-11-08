import type { ChronoScene, Layer, Timeline, Track } from '@/lib/types'
import type { LayerIndex } from '@/lib/scene/LayerIndex'

export interface TrajectoryPoint { x: number; y: number }
export type TrajectoryDiagnosticCode = 'missing-layer' | 'missing-timeline' | 'invalid-time'
  | 'invalid-hierarchy' | 'locked' | 'frozen' | 'follow-path' | 'inline-motion-path'
  | 'driven-transform' | 'competing-timeline' | 'invalid-keys' | 'singular-parent'
  | 'node-budget' | 'sampling-budget'
export interface TrajectoryDiagnostic {
  code: TrajectoryDiagnosticCode
  message: string
  layerId?: string
  timelineId?: string
  /** False denotes a preview approximation warning, not a source-edit refusal. */
  blocking?: boolean
}
export interface TrajectoryCapability {
  editable: boolean
  /** False when native timeline evaluation alone cannot reproduce the rendered
   * binding/runtime frame; show diagnostics/source links without a false path. */
  previewable?: boolean
  kind: 'position' | 'followPath' | 'inlineMotionPath' | 'procedural' | 'none'
  diagnostics: TrajectoryDiagnostic[]
}
/** Borrowed immutable scene/timeline/layer snapshot and frame-local index. This
 * authoring context is transient; never serialize it or retain it after edits. */
export interface TrajectoryContext {
  readonly scene: ChronoScene
  readonly timeline: Timeline
  readonly layer: Layer
  readonly index: LayerIndex
  readonly ancestors: readonly Layer[]
  readonly xTarget: string
  readonly yTarget: string
  readonly xTrack?: Track
  readonly yTrack?: Track
  readonly capability: TrajectoryCapability
}
export type TrajectoryPreparation = { ok: true; context: TrajectoryContext }
  | { ok: false; diagnostics: TrajectoryDiagnostic[] }
export interface TrajectorySample {
  /** Exact local authoring time in milliseconds on the active timeline. */
  timeMs: number
  /** Rendered local anchor/pivot in composition pixels. */
  world: TrajectoryPoint
  /** Evaluated parent-local transform.x/y, before the authored anchor offset. */
  local: TrajectoryPoint
}
export interface TrajectoryKeyRef { id: string; target: string; timeMs: number; value: number }
export interface TrajectoryNode extends TrajectorySample {
  id: string
  keyIds: string[]
  xKey?: TrajectoryKeyRef
  yKey?: TrajectoryKeyRef
}
export interface TrajectorySamplingOptions {
  /** Error target in composition pixels, default 0.75; not a formal bound. */
  tolerancePx?: number
  /** Maximum projected polyline samples, default 256; hard ceiling 2048. */
  maxSamples?: number
  /** Maximum displayed authored nodes, default 512; hard ceiling 2048. */
  maxNodes?: number
}
export interface TrajectoryModel {
  context: TrajectoryContext | null
  timelineId: string
  layerId: string
  durationMs: number
  capability: TrajectoryCapability
  nodes: TrajectoryNode[]
  /** Separate polylines: a hold discontinuity must never be joined. */
  segments: TrajectorySample[][]
}
