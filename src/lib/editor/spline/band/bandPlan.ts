import type { ChronoScene } from '../../../types'
import type { SplineEditMode } from '../../../spline/selection'
import { editableSplineLayer } from '../../../spline/edit/authoringGuard'
import { bandSelection } from '../../../spline/band/selection'
import { applySplineBand } from '../../../spline/band/applyBand'
import { assertBandSettings, type SplineBandSettings, type SplineBandRequest, type SplineBandResult } from '../../../spline/band/types'
import { splineEditCommand } from '../editCommand'

/** Capture local source/selection, never an evaluated/display pose. Preview is
 * read-only; Apply publishes one guarded native command/Undo. No new modifier
 * row or layer TRS/origin changes. Reuse of stale source refuses atomically. */
export function prepareSplineBand(scene: ChronoScene, layerId: string, mode: SplineEditMode, ids: readonly string[], settings: SplineBandSettings, keepSource = false) {
  assertBandSettings(settings)
  const layer = editableSplineLayer(scene, layerId), chains = bandSelection(layer.spline, mode, ids)
  const request: SplineBandRequest = { data: layer.spline, chains, settings }
  return { request, command(result: SplineBandResult) {
    const next = applySplineBand(layer.spline, chains, result, keepSource)
    const delegate = splineEditCommand(scene, layerId, { kind: 'topology' }, () => next.data, keepSource ? 'Append Outline band' : 'Outline selected spline geometry')
    if (!delegate) throw new Error('Outline produced no geometry change.')
    let expected = scene
    return { ids: next.ids, command: { label: delegate.label,
      execute(current: ChronoScene) { if (current !== expected) throw new Error('Spline source changed. Preview Outline again before Apply.'); return delegate.execute(current) },
      undo: (current: ChronoScene) => { expected = delegate.undo(current); return expected } } }
  } }
}
