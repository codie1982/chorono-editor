import type { EditorCommand } from '../../editor/commands-keyframe'

/** Stable selected position keys at one exact timeline-local time (ms). Sparse
 * nodes may contain one axis. IDs are validated against this layer/timeline. */
export interface TrajectoryNodeRef {
  timeMs: number
  xKeyId?: string
  yKeyId?: string
}

/** Shared command scope; time inputs are local ms, points/deltas composition px. */
export interface TrajectoryCommandScope { timelineId: string; layerId: string }

/** Immutable prepared edit. Null commands are no-ops. selectedIds contain only
 * directly edited node keys; shape-preserving auxiliary keys are reported
 * separately. Execute once in an editor transaction; retain the command for
 * previews/redo so generated IDs remain stable. Preparation never mutates scene. */
export interface TrajectoryEditResult {
  command: EditorCommand | null
  selectedIds: string[]
  diagnostics: string[]
  supportIds?: string[]
}
