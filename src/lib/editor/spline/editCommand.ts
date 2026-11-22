import type { ChronoScene, Layer } from '@/lib/types'
import { assertSplineTopology, assertSplineLocks, markEditedSubShapes } from '@/lib/spline/topology'
import { assertSplineGeometryReferences } from '@/lib/editor/spline/geometryReferences'
import type { SplinePathData } from '@/lib/types/spline'
import { makeUpdateLayerCmd } from '@/lib/editor/commands-layer'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import { drivenSplineEditReason, drivenSplineTopologyReason, drivenSplineTransformReason, editableSplineLayer } from '@/lib/spline/edit/authoringGuard'

export type SplineEditOperation = { kind: 'topology' } | { kind: 'metadata' } | { kind: 'point' | 'handle' | 'geometry'; ids: readonly string[] }
/** Native inspector/menu command policy. The current source is read at click,
 * and execution checks the captured spline identity to reject stale results.
 * Unrelated layer edits merge at execution; geometry/key writers are never
 * replaced by an evaluated pose. Source records and all tracks keep their IDs.
 * Errors belong to the host warning UI. No transaction/native resource owned. */
export function splineEditCommand(scene: ChronoScene, layerId: string, operation: SplineEditOperation,
  edit: (data: SplinePathData) => SplinePathData, label = 'Edit spline'): EditorCommand | null {
  const layer = editableSplineLayer(scene, layerId)
  splineEditCommandGuard(scene, layer, operation)
  assertSplineTopology(layer.spline)
  const edited = edit(layer.spline)
  const next = operation.kind === 'metadata' ? edited : markEditedSubShapes(layer.spline, edited)
  assertSplineLocks(layer.spline, next)
  assertSplineTopology(next)
  assertSplineGeometryReferences(scene, layerId, layer.spline, next)
  if (next === layer.spline || JSON.stringify(next) === JSON.stringify(layer.spline)) return null
  const base = layer.spline
  let delegate: EditorCommand | undefined
  return { label, execute: source => {
    const current = source.layers.find(item => item.id === layerId)
    if (current?.spline !== base || current.locked || current.frozen || current.hidden || current.instanceOf) throw new Error('Spline changed during editing. The current edit was preserved.')
    editableSplineLayer(source, layerId)
    assertSplineGeometryReferences(source, layerId, base, next)
    // Drivers can change without replacing spline records; recheck ownership.
    splineEditCommandGuard(source, current, operation)
    delegate = makeUpdateLayerCmd(layerId, { spline: next }, current)
    return delegate.execute(source)
  }, undo: source => delegate?.undo(source) ?? source }
}
/** Re-evaluate live ownership immediately before source mutation. */
function splineEditCommandGuard(scene: ChronoScene, layer: Layer, operation: SplineEditOperation): void {
  const reason = operation.kind === 'topology' ? drivenSplineTopologyReason(layer, scene)
    : operation.kind === 'metadata' ? null : operation.kind === 'geometry' ? drivenSplineTransformReason(layer, scene, new Set(operation.ids)) : operation.ids.map(id => drivenSplineEditReason(layer, scene, operation.kind === 'point' ? 'points' : 'handles', id)).find(Boolean)
  if (reason) throw new Error(reason)
}
