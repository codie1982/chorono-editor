import { describe, it, expect } from 'vitest'
import type { ChronoScene, StateMachineDefinition, ChronoSMState, BaseSMTransition } from '../types'
import {
  makeCreateSMCmd, makeDeleteSMCmd,
  makeAddSMStateCmd, makeDeleteSMStateCmd, makeUpdateSMStateCmd,
  makeAddSMTransitionCmd, makeDeleteSMTransitionCmd, makeSetInitialStateCmd,
} from './commands-statemachine'

// Minimal fake scene — only the fields the commands touch
const baseScene: ChronoScene = {
  formatVersion: '1.0.0',
  composition: { id: 'c', width: 100, height: 100, durationMs: 1000, frameRate: 60, backgroundColor: '#000' },
  assets: [], layers: [], timelines: [],
  parameters: [], triggers: [], bindings: [],
  initialState: {},
} as unknown as ChronoScene

const sm = (over: Partial<StateMachineDefinition> = {}): StateMachineDefinition => ({
  id: 'sm1', name: 'M', initialStateId: 's1',
  states: [{ id: 's1', name: 'idle', timelineId: 'tl1' }],
  transitions: [],
  ...over,
})

const sceneWith = (machine: StateMachineDefinition): ChronoScene => ({
  ...baseScene,
  stateMachines: [machine],
})

describe('SM commands — create / delete machine', () => {
  it('create adds an SM plus a backing timeline; undo removes both', () => {
    const cmd = makeCreateSMCmd('Test')
    const next = cmd.execute(baseScene)
    expect(next.stateMachines).toHaveLength(1)
    expect(next.timelines).toHaveLength(1)
    // initial state references the new timeline
    const created = next.stateMachines![0]
    expect(created.states[0].timelineId).toBe(next.timelines[0].id)
    expect(created.initialStateId).toBe(created.states[0].id)

    const back = cmd.undo(next)
    expect(back.stateMachines).toHaveLength(0)
    expect(back.timelines).toHaveLength(0)
  })

  it('delete removes the SM; undo restores it intact', () => {
    const m = sm()
    const scene = sceneWith(m)
    const cmd = makeDeleteSMCmd(m)
    const next = cmd.execute(scene)
    expect(next.stateMachines).toHaveLength(0)
    const back = cmd.undo(next)
    expect(back.stateMachines).toEqual([m])
  })
})

describe('SM commands — states', () => {
  it('add state; undo removes it', () => {
    const scene = sceneWith(sm())
    const st: ChronoSMState = { id: 's2', name: 'hover', timelineId: 'tl2' }
    const cmd = makeAddSMStateCmd('sm1', st)
    const next = cmd.execute(scene)
    expect(next.stateMachines![0].states.map((s) => s.id)).toEqual(['s1', 's2'])
    const back = cmd.undo(next)
    expect(back.stateMachines![0].states.map((s) => s.id)).toEqual(['s1'])
  })

  it('delete state also removes referencing transitions; undo restores both', () => {
    const t: BaseSMTransition = { id: 't1', from: 's1', to: 's2', trigger: 'hover' }
    const m = sm({
      states: [
        { id: 's1', name: 'idle', timelineId: 'tl1' },
        { id: 's2', name: 'hover', timelineId: 'tl2' },
      ],
      transitions: [t],
    })
    const scene = sceneWith(m)
    const cmd = makeDeleteSMStateCmd('sm1', 's2')
    const next = cmd.execute(scene)
    expect(next.stateMachines![0].states.map((s) => s.id)).toEqual(['s1'])
    expect(next.stateMachines![0].transitions).toHaveLength(0)
    const back = cmd.undo(next)
    expect(back.stateMachines![0].states.map((s) => s.id)).toEqual(['s1', 's2'])
    expect(back.stateMachines![0].transitions).toEqual([t])
  })

  it('update state patches fields; undo restores previous values only', () => {
    const m = sm({ states: [{ id: 's1', name: 'idle', timelineId: 'tl1', speed: 1 }] })
    const scene = sceneWith(m)
    const cmd = makeUpdateSMStateCmd('sm1', 's1', { name: 'IDLE', speed: 2 })
    const next = cmd.execute(scene)
    const after = next.stateMachines![0].states[0]
    expect(after.name).toBe('IDLE')
    expect(after.speed).toBe(2)
    expect(after.timelineId).toBe('tl1') // untouched
    const back = cmd.undo(next)
    const restored = back.stateMachines![0].states[0]
    expect(restored.name).toBe('idle')
    expect(restored.speed).toBe(1)
  })
})

describe('SM commands — transitions & initial state', () => {
  it('add / delete transition round-trips', () => {
    const scene = sceneWith(sm())
    const t: BaseSMTransition = { id: 't1', from: 's1', to: 's1', trigger: 'loop' }
    const added = makeAddSMTransitionCmd('sm1', t).execute(scene)
    expect(added.stateMachines![0].transitions).toEqual([t])

    const delCmd = makeDeleteSMTransitionCmd('sm1', 't1')
    const removed = delCmd.execute(added)
    expect(removed.stateMachines![0].transitions).toHaveLength(0)
    const back = delCmd.undo(removed)
    expect(back.stateMachines![0].transitions).toEqual([t])
  })

  it('set initial state; undo restores previous', () => {
    const m = sm({
      states: [
        { id: 's1', name: 'idle', timelineId: 'tl1' },
        { id: 's2', name: 'hover', timelineId: 'tl2' },
      ],
      initialStateId: 's1',
    })
    const cmd = makeSetInitialStateCmd('sm1', 's2')
    const next = cmd.execute(sceneWith(m))
    expect(next.stateMachines![0].initialStateId).toBe('s2')
    const back = cmd.undo(next)
    expect(back.stateMachines![0].initialStateId).toBe('s1')
  })
})
