// ── State Machine AI action tests ─────────────────────────────────────────────
import { describe, it, expect, beforeEach } from 'vitest'
import { ActionRegistry } from '../../ActionRegistry'
import { registerStateMachineActions } from '../statemachine'
import { StateMachineRuntime } from '@/lib/statemachine/StateMachineRuntime'
import { emptyScene, newTimeline } from '@/lib/defaults'
import type { ChronoScene } from '@/lib/types'

/** Apply an action's toCommand against a working scene (mirrors PlannerExecutor). */
function run(reg: ActionRegistry, scene: ChronoScene, tool: string, params: Record<string, unknown>): ChronoScene {
  const def = reg.get(tool)
  if (!def?.toCommand) throw new Error(`no toCommand for ${tool}`)
  const cmd = def.toCommand(params, scene)
  if (!cmd) return scene
  if (cmd.label.startsWith('AI ERROR')) throw new Error(cmd.label)
  return cmd.execute(scene)
}

function sceneWith4Timelines(): ChronoScene {
  const s = emptyScene()
  s.timelines = ['spring', 'summer', 'fall', 'winter'].map((id) => ({ ...newTimeline(), id }))
  return s
}

describe('AI state machine actions', () => {
  let reg: ActionRegistry
  beforeEach(() => {
    reg = new ActionRegistry()
    registerStateMachineActions(reg)
  })

  it('builds a 4-state cyclic machine and runs it', () => {
    let scene = sceneWith4Timelines()
    scene = run(reg, scene, 'create_state_machine', { id: 'seasons', name: 'Seasons' })
    for (const s of ['spring', 'summer', 'fall', 'winter']) {
      scene = run(reg, scene, 'add_sm_state', { smId: 'seasons', id: s, name: s, timelineId: s })
    }
    const cycle = [['spring', 'summer'], ['summer', 'fall'], ['fall', 'winter'], ['winter', 'spring']]
    for (const [from, to] of cycle) {
      scene = run(reg, scene, 'add_sm_transition', { smId: 'seasons', from, to, event: 'next' })
    }

    const sm = scene.stateMachines![0]
    expect(sm.states).toHaveLength(4)
    expect(sm.transitions).toHaveLength(4)
    // First-added state auto-becomes initial.
    expect(sm.initialStateId).toBe('spring')

    // Runtime parity: dispatching 'next' walks the cycle.
    const rt = new StateMachineRuntime(sm)
    const noParam = () => 0
    expect(rt.currentStateId).toBe('spring')
    rt.dispatch('next', noParam, 0); expect(rt.currentStateId).toBe('summer')
    rt.dispatch('next', noParam, 0); expect(rt.currentStateId).toBe('fall')
    rt.dispatch('next', noParam, 0); expect(rt.currentStateId).toBe('winter')
    rt.dispatch('next', noParam, 0); expect(rt.currentStateId).toBe('spring')
  })

  it('set_initial_state overrides the auto-initial', () => {
    let scene = sceneWith4Timelines()
    scene = run(reg, scene, 'create_state_machine', { id: 'sm', name: 'M' })
    scene = run(reg, scene, 'add_sm_state', { smId: 'sm', id: 'a', name: 'A', timelineId: 'spring' })
    scene = run(reg, scene, 'add_sm_state', { smId: 'sm', id: 'b', name: 'B', timelineId: 'summer' })
    scene = run(reg, scene, 'set_initial_state', { smId: 'sm', stateId: 'b' })
    expect(scene.stateMachines![0].initialStateId).toBe('b')
  })

  it('supports guard transitions with coerced values', () => {
    let scene = sceneWith4Timelines()
    scene = run(reg, scene, 'create_state_machine', { id: 'sm' })
    scene = run(reg, scene, 'add_sm_state', { smId: 'sm', id: 'idle', name: 'Idle', timelineId: 'spring' })
    scene = run(reg, scene, 'add_sm_state', { smId: 'sm', id: 'run', name: 'Run', timelineId: 'summer' })
    scene = run(reg, scene, 'add_sm_transition', {
      smId: 'sm', from: 'idle', to: 'run', guardParam: 'speed', guardOp: '>', guardValue: '5',
    })
    const t = scene.stateMachines![0].transitions[0]
    expect(t.guard).toEqual({ param: 'speed', op: '>', value: 5 })
  })

  it('rejects a state pointing at a missing timeline', () => {
    let scene = emptyScene()
    scene = run(reg, scene, 'create_state_machine', { id: 'sm' })
    expect(() =>
      run(reg, scene, 'add_sm_state', { smId: 'sm', id: 'x', name: 'X', timelineId: 'nope' }),
    ).toThrow(/timeline "nope" not found/)
  })
})
