import { SimulationClock } from '@/lib/simulation/SimulationClock'
import type {
  FractureBondDamageReset,
  FractureBondForcedBreak,
  FractureBondGraph,
} from '@/lib/types/fractureCluster'

export interface FractureBondActionScheduleInput {
  readonly forcedBreaks?: readonly FractureBondForcedBreak[]
  readonly damageResets?: readonly FractureBondDamageReset[]
}

export interface FractureBondActionScheduleResult {
  readonly forcedBreaks: readonly FractureBondForcedBreak[]
  readonly damageResets: readonly FractureBondDamageReset[]
}

/**
 * Validates and canonicalizes editor-authored bond actions for one bake clock.
 *
 * Times are simulation-local milliseconds and must land on an interior fixed
 * tick. A schedule may precede an impact-triggered topology event; in that
 * case the runtime applies the overdue action immediately after activation.
 * Instances are stateless and returned records are detached immutable values.
 */
export class FractureBondActionSchedule {
  compile(
    graph: FractureBondGraph,
    clock: SimulationClock,
    input: FractureBondActionScheduleInput,
  ): FractureBondActionScheduleResult {
    const bondIds = new Set(graph.bonds.map(bond => bond.bondId))
    const forcedKeys = new Set<string>()
    const forcedBreaks = (input.forcedBreaks ?? []).map(action => {
      validateAction(action, clock, bondIds)
      const key = `${action.timeMs}\u001f${action.bondId}`
      if (forcedKeys.has(key)) throw new Error('Fracture forced bond break is duplicated')
      forcedKeys.add(key)
      return Object.freeze({ ...action })
    }).sort(compareBondActions)
    const resetKeys = new Set<string>()
    const damageResets = (input.damageResets ?? []).map(action => {
      validateAction(action, clock, bondIds)
      const key = `${action.timeMs}\u001f${action.bondId ?? '*'}`
      if (resetKeys.has(key)) throw new Error('Fracture bond damage reset is duplicated')
      resetKeys.add(key)
      return Object.freeze({ ...action })
    }).sort(compareBondActions)
    return Object.freeze({
      forcedBreaks: Object.freeze(forcedBreaks),
      damageResets: Object.freeze(damageResets),
    })
  }
}

function validateAction(
  action: FractureBondForcedBreak | FractureBondDamageReset,
  clock: SimulationClock,
  bondIds: ReadonlySet<string>,
): void {
  if (!['timeline', 'user'].includes(action.source)
    || (action.bondId !== undefined && !bondIds.has(action.bondId))) {
    throw new Error('Fracture bond action target is invalid')
  }
  const rawTick = action.timeMs * clock.stepHz / 1000
  const tick = Math.round(rawTick)
  if (!Number.isFinite(action.timeMs) || !Number.isSafeInteger(tick)
    || Math.abs(rawTick - tick) > 1e-7 || tick < 1 || tick >= clock.totalTicks) {
    throw new RangeError('Fracture bond action time must align to an interior fixed-step tick')
  }
}

function compareBondActions(
  left: FractureBondForcedBreak | FractureBondDamageReset,
  right: FractureBondForcedBreak | FractureBondDamageReset,
): number {
  return left.timeMs - right.timeMs
    || (left.bondId ?? '').localeCompare(right.bondId ?? '')
    || left.source.localeCompare(right.source)
}
