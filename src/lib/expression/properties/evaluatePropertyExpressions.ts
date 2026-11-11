import type { ChronoScene, ParameterWire } from '../../types'
import { computeLocalTime, type ExternalTimelineTime, type OverrideMap } from '../../evaluator'
import type { ParamValueMap } from '../../runtime/paramResolver'
import { evaluateParameterWiresVerbose, type WireEvaluationResult } from '../../runtime/parameterWireEvaluator'
import { paramRefKey } from '../../wiring/helpers'
import { readReferencedValue, readWireSource } from '../../wiring/WireSource'
import { evaluateWireExpression } from '../../wiring/WireExpression'
import { expressionPrograms } from '../../core/expression/ExpressionProgramCache'
import { evaluateExpression } from '../../core/expression/expressionEvaluator'
import { checkNumericResult } from '../../core/expression/NumericResult'
import { numericPropertyConstraints } from './NumericPropertyCapability'
import { EXPRESSION_CONSTANTS } from './PropertyExpression'
import { preparePropertyExpressionPlan, type PropertyExpressionEntry, type PropertyExpressionPlan } from './PropertyExpressionPlan'
import { readPropertyPath } from '../../scene/properties/readPropertyPath'

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
    const put = (key: string, value: number) => { if (next === before) next = new Map(before); next.set(key, value) }
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
        const sourceKey = paramRefKey(wire.source), liveSource = plan.expressions.has(sourceKey)
        if (liveSource && failed.has(sourceKey)) { failed.add(key); wireError(wire, 'Source expression failed; keeping the pre-driver value.'); continue }
        const source = readWireSource(wire.source, liveSource ? next : before, params, plan.index!)
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
        const context: Record<string, number> = { ...EXPRESSION_CONSTANTS, timeMs, timeSec: timeMs / 1000, timeNormalized: timeline.durationMs > 0 ? timeMs / timeline.durationMs : 0 }
        for (const [name, ref] of Object.entries(entry.definition.sources)) {
          if (failed.has(paramRefKey(ref))) throw new Error('A source driver failed; keeping the pre-driver value.')
          const value = readReferencedValue(ref, next, params, plan.resolvedIndex!)
          if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Source ' + name + ' has no finite numeric value.')
          Object.defineProperty(context, name, { value, enumerable: true })
        }
        const program = expressionPrograms.get(entry.definition.formula)
        if (!program.ast) throw new Error(program.error ?? 'Invalid expression')
        const schema = numericPropertyConstraints(entry.layer, entry.path)
        const result = checkNumericResult(evaluateExpression(program.ast, context), {
          min: Math.max(schema.min ?? -Infinity, entry.definition.min ?? -Infinity), max: Math.min(schema.max ?? Infinity, entry.definition.max ?? Infinity),
        })
        if (result.error) throw new Error(result.error)
        let value = result.value!
        if (weight < 1) {
          const fallback = before.get(key) ?? readPropertyPath(entry.layer, entry.path)
          if (typeof fallback !== 'number' || !Number.isFinite(fallback)) throw new Error('Expression blending needs a finite authored fallback.')
          value = fallback + (value - fallback) * weight
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
  if (plan.animated.has(key) || plan.wires.has(key) || layer.paramBindings?.[path]
    || scene.bindings.some(binding => binding.target.type === 'layerProperty' && binding.target.layerId === layer.id && binding.target.property === path)
    || layer.followPath && ['transform.x', 'transform.y', ...(layer.followPath.orientToPath ? ['transform.rotationDeg'] : [])].includes(path)
    || layer.motionPath && ['transform.x', 'transform.y', 'transform.rotationDeg'].includes(path)) throw new Error('An existing animation/binding/path/Wire owns this channel; keeping its value.')
  if (layer.inputExpressions?.fields[path]) throw new Error('A constant formula also owns this channel; resolve the conflict explicitly.')
}
/** Stable diagnostics from parser/domain failures; no exception escapes a frame. */
function message(error: unknown): string { return error instanceof Error ? error.message : String(error) }

/** Shared stateless-with-respect-to-time evaluator; source plans remain weak. */
export const propertyExpressionEvaluator = new PropertyExpressionEvaluator()
