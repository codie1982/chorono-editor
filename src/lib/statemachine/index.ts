// ── State Machine runtime barrel (BL-09) ────────────────────────────────────

export { evaluateGuard, type ParamLookup } from './guard'
export { resolveTransition } from './resolver'
export { blendOverrides } from './blend'
export {
  StateMachineRuntime,
  type ActiveBlend, type SMRuntimeEvent, type SMRuntimeEventType,
} from './StateMachineRuntime'
