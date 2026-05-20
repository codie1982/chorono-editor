import { describe, it, expect } from 'vitest'
import { exportToRuntime } from './runtimeExport'
import type { ChronoScene, StateMachineDefinition } from '../types'

const sceneBase: ChronoScene = {
  formatVersion: '1.0.0',
  composition: { id: 'c', width: 100, height: 100, durationMs: 1000, frameRate: 60, backgroundColor: '#000' },
  assets: [], layers: [], timelines: [],
  parameters: [], triggers: [], bindings: [],
  initialState: {},
} as unknown as ChronoScene

const machine = (): StateMachineDefinition => ({
  id: 'sm1', name: 'Button', initialStateId: 'idle',
  states: [
    { id: 'idle',  name: 'idle',  timelineId: 'tl1', x: 120, y: 80 },
    { id: 'hover', name: 'hover', timelineId: 'tl2', x: 320, y: 80 },
  ],
  transitions: [
    { id: 't1', from: 'idle', to: 'hover', trigger: 'hover', blendMs: 150 },
  ],
})

describe('exportToRuntime — state machines (BL-09)', () => {
  it('omits the field entirely when the scene has no machines', () => {
    const out = exportToRuntime(sceneBase)
    expect('stateMachines' in out).toBe(false)
  })

  it('carries machines through and strips editor x/y from states', () => {
    const out = exportToRuntime({ ...sceneBase, stateMachines: [machine()] })
    expect(out.stateMachines).toHaveLength(1)
    const sm = out.stateMachines![0]
    expect(sm.transitions[0]).toEqual({ id: 't1', from: 'idle', to: 'hover', trigger: 'hover', blendMs: 150 })
    for (const s of sm.states) {
      expect('x' in s).toBe(false)
      expect('y' in s).toBe(false)
      expect(s.timelineId).toBeTruthy() // runtime-relevant fields preserved
    }
  })

  it('does not mutate the source scene', () => {
    const sm = machine()
    exportToRuntime({ ...sceneBase, stateMachines: [sm] })
    expect(sm.states[0].x).toBe(120) // original untouched
  })
})
