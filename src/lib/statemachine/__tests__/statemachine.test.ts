import { describe, it, expect } from 'vitest'
import type { StateMachineDefinition, SMGuard } from '../../types'
import { evaluateGuard, type ParamLookup } from '../guard'
import { resolveTransition } from '../resolver'
import { blendOverrides } from '../blend'
import { StateMachineRuntime } from '../StateMachineRuntime'
import type { OverrideMap } from '../../evaluator'

// ── Helpers ───────────────────────────────────────────────────────────────────

const lookup = (vals: Record<string, number | string | boolean>): ParamLookup =>
  (name) => vals[name]

const machine = (): StateMachineDefinition => ({
  id: 'sm1', name: 'Button',
  initialStateId: 'idle',
  states: [
    { id: 'idle',  name: 'idle',  timelineId: 'tl-idle' },
    { id: 'hover', name: 'hover', timelineId: 'tl-hover' },
    { id: 'press', name: 'press', timelineId: 'tl-press' },
  ],
  transitions: [
    { id: 't1', from: 'idle',  to: 'hover', trigger: 'hover' },
    { id: 't2', from: 'hover', to: 'idle',  trigger: 'leave' },
    { id: 't3', from: 'hover', to: 'press', trigger: 'click' },
    { id: 't4', from: '*',     to: 'idle',  trigger: 'reset' },
  ],
})

// ── Guard evaluator ────────────────────────────────────────────────────────────

describe('evaluateGuard', () => {
  it('numeric comparisons', () => {
    const get = lookup({ progress: 0.7 })
    expect(evaluateGuard({ param: 'progress', op: '>', value: 0.5 }, get)).toBe(true)
    expect(evaluateGuard({ param: 'progress', op: '<', value: 0.5 }, get)).toBe(false)
    expect(evaluateGuard({ param: 'progress', op: '>', value: 0.7 }, get)).toBe(false)
  })

  it('equality with numeric coercion', () => {
    const get = lookup({ level: 3 })
    expect(evaluateGuard({ param: 'level', op: '==', value: 3 }, get)).toBe(true)
    expect(evaluateGuard({ param: 'level', op: '!=', value: 2 }, get)).toBe(true)
  })

  it('boolean and string equality', () => {
    const get = lookup({ on: true, mode: 'night' })
    expect(evaluateGuard({ param: 'on', op: '==', value: true }, get)).toBe(true)
    expect(evaluateGuard({ param: 'mode', op: '==', value: 'night' }, get)).toBe(true)
    expect(evaluateGuard({ param: 'mode', op: '!=', value: 'day' }, get)).toBe(true)
  })

  it('missing parameter never passes', () => {
    const get = lookup({})
    const g: SMGuard = { param: 'absent', op: '>', value: 0 }
    expect(evaluateGuard(g, get)).toBe(false)
  })
})

// ── Resolver ────────────────────────────────────────────────────────────────────

describe('resolveTransition', () => {
  const get = lookup({})

  it('matches event from current state', () => {
    const t = resolveTransition(machine(), 'idle', 'hover', get)
    expect(t?.id).toBe('t1')
  })

  it('ignores events that do not apply to the current state', () => {
    expect(resolveTransition(machine(), 'idle', 'click', get)).toBeNull()
  })

  it('wildcard from matches any state', () => {
    expect(resolveTransition(machine(), 'press', 'reset', get)?.id).toBe('t4')
    expect(resolveTransition(machine(), 'hover', 'reset', get)?.id).toBe('t4')
  })

  it('guard-only tick ignores event-bearing transitions', () => {
    // event=null and all transitions have triggers → nothing fires
    expect(resolveTransition(machine(), 'idle', null, get)).toBeNull()
  })

  it('an unconfigured transition (no trigger, no guard) never auto-fires', () => {
    const sm: StateMachineDefinition = {
      id: 's', name: 'm', initialStateId: 'a',
      states: [
        { id: 'a', name: 'a', timelineId: 'tl-a' },
        { id: 'b', name: 'b', timelineId: 'tl-b' },
      ],
      // freshly drawn drag-to-connect edge: no trigger, no guard
      transitions: [{ id: 'e', from: 'a', to: 'b' }],
    }
    // guard-only tick must NOT fire it
    expect(resolveTransition(sm, 'a', null, get)).toBeNull()
    // and it can't be reached by an event either (no trigger to match)
    expect(resolveTransition(sm, 'a', 'anything', get)).toBeNull()
  })

  it('guard filters event transitions', () => {
    const sm = machine()
    sm.transitions.push({ id: 'g', from: 'idle', to: 'press', trigger: 'hover', guard: { param: 'armed', op: '==', value: true } })
    // 'hover' from idle now has two candidates: t1 (no guard) and g (guard).
    // With armed=false, g fails → t1 wins.
    expect(resolveTransition(sm, 'idle', 'hover', lookup({ armed: false }))?.id).toBe('t1')
    // With armed=true both eligible → higher priority wins; give g priority.
    sm.transitions.find((x) => x.id === 'g')!.priority = 10
    expect(resolveTransition(sm, 'idle', 'hover', lookup({ armed: true }))?.id).toBe('g')
  })

  it('guard-only transition fires on threshold', () => {
    const sm: StateMachineDefinition = {
      id: 's', name: 'seasons', initialStateId: 'summer',
      states: [
        { id: 'summer', name: 'summer', timelineId: 'tl-s' },
        { id: 'autumn', name: 'autumn', timelineId: 'tl-a' },
      ],
      transitions: [
        { id: 'x', from: 'summer', to: 'autumn', guard: { param: 'progress', op: '>', value: 0.25 } },
      ],
    }
    expect(resolveTransition(sm, 'summer', null, lookup({ progress: 0.1 }))).toBeNull()
    expect(resolveTransition(sm, 'summer', null, lookup({ progress: 0.3 }))?.id).toBe('x')
  })
})

