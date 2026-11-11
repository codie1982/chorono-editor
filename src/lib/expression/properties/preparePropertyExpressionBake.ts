import type { ChronoScene, Timeline } from '../../types'
import type { ParamValueMap } from '../../runtime/paramResolver'
import { evaluateSceneFrame } from '../../runtime/evaluateSceneFrame'
import { buildParamValues } from '../../runtime/paramResolver'
import { prepareNumericSignalBake, validateBakeOptions, type BakeOptions, type BakeReport } from '../../animation/baking/bake'
import { propertyExpressionScope } from './PropertyExpressionScope'

export interface PreparedPropertyExpressionBake {
  readonly source: ChronoScene
  readonly layerId: string
  readonly path: string
  readonly timeline: Timeline
  readonly report: BakeReport
  readonly parameterValues: ReadonlyMap<string, unknown>
  readonly options: BakeOptions
}

/** Sample one live property at explicit composition times into its own ordinary
 * non-looping timeline. This captures all referenced timeline clocks at project
 * time, rather than incorrectly moving other timelines onto the target's clock.
 * Current parameters are frozen by this explicit bake operation. Stateful SM
 * ownership requires a state-specific recording and is rejected here.
 *
 * Source/params are borrowed then detached where needed. Work is synchronous,
 * abortable between samples and conservatively limited to two million parser
 * steps in addition to the common sample/simplification limits. Returned source
 * identity/track/report belong to the review UI and must be dropped on cancel.
 */
export function preparePropertyExpressionBake(scene: ChronoScene, layerId: string, path: string,
  options: BakeOptions, parameterValues?: ParamValueMap): PreparedPropertyExpressionBake {
  const count = validateBakeOptions(options), layer = scene.layers.find(item => item.id === layerId)
  if (!layer?.propertyExpressions?.fields[path]) throw new Error('The target has no live expression to bake.')
  if (options.endMs > scene.composition.durationMs) throw new Error('Bake range must be inside the composition.')
  const sampling = propertyExpressionScope(scene, { layerId, propertyPath: path, valueType: 'number' })
  const definitions = sampling.layers.flatMap(item => Object.values(item.propertyExpressions?.fields ?? {}))
  const smOwned = new Set((scene.stateMachines ?? []).flatMap(machine => machine.states.map(state => state.timelineId)))
  if (definitions.some(definition => smOwned.has(definition.timelineId)) || sampling.timelines.some(timeline => timeline.tracks.length && smOwned.has(timeline.id))) throw new Error('State-machine expressions require an explicit state recording; a global-time bake cannot preserve those transitions.')
  const steps = sampling.layers.length + sampling.timelines.reduce((sum, timeline) => sum + timeline.tracks.reduce((total, track) => total + 1 + track.keyframes.length * Math.ceil(Math.log2(track.keyframes.length + 1)), 0), 0)
    + definitions.reduce((sum, definition) => sum + 64 + Math.min(1024, Math.max(1, definition.formula.length)), 0)
  if ((count * 2 + 1) * steps > 2_000_000) throw new Error('Expression bake work budget exceeded; reduce the range/FPS or simplify the graph.')
  const params = parameterValues ? new Map(parameterValues) : buildParamValues(scene.parameters, new Map())
  const target = 'layers.' + layerId + '.' + path
  let suffix = 1, id = 'expression-bake-' + layerId
  const occupied = new Set(scene.timelines.map(timeline => timeline.id)), prefix = id
  while (occupied.has(id)) id = prefix + '-' + ++suffix
  const prepared = prepareNumericSignalBake({ target, keyframes: [] }, { ...options, keyIdPrefix: id }, timeMs => {
    const frame = evaluateSceneFrame(sampling, timeMs, { paramValues: params })
    const error = frame.expressionErrors.get(target) ?? frame.expressionErrors.get('scene')
    if (error) throw new Error('Expression failed at ' + timeMs + ' ms: ' + error)
    const value = frame.overrides.get(target)
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  })
  return { source: scene, layerId, path, options: { ...options }, parameterValues: params,
    report: prepared.report, timeline: { id, durationMs: scene.composition.durationMs, loop: false, autoplay: true, layerIds: [layerId], tracks: [prepared.track] } }
}
