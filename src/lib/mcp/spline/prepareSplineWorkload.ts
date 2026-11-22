import type { ChronoScene } from '../../types'
import { evaluateSceneFrame } from '../../runtime/evaluateSceneFrame'
import { prepareSplineSourceOperation } from '../../editor/spline/operations/sourceOperation'
import type { SplineOperation } from '../../editor/spline/operations/types'
import { prepareSplineOutline } from '../../editor/spline/outline/outlinePlan'
import { prepareSplineChamfer } from '../../editor/spline/chamfer/chamferPlan'
import { prepareSplineFillet } from '../../editor/spline/fillet/filletPlan'
import { prepareBooleanOperation } from '../../editor/boolean/operationPlan'
import { OutlineWorkerClient, type OutlineExecutor } from '../../spline/outline'
import { ChamferWorkerClient, type ChamferExecutor } from '../../spline/chamfer'
import { FilletWorkerClient, type FilletExecutor } from '../../spline/fillet'
import { BooleanWorkerClient } from '../../geometry/boolean'
import type { BooleanExecutor } from '../../geometry/boolean/types'
import { assertSplineOperation } from '../../editor/spline/operations/validateOperation'
import { commandAuthoringHints } from '../../editor/authoring/AuthoringCommand'

export interface SplineExecutors { outline: OutlineExecutor; chamfer: ChamferExecutor; fillet: FilletExecutor; boolean: BooleanExecutor }
const defaults: SplineExecutors = { outline: new OutlineWorkerClient(), chamfer: new ChamferWorkerClient(), fillet: new FilletWorkerClient(), boolean: new BooleanWorkerClient() }
export interface SplineWorkload { layerId?: string; operation: SplineOperation; timeMs?: number; timelineIds?: string[] }
/** Prepare an ordinary source draft using the same native planners/worker
 * adapters as editor UI. No history, panel selection, viewport or playback
 * writes. Abort/stale source ownership belongs to the host before reply/Apply.
 * Solvers run in bounded workers; injected executors serve headless validation.
 * Geometry IDs allocate once and return as result metadata, never guessed IDs. */
export async function prepareSplineWorkload(scene: ChronoScene, input: SplineWorkload, signal: AbortSignal, executors: SplineExecutors = defaults) {
  const { operation: op, layerId } = input, timeMs = input.timeMs ?? 0
  assertSplineOperation(op)
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
  if (!Number.isFinite(timeMs) || timeMs < 0) throw new Error('Spline evaluation time must be nonnegative milliseconds.')
  if (input.timelineIds && (!input.timelineIds.length || input.timelineIds.some(id => !scene.timelines.some(t => t.id === id)))) throw new Error('Choose existing nonempty timelineIds.')
  const evaluatedScene = input.timelineIds ? { ...scene, timelines: scene.timelines.filter(t => input.timelineIds!.includes(t.id)), stateMachines: [] } : scene
  if (scene.stateMachines?.length && !input.timelineIds) throw new Error('Specify timelineIds for deterministic spline edits in a state-machine scene.')
  const frame = evaluateSceneFrame(evaluatedScene, timeMs)
  let command, result: unknown
  if (op.kind === 'boolean') {
    const targets = (op.targets ?? []).map(target => ({ ...target, label: scene.layers.find(l => l.id === target.layerId)?.name ?? target.layerId }))
    const plan = prepareBooleanOperation(scene, targets, op.settings, timeMs, frame.overrides, op.ownerId)
    const calculated = await executors.boolean.execute(plan.request, signal)
    command = plan.command(calculated); result = { layerId: plan.ownerId, ownerId: plan.ownerId, operation: op.settings.operation, outputVertices: calculated.outputVertices }
  } else {
    if (!layerId) throw new Error('layerId is required except for Boolean operations.')
    if (op.kind === 'offset') {
      const plan = prepareSplineOutline(scene, layerId, op.selection.mode, op.selection.ids, op.settings, timeMs, frame.overrides)
      const calculated = await executors.outline.execute(plan.request, signal), prepared = plan.command(calculated)
      command = prepared.command; result = { layerId, mode: 'object', ids: prepared.ids, outputVertices: calculated.outputVertices, bevelFallbacks: calculated.bevelFallbacks }
    } else if (op.kind === 'chamfer') {
      const plan = prepareSplineChamfer(scene, layerId, op.pointIds, op, timeMs, frame.overrides), calculated = await executors.chamfer.execute(plan.request, signal), prepared = plan.command(calculated)
      command = prepared.command; result = { layerId, mode: 'point', ids: prepared.ids, cuts: calculated.cuts }
    } else if (op.kind === 'fillet') {
      const plan = prepareSplineFillet(scene, layerId, op.pointIds, op, timeMs, frame.overrides), calculated = await executors.fillet.execute(plan.request, signal), prepared = plan.command(calculated)
      command = prepared.command; result = { layerId, mode: 'point', ids: prepared.ids, cuts: calculated.cuts, arcs: calculated.arcs }
    } else { const prepared = prepareSplineSourceOperation(scene, layerId, op, timeMs, frame.overrides); command = prepared.command; result = prepared.result }
  }
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
  const draft = command ? command.execute(scene) : scene
  return { scene: draft, result, timeMs, commandCount: command ? 1 : 0, authoringHints: command ? commandAuthoringHints(command) : {}, frame: evaluateSceneFrame(input.timelineIds ? { ...draft, timelines: draft.timelines.filter(t => input.timelineIds!.includes(t.id)), stateMachines: [] } : draft, timeMs) }
}