// ── Blend ────────────────────────────────────────────────────────────────────────

describe('blendOverrides', () => {
  const from: OverrideMap = new Map([['a', 0], ['b', 100]])
  const to: OverrideMap   = new Map([['a', 10], ['c', 50]])

  it('alpha 0 returns from, alpha 1 returns to (identity fast-paths)', () => {
    expect(blendOverrides(from, to, 0)).toBe(from)
    expect(blendOverrides(from, to, 1)).toBe(to)
  })

  it('lerps shared keys; keeps unique keys', () => {
    const out = blendOverrides(from, to, 0.5)
    expect(out.get('a')).toBe(5)   // 0 → 10 at 50%
    expect(out.get('b')).toBe(100) // only in from → unchanged
    expect(out.get('c')).toBe(50)  // only in to → its own value
  })

  it('clamps out-of-range alpha', () => {
    expect(blendOverrides(from, to, -1)).toBe(from)
    expect(blendOverrides(from, to, 2)).toBe(to)
  })
})

// ── Runtime ────────────────────────────────────────────────────────────────────

describe('StateMachineRuntime', () => {
  const get = lookup({})

  it('starts in the initial state', () => {
    const rt = new StateMachineRuntime(machine())
    expect(rt.currentStateId).toBe('idle')
    expect(rt.activeTimelineId).toBe('tl-idle')
  })

  it('dispatch advances state on matching event', () => {
    const rt = new StateMachineRuntime(machine())
    rt.dispatch('hover', get, 0)
    expect(rt.currentStateId).toBe('hover')
    rt.dispatch('click', get, 0)
    expect(rt.currentStateId).toBe('press')
  })

  it('dispatch is a no-op for non-matching events', () => {
    const rt = new StateMachineRuntime(machine())
    rt.dispatch('click', get, 0) // not valid from idle
    expect(rt.currentStateId).toBe('idle')
  })

  it('ownsTimeline reflects state timelines', () => {
    const rt = new StateMachineRuntime(machine())
    expect(rt.ownsTimeline('tl-hover')).toBe(true)
    expect(rt.ownsTimeline('tl-unknown')).toBe(false)
  })

  it('blend runs over its duration then clears', () => {
    const sm = machine()
    sm.transitions[0].blendMs = 200 // idle→hover blends 200ms
    const rt = new StateMachineRuntime(sm)
    rt.dispatch('hover', get, 1000) // wall=1000
    expect(rt.currentStateId).toBe('hover')
    let b = rt.getBlend(1000)
    expect(b).not.toBeNull()
    expect(b!.fromTimelineId).toBe('tl-idle')
    expect(b!.toTimelineId).toBe('tl-hover')
    expect(b!.alpha).toBeCloseTo(0)
    b = rt.getBlend(1100) // halfway
    expect(b!.alpha).toBeCloseTo(0.5)
    expect(rt.getBlend(1200)).toBeNull() // complete → cleared
    expect(rt.getBlend(1300)).toBeNull()
  })

  it('no blend when blendMs is 0 (hard cut)', () => {
    const rt = new StateMachineRuntime(machine())
    rt.dispatch('hover', get, 0)
    expect(rt.getBlend(0)).toBeNull()
  })

  it('tickGuards auto-fires guard-only transitions', () => {
    const sm: StateMachineDefinition = {
      id: 's', name: 'seasons', initialStateId: 'summer',
      states: [
        { id: 'summer', name: 'summer', timelineId: 'tl-s' },
        { id: 'autumn', name: 'autumn', timelineId: 'tl-a' },
      ],
      transitions: [
        { id: 'x', from: 'summer', to: 'autumn', guard: { param: 'progress', op: '>', value: 0.25 } },
      ],
    }
    const rt = new StateMachineRuntime(sm)
    rt.tickGuards(lookup({ progress: 0.1 }), 0)
    expect(rt.currentStateId).toBe('summer')
    rt.tickGuards(lookup({ progress: 0.4 }), 0)
    expect(rt.currentStateId).toBe('autumn')
  })

  it('fires exit then entry actions on transition', () => {
    const sm = machine()
    sm.states[0].exitActions  = [{ type: 'emitEvent', event: 'leftIdle' }]
    sm.states[1].entryActions = [{ type: 'setParam', param: 'hovered', value: true }]
    const rt = new StateMachineRuntime(sm)
    const actions = rt.dispatch('hover', get, 0)
    expect(actions).toEqual([
      { type: 'emitEvent', event: 'leftIdle' },
      { type: 'setParam', param: 'hovered', value: true },
    ])
  })

  it('sync preserves current state when it still exists', () => {
    const rt = new StateMachineRuntime(machine())
    rt.dispatch('hover', get, 0)
    expect(rt.currentStateId).toBe('hover')
    rt.sync(machine()) // new definition object, same states
    expect(rt.currentStateId).toBe('hover')
  })

  it('sync resets when current state was removed', () => {
    const rt = new StateMachineRuntime(machine())
    rt.dispatch('hover', get, 0)
    const trimmed = machine()
    trimmed.states = trimmed.states.filter((s) => s.id !== 'hover')
    rt.sync(trimmed)
    expect(rt.currentStateId).toBe('idle') // back to initial
  })
})
