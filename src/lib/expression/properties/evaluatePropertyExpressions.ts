import type { ChronoScene, ParameterWire } from '../../types'
import { computeLocalTime, type ExternalTimelineTime, type OverrideMap } from '../../evaluator'
import type { ParamValueMap } from '../../runtime/paramResolver'
import { evaluateParameterWiresVerbose, type WireEvaluationResult } from '../../runtime/parameterWireEvaluator'
import { paramRefKey } from '../../wiring/helpers'
import { readWireSource } from '../../wiring/WireSource'
import { readPropertyExpressionSource } from './PropertyExpressionSources'
import { evaluateWireExpression } from '../../wiring/WireExpression'
import { expressionPrograms } from '../../core/expression/ExpressionProgramCache'
import { evaluateTypedExpression, type ExpressionValue } from '../../core/expression/expressionEvaluator'
import { validatePropertyExpressionValue } from './PropertyExpressionValue'
import { interpolateAnimatableValues } from '../../animation/typedValues'
import { EXPRESSION_CONSTANTS } from './PropertyExpression'
import { preparePropertyExpressionPlan, type PropertyExpressionEntry, type PropertyExpressionPlan } from './PropertyExpressionPlan'
import { propertyPathsOverlap } from '../../scene/properties/propertyPathsOverlap'

export interface ExpressionClock {
  readonly globalTimeMs: number
  readonly externalTime?: ExternalTimelineTime | null
  /** Active state-machine timeline clocks, in local ms, take precedence. */
  readonly timelineTimes?: ReadonlyMap<string, number>
  /** SM-owned timeline contribution: 0 inactive, 1 active, fractional in blend. */
  readonly timelineWeights?: ReadonlyMap<string, number>
}
export interface SceneDriverResult extends WireEvaluationResult {
  readonly expressionErrors: ReadonlyMap<string, string>
}

/** Weak, source-identity plan owner. Programs use the shared bounded parser
 * cache; scene/history payloads contain neither plans nor output frames. The
 * graph is rebuilt on any immutable source replacement, never per input/RAF.
 * One default instance is safe across documents because all source keys are
 * weak; clear releases plans explicitly for tests/plugin/lifecycle resets. */
export class PropertyExpressionEvaluator {
  private plans = new WeakMap<ChronoScene, PropertyExpressionPlan>()
  /** Forget borrowed source plans; no pending tasks or worker callbacks exist. */
  clear(): void { this.plans = new WeakMap() }

