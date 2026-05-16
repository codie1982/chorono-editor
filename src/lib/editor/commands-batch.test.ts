import { describe, it, expect } from 'vitest'
import { makeBatchCmd } from './commands-batch'
import type { EditorCommand } from './commands-keyframe'
import type { ChronoScene } from '../types'

// Minimal fake scene — only the fields the commands touch
const initialScene: ChronoScene = {
  formatVersion: '1.0.0',
  composition: { id: 'c', width: 100, height: 100, durationMs: 1000, frameRate: 60, backgroundColor: '#000' },
  assets: [], layers: [], timelines: [],
  parameters: [], triggers: [], bindings: [],
  initialState: {},
} as any

const setValueCmd = (key: string, val: number): EditorCommand => ({
  label: `set ${key}`,
  execute: (s) => ({ ...s, initialState: { ...s.initialState, [key]: val } }),
  undo:    (s) => {
    const next = { ...s.initialState }
    delete next[key]
    return { ...s, initialState: next }
  },
})

describe('BatchCommand', () => {
  it('empty batch is a no-op', () => {
    const cmd = makeBatchCmd('empty', [])
    expect(cmd.execute(initialScene)).toBe(initialScene)
    expect(cmd.undo(initialScene)).toBe(initialScene)
  })

  it('executes commands in array order', () => {
    const cmd = makeBatchCmd('two', [
      setValueCmd('a', 1),
      setValueCmd('b', 2),
    ])
    const next = cmd.execute(initialScene)
    expect(next.initialState).toEqual({ a: 1, b: 2 })
  })

  it('undo reverses in REVERSE order', () => {
    // command A sets x=1, command B overwrites x=2
    const overwriteCmd: EditorCommand = {
      label: 'overwrite x to 2',
      execute: (s) => ({ ...s, initialState: { ...s.initialState, x: 2 } }),
      // Undo should restore x = 1 (the value before *this* command applied),
      // assuming previous command set x = 1. Simulated by setting x = 1.
      undo:    (s) => ({ ...s, initialState: { ...s.initialState, x: 1 } }),
    }
    const setOneCmd: EditorCommand = {
      label: 'set x to 1',
      execute: (s) => ({ ...s, initialState: { ...s.initialState, x: 1 } }),
      undo:    (s) => {
        const next = { ...s.initialState }
        delete next.x
        return { ...s, initialState: next }
      },
    }
    const cmd = makeBatchCmd('two', [setOneCmd, overwriteCmd])

    const after = cmd.execute(initialScene)
    expect(after.initialState).toEqual({ x: 2 })

    const back = cmd.undo(after)
    // overwriteCmd.undo() first → x = 1
    // setOneCmd.undo() next     → x removed
    expect(back.initialState).toEqual({})
  })

  it('execute + undo round-trips state', () => {
    const cmd = makeBatchCmd('round-trip', [
      setValueCmd('a', 1),
      setValueCmd('b', 2),
      setValueCmd('c', 3),
    ])
    const after = cmd.execute(initialScene)
    const back  = cmd.undo(after)
    expect(back.initialState).toEqual({})
  })

  it('preserves label', () => {
    const cmd = makeBatchCmd('Import SVG', [setValueCmd('a', 1)])
    expect(cmd.label).toBe('Import SVG')
  })
})
