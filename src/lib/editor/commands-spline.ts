// ── Spline Commands ───────────────────────────────────────────────────────────

import type { ChronoScene } from '../types'
import type { SplinePathData, SplinePrimitiveKind, SplineGeneratorParams } from '../types/spline'
import type { EditorCommand } from './commands-keyframe'
import { appendSplinePrimitiveToSplineData } from '../spline/factory/appendSplinePrimitiveToLayer'

/**
 * Appends a generated primitive (circle, star, …) as a new SubShape inside an
 * existing spline layer — the 3ds Max "Start New Shape → off" workflow.
 *
 * `prevSpline` is captured at command-creation time so undo/redo are
 * deterministic (mirrors makeUpdateLayerCmd).
 */
export function makeAppendSplinePrimitiveCmd(
  targetLayerId: string,
  kind:          SplinePrimitiveKind,
  params:        SplineGeneratorParams,
  prevSpline:    SplinePathData,
): EditorCommand {
  const merged = appendSplinePrimitiveToSplineData(prevSpline, kind, params)

  return {
    label: `Append ${kind} to spline`,
    execute: (scene: ChronoScene) => merged
      ? { ...scene, layers: scene.layers.map(l => l.id === targetLayerId ? { ...l, spline: merged } : l) }
      : scene,
    undo: (scene: ChronoScene) => ({
      ...scene,
      layers: scene.layers.map(l => l.id === targetLayerId ? { ...l, spline: prevSpline } : l),
    }),
  }
}
