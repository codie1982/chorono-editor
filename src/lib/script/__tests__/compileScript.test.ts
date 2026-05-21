// ── compileScript + AI run_script integration (BL-76 Sprint 5) ────────────────
import { describe, it, expect } from 'vitest'
import '@/lib/registry' // layer registry bootstrap
import { compileScript } from '../ScriptRunner'
import type { ChronoScene } from '@/lib/types'
import { emptyScene, newTimeline } from '@/lib/defaults'
import { actionRegistry, bootstrapAIActions } from '@/lib/ai/ActionRegistry'

function sceneWithTimeline(): ChronoScene {
  const s = emptyScene()
  const tl = newTimeline()
  tl.id = 'tl1'
  s.timelines = [tl]
  return s
}

describe('compileScript — returns one command without dispatching', () => {
  it('returns a batched command that creates layers when executed', () => {
    const scene = sceneWithTimeline()
    const { result, command } = compileScript(
      `for (let i = 0; i < 3; i++) scene.add('circle')`,
      scene,
    )
    expect(result.ok).toBe(true)
    expect(command).not.toBeNull()
    // Source scene is untouched until the command runs (no dispatch side-effect).
    expect(scene.layers).toHaveLength(0)
    // Executing the command produces the layers as one step.
    const next = command!.execute(scene)
    expect(next.layers).toHaveLength(3)
    // And it undoes cleanly back to empty.
    const undone = command!.undo(next)
    expect(undone.layers).toHaveLength(0)
  })

  it('returns command=null on script error (nothing committed)', () => {
    const scene = sceneWithTimeline()
    const { result, command } = compileScript(`scene.add('nope')`, scene)
    expect(result.ok).toBe(false)
    expect(command).toBeNull()
  })

  it('returns command=null when script makes no edits', () => {
    const scene = sceneWithTimeline()
    const { result, command } = compileScript(`scene.log('hi')`, scene)
    expect(result.ok).toBe(true)
    expect(command).toBeNull()
  })

  it('keyframes from script survive into the command', () => {
    const scene = sceneWithTimeline()
    const { command } = compileScript(
      `const c = scene.add('rect'); c.key('opacity', 0, 0); c.key('opacity', 500, 1)`,
      scene,
    )
    const next = command!.execute(scene)
    const track = next.timelines[0].tracks.find((t) => t.target.endsWith('.opacity'))
    expect(track?.keyframes).toHaveLength(2)
  })
})

describe('AI run_script action', () => {
  it('is registered after bootstrap', async () => {
    await bootstrapAIActions()
    const def = actionRegistry.get('run_script')
    expect(def).toBeDefined()
    expect(def!.toolName).toBe('run_script')
  })

  it('toCommand produces a command that creates layers', async () => {
    await bootstrapAIActions()
    const def = actionRegistry.get('run_script')!
    const scene = sceneWithTimeline()
    const cmd = def.toCommand!(
      { code: `scene.add('rect'); scene.add('circle')` },
      scene,
    )
    expect(cmd).not.toBeNull()
    const next = cmd!.execute(scene)
    expect(next.layers).toHaveLength(2)
  })

  it('toCommand returns an AI ERROR command on bad script', async () => {
    await bootstrapAIActions()
    const def = actionRegistry.get('run_script')!
    const scene = sceneWithTimeline()
    const cmd = def.toCommand!({ code: `scene.add('nope')` }, scene)
    expect(cmd).not.toBeNull()
    expect(cmd!.label).toContain('AI ERROR')
    // Error command is a no-op.
    expect(cmd!.execute(scene)).toBe(scene)
  })

  it('toCommand rejects a missing code param', async () => {
    await bootstrapAIActions()
    const def = actionRegistry.get('run_script')!
    const scene = sceneWithTimeline()
    const cmd = def.toCommand!({} as { code: string }, scene)
    expect(cmd!.label).toContain('AI ERROR')
  })
})