  /** Evaluate bindings' pre-wire frame through a jointly ordered driver graph.
   * Legacy Wire→Wire reads retain their original pre-wire snapshot semantics.
   * New expression→Wire reads use the expression's current output; expression
   * sources use ordered outputs from both families. Cycles and failed upstream
   * nodes propagate diagnostics and keep the pre-driver fallback. Source is
   * never changed. No-op paths preserve the supplied map identity. */
  evaluate(scene: ChronoScene, before: OverrideMap, params: ParamValueMap, clock: ExpressionClock): SceneDriverResult {
    let plan = this.plans.get(scene)
    if (!plan) { plan = preparePropertyExpressionPlan(scene); this.plans.set(scene, plan) }
    if (!plan.expressions.size || plan.error) {
      const wire = evaluateParameterWiresVerbose(scene.parameterWires, before, params, scene)
      return { ...wire, expressionErrors: new Map(plan.error ? [['scene', plan.error]] : []) }
    }
    const expressionErrors = new Map<string, string>(), errors = new Map<string, string>()
    const brokenWireIds = new Set<string>(), runtimeErrorIds = new Set<string>(), cycleWireIds = new Set<string>()
    const failed = new Set<string>()
    let next = before
    const put = (key: string, value: ExpressionValue) => { if (next === before) next = new Map(before); next.set(key, value) }
    const wireError = (wire: ParameterWire, message: string, broken = false) => {
      errors.set(wire.id, message); (broken ? brokenWireIds : runtimeErrorIds).add(wire.id)
    }
    for (const key of Array.from(plan.blocked)) {
      failed.add(key)
      if (plan.expressions.has(key)) expressionErrors.set(key, 'Expression is cyclic or depends on a cycle; keeping the pre-driver value.')
      for (const wire of plan.wires.get(key) ?? []) { cycleWireIds.add(wire.id); errors.set(wire.id, 'Wire is cyclic or depends on a cycle; keeping the pre-driver value.') }
    }
    for (const key of plan.order) {
      for (const wire of plan.wires.get(key) ?? []) {
        const sourceKey = paramRefKey(wire.source), liveSource = Array.from(plan.expressions.keys()).some(key => propertyPathsOverlap(key, sourceKey))
        if (liveSource && Array.from(failed).some(key => propertyPathsOverlap(key, sourceKey))) { failed.add(key); wireError(wire, 'Source expression failed; keeping the pre-driver value.'); continue }
        let source: number | null
        try {
          const typed = liveSource ? readPropertyExpressionSource(wire.source, next, params, plan.resolvedIndex!) : null
          source = liveSource ? typeof typed === 'number' ? typed : typeof typed === 'boolean' ? +typed : null : readWireSource(wire.source, before, params, plan.index!)
        } catch { source = null }
        if (source === null) { failed.add(key); wireError(wire, 'Source has no finite numeric value; keeping the pre-driver value.', true); continue }
        try { put(key, evaluateWireExpression(wire, source)); failed.delete(key) }
        catch (error) { failed.add(key); wireError(wire, message(error)) }
      }
      const entry = plan.expressions.get(key)
      if (!entry) continue
      try {
        const weight = clock.timelineWeights?.get(entry.definition.timelineId) ?? 1
        if (!Number.isFinite(weight) || weight < 0 || weight > 1) throw new Error('Invalid state-machine expression weight.')
        if (weight === 0) continue
        assertUncontested(scene, plan, entry)
        const timeline = scene.timelines.find(item => item.id === entry.definition.timelineId)
        if (!timeline) throw new Error('Expression timeline is missing; keeping the authored value.')
        if (!Number.isFinite(clock.globalTimeMs)) throw new Error('Expression clock must be finite.')
        const local = clock.timelineTimes?.get(timeline.id) ?? (clock.externalTime?.timelineId === timeline.id ? clock.externalTime.localTimeMs : computeLocalTime(timeline, clock.globalTimeMs))
        if (!Number.isFinite(local)) throw new Error('Expression local clock must be finite.')
        const timeMs = Math.max(0, Math.min(timeline.durationMs, local - (entry.definition.timeOffsetMs ?? 0)))
        const context: Record<string, ExpressionValue> = { ...EXPRESSION_CONSTANTS, timeMs, timeSec: timeMs / 1000, timeNormalized: timeline.durationMs > 0 ? timeMs / timeline.durationMs : 0 }
        for (const [name, ref] of Object.entries(entry.definition.sources)) {
          Object.defineProperty(context, name, { enumerable: true, get() {
            if (Array.from(failed).some(key => propertyPathsOverlap(key, paramRefKey(ref)))) throw new Error('A source driver failed; keeping the pre-driver value.')
            return readPropertyExpressionSource(ref, next, params, plan.resolvedIndex!)
          } })
        }
        const program = expressionPrograms.get(entry.definition.formula)
        if (!program.ast) throw new Error(program.error ?? 'Invalid expression')
        const output = evaluateTypedExpression(program.ast, context)
        let value = validatePropertyExpressionValue(entry.layer, entry.path, entry.definition.resultType, output, 'live', entry.definition)
        if (weight < 1) {
          const fallback = readPropertyExpressionSource({ layerId: entry.layer.id, propertyPath: entry.path, valueType: entry.definition.resultType }, before, params, plan.resolvedIndex!)
          value = interpolateAnimatableValues(fallback, value, weight, key)
        }
        put(key, value); failed.delete(key)
      } catch (error) { expressionErrors.set(key, message(error)); failed.add(key) }
    }
    return { overrides: next, errors, expressionErrors, brokenWireIds, runtimeErrorIds, cycleWireIds }
  }
}

/** Imported/agent edits cannot silently make a live expression replace existing
 * keys, bindings, path motion or a legacy Wire target. Locks are editor-only and
 * do not disable playback. No source repair/removal happens during evaluation. */
function assertUncontested(scene: ChronoScene, plan: PropertyExpressionPlan, entry: PropertyExpressionEntry): void {
  const { layer, path, key } = entry
  if (Array.from(plan.animated).some(target => propertyPathsOverlap(target, key)) || Array.from(plan.wires.keys()).some(target => propertyPathsOverlap(target, key)) || Object.keys(layer.paramBindings ?? {}).some(target => propertyPathsOverlap(target, path))
    || scene.bindings.some(binding => binding.target.type === 'layerProperty' && binding.target.layerId === layer.id && propertyPathsOverlap(binding.target.property, path))
    || layer.followPath && ['transform.x', 'transform.y', ...(layer.followPath.orientToPath ? ['transform.rotationDeg'] : [])].includes(path)
    || layer.motionPath && ['transform.x', 'transform.y', 'transform.rotationDeg'].includes(path)) throw new Error('An existing animation/binding/path/Wire owns this channel; keeping its value.')
  if (layer.inputExpressions?.fields[path]) throw new Error('A constant formula also owns this channel; resolve the conflict explicitly.')
}
/** Stable diagnostics from parser/domain failures; no exception escapes a frame. */
function message(error: unknown): string { return error instanceof Error ? error.message : String(error) }

/** Shared stateless-with-respect-to-time evaluator; source plans remain weak. */
export const propertyExpressionEvaluator = new PropertyExpressionEvaluator()
