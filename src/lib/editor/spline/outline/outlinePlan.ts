import type { ChronoScene } from '../../../types'
import type { OverrideMap } from '../../../evaluator'
import type { SplinePathData } from '../../../types/spline'
import type { SplineEditMode } from '../../../spline/selection'
import { subShapeData } from '../../../spline/selection'
import { splineToPathDefinition, appendSplineObjects } from '../../../spline'
import { editableSplineLayer, drivenSplineTopologyReason } from '../../../spline/edit/authoringGuard'
import { assertSplineTopology } from '../../../spline/topology'
import { resolveLayerWorldMatrix } from '../../../geometry/resolveLayerWorldMatrix'
import { transformPathDefinition } from '../../../geometry/transformPathDefinition'
import { outlineToSpline, OUTLINE_LIMITS, assertOutlineSettings, type OutlineSettings, type OutlineRequest, type OutlineResult } from '../../../spline/outline'
import { replaceOffsetContours } from './offsetResult'
import { splineEditCommand } from '../editCommand'

/** Whole-contour selection in stable source order; Objects include holes.
 * Strict native Edit rejects partial edge chains. Legacy headless callers keep
 * their documented promotion unless explicitly requesting strict selection. */
export function outlineSelection(data: SplinePathData, mode: SplineEditMode, ids: readonly string[], requireCompleteContours = false) {
  if (!['edge', 'object'].includes(mode) || !ids.length) throw new Error('Select edges or Objects to preview Offset / Outline.')
  const selected = new Set(ids)
  if (ids.some(id => !(mode === 'edge' ? data.segments[id] : data.subShapes[id]))) throw new Error('The Offset selection no longer exists.')
  const groups = Object.values(data.subShapes).flatMap(object => {
    const indices = object.contourIds.flatMap((id, i) => mode === 'object' ? selected.has(object.id) ? [i] : []
      : data.contours[id].segmentIds.some(edge => selected.has(edge)) ? [i] : [])
    return indices.length ? [{ object, indices }] : []
  })
  const contours = groups.flatMap(group => group.indices.map(i => data.contours[group.object.contourIds[i]]))
  if (requireCompleteContours && mode === 'edge' && contours.some(contour => contour.segmentIds.some(id => !selected.has(id))))
    throw new Error('Select every edge of each contour, or use Object mode. Partial-chain Offset is not available yet.')
  if (!contours.length || contours.some(c => c.closed !== contours[0].closed)) throw new Error('Select either open or closed contours for one Offset.')
  return { groups, closed: contours[0].closed, contourCount: contours.length }
}

/** Capture one ephemeral Offset preview in composition pixels. Legacy callers
 * default to append/promotion; native Edit explicitly requests replace/strict.
 * Replace preserves Object ownership, paint/TRS and unselected contours; removed
 * geometry readers refuse. One guarded native command/Undo; no preview writes. */
export function prepareSplineOutline(scene: ChronoScene, layerId: string, mode: SplineEditMode, ids: readonly string[],
  settings: OutlineSettings, timeMs = 0, overrides?: OverrideMap, options: { resultMode?: 'append' | 'replace'; requireCompleteContours?: boolean } = {}) {
  assertOutlineSettings(settings)
  const layer = editableSplineLayer(scene, layerId), reason = drivenSplineTopologyReason(layer, scene)
  if (reason) throw new Error(reason)
  assertSplineTopology(layer.spline)
  const selection = outlineSelection(layer.spline, mode, ids, options.requireCompleteContours ?? options.resultMode === 'replace'), matrix = resolveLayerWorldMatrix(layer, scene, timeMs, overrides)
  if (Math.abs(matrix.determinant()) < 1e-9) throw new Error('Offset requires an invertible displayed transform.')
  if (selection.groups.length > OUTLINE_LIMITS.objects) throw new Error('Offset supports 1–8 source Objects.')
  let commands = 0
  const inputs = selection.groups.map(({ object, indices }) => {
    commands += object.contourIds.reduce((n, id) => n + layer.spline.contours[id].segmentIds.length + 2, 0)
    if (commands > OUTLINE_LIMITS.commands) throw new Error('Offset command budget exceeded.')
    return { name: object.name || 'Spline', path: transformPathDefinition(splineToPathDefinition(subShapeData(layer.spline, object.id)), matrix), indices, fillRule: layer.spline.fillRule }
  })
  const request: OutlineRequest = { ...settings, inputs }
  return { request, closed: selection.closed, contourCount: selection.contourCount,
    command(result: OutlineResult) {
      const incoming = outlineToSpline(result, matrix.invert(), layer.spline.fillRule)
      const replacing = options.resultMode === 'replace'
      const appended = replacing ? replaceOffsetContours(layer.spline, incoming, selection.groups, settings.side === 'both') : appendSplineObjects(layer.spline, incoming)
      const delegate = splineEditCommand(scene, layerId, { kind: replacing ? 'topology' : 'metadata' }, () => appended.data, replacing ? 'Offset selected contours' : 'Append Offset contours')
      if (!delegate) throw new Error('Offset produced no new geometry.')
      return { ids: appended.objectIds, command: { label: delegate.label,
        execute(current: ChronoScene) {
          if (current !== scene) throw new Error('Spline source changed. Preview Offset again before Apply.')
          const target = editableSplineLayer(current, layerId), invalid = drivenSplineTopologyReason(target, current)
          if (invalid) throw new Error(invalid)
          return delegate.execute(current)
        }, undo: (current: ChronoScene) => delegate.undo(current) } }
    } }
}
