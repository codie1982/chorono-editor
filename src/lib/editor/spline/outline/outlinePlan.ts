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
import { outlineToSpline, replaceOffsetContours, OUTLINE_LIMITS, assertOutlineSettings, type OutlineSettings, type OutlineRequest, type OutlineResult } from '../../../spline/outline'
import { bandSelection } from '../../../spline/band/selection'
import { chainContourView } from '../../../spline/band/sampleChain'
import { replaceOffsetChains } from '../../../spline/outline/replaceOffsetContours'
import { splineEditCommand } from '../editCommand'

/** Whole-contour selection in stable source order; Objects include holes.
 * Native Edit opts into connected chains. Other callers retain promotion or
 * explicitly request whole-contour validation. */
export function outlineSelection(data: SplinePathData, mode: SplineEditMode, ids: readonly string[], requireCompleteContours = false, allowChains = false) {
  if (!['edge', 'object'].includes(mode) || !ids.length) throw new Error('Select edges or Objects to preview Offset / Outline.')
  const selected = new Set(ids)
  if (ids.some(id => !(mode === 'edge' ? data.segments[id] : data.subShapes[id]))) throw new Error('The Offset selection no longer exists.')
  const groups = Object.values(data.subShapes).flatMap(object => {
    const indices = object.contourIds.flatMap((id, i) => mode === 'object' ? selected.has(object.id) ? [i] : []
      : data.contours[id].segmentIds.some(edge => selected.has(edge)) ? [i] : [])
    return indices.length ? [{ object, indices }] : []
  })
  const contours = groups.flatMap(group => group.indices.map(i => data.contours[group.object.contourIds[i]]))
  const chains = allowChains && mode === 'edge' && contours.some(c => c.segmentIds.some(id => !selected.has(id))) ? bandSelection(data,mode,ids) : null
  if (chains?.some(c=>c.closed)) throw new Error('Offset open chains and closed contours separately.')
  if (!chains && requireCompleteContours && mode === 'edge' && contours.some(contour => contour.segmentIds.some(id => !selected.has(id))))
    throw new Error('Select every edge of each contour, or use Object mode. This operation requires complete contours.')
  if (!contours.length || !chains && contours.some(c => c.closed !== contours[0].closed)) throw new Error('Select either open or closed contours for one Offset.')
  return { groups, chains, closed: chains ? false : contours[0].closed, contourCount: chains?.length ?? contours.length }
}

/** Capture one ephemeral Offset preview in composition pixels. Legacy callers
 * default to append/promotion; native Edit requests chain-aware replacement.
 * Replace preserves Object ownership, paint/TRS and unselected contours; removed
 * geometry readers refuse. One guarded native command/Undo; no preview writes. */
export function prepareSplineOutline(scene: ChronoScene, layerId: string, mode: SplineEditMode, ids: readonly string[],
  settings: OutlineSettings, timeMs = 0, overrides?: OverrideMap, options: { resultMode?: 'append' | 'replace'; requireCompleteContours?: boolean; allowChains?: boolean } = {}) {
  assertOutlineSettings(settings)
  const layer = editableSplineLayer(scene, layerId), reason = drivenSplineTopologyReason(layer, scene)
  if (reason) throw new Error(reason)
  assertSplineTopology(layer.spline)
  const selection = outlineSelection(layer.spline, mode, ids, options.requireCompleteContours ?? options.resultMode === 'replace', options.allowChains), matrix = resolveLayerWorldMatrix(layer, scene, timeMs, overrides)
  if (Math.abs(matrix.determinant()) < 1e-9) throw new Error('Offset requires an invertible displayed transform.')
  if ((selection.chains?.length ?? selection.groups.length) > OUTLINE_LIMITS.objects) throw new Error('Offset supports 1–8 source Objects.')
  let commands = 0
  const inputs = selection.chains ? selection.chains.map(chain => {
    const view = chainContourView(layer.spline,chain)
    const owner = layer.spline.subShapes[chain.objectId]
    const isolated = {...view,subShapes:{[owner.id]:{...owner,contourIds:[chain.contourId]}}}
    return {name:owner.name, path:transformPathDefinition(splineToPathDefinition(isolated),matrix),indices:[0],fillRule:layer.spline.fillRule}
  }) : selection.groups.map(({ object, indices }) => {
    commands += object.contourIds.reduce((n, id) => n + layer.spline.contours[id].segmentIds.length + 2, 0)
    if (commands > OUTLINE_LIMITS.commands) throw new Error('Offset command budget exceeded.')
    return { name: object.name || 'Spline', path: transformPathDefinition(splineToPathDefinition(subShapeData(layer.spline, object.id)), matrix), indices, fillRule: layer.spline.fillRule }
  })
  const request: OutlineRequest = { ...settings, inputs }
  return { request, closed: selection.closed, contourCount: selection.contourCount,
    command(result: OutlineResult) {
      const incoming = outlineToSpline(result, matrix.invert(), layer.spline.fillRule)
      const replacing = options.resultMode === 'replace'
      const appended = replacing && selection.chains ? replaceOffsetChains(layer.spline,incoming,selection.chains,settings.side==='both')
        : replacing ? replaceOffsetContours(layer.spline, incoming, selection.groups, settings.side === 'both') : appendSplineObjects(layer.spline, incoming)
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
