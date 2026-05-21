// ── ScriptRunner tests (BL-76) ────────────────────────────────────────────────
import { describe, it, expect, beforeEach } from 'vitest'
import '@/lib/registry' // triggers layer registry bootstrap
import { runScript } from '../ScriptRunner'
import type { ScriptHost, ScriptEvent } from '../types'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import type { ChronoScene } from '@/lib/types'
import { emptyScene, newTimeline } from '@/lib/defaults'

/** Mock host: holds a scene, applies committed commands immediately. */
function makeHost(initial: ChronoScene): ScriptHost & { scene: ChronoScene } {
  const state = { scene: initial }
  return {
    scene: state.scene,
    getScene: () => state.scene,
    applyCommand: (cmd: EditorCommand) => {
      state.scene = cmd.execute(state.scene)
    },
  } as ScriptHost & { scene: ChronoScene }
}

function sceneWithTimeline(): ChronoScene {
  const s = emptyScene()
  const tl = newTimeline()
  tl.id = 'tl1'
  s.timelines = [tl]
  return s
}

describe('runScript — authoring script (BL-76)', () => {
  let host: ScriptHost
  let getScene: () => ChronoScene

  beforeEach(() => {
    let scene = sceneWithTimeline()
    host = {
      getScene: () => scene,
      applyCommand: (cmd: EditorCommand) => { scene = cmd.execute(scene) },
    }
    getScene = host.getScene
  })

  it('creates a layer via scene.add()', () => {
    const result = runScript(`scene.add('rect')`, host)
    expect(result.ok).toBe(true)
    expect(getScene().layers).toHaveLength(1)
    expect(getScene().layers[0].type).toBe('shape')
  })

  it('sets position, opacity, and fill through the handle', () => {
    const result = runScript(
      `const c = scene.add('rect'); c.pos = [120, 80]; c.opacity = 0.5; c.fill = '#FF0000'`,
      host,
    )
    expect(result.ok).toBe(true)
    const layer = getScene().layers[0]
    expect(layer.transform.x).toBe(120)
    expect(layer.transform.y).toBe(80)
    expect(layer.opacity).toBe(0.5)
    expect(layer.style?.fill?.color).toBe('#FF0000')
  })

  it('adds keyframes via handle.key()', () => {
    const result = runScript(
      `const c = scene.add('rect'); c.key('opacity', 0, 0); c.key('opacity', 600, 1)`,
      host,
    )
    expect(result.ok).toBe(true)
    const track = getScene().timelines[0].tracks.find((t) =>
      t.target.endsWith('.opacity'),
    )
    expect(track).toBeDefined()
    expect(track!.keyframes).toHaveLength(2)
    expect(track!.keyframes[0].value).toBe(0)
    expect(track!.keyframes[1].value).toBe(1)
  })

  it('reports commandCount (batched into one undo step)', () => {
    const result = runScript(
      `const c = scene.add('rect'); c.pos = [10, 20]; c.opacity = 0.3`,
      host,
    )
    expect(result.ok).toBe(true)
    expect(result.commandCount).toBe(3) // add + pos + opacity
  })

  it('supports loops (full JS host language)', () => {
    runScript(`for (let i = 0; i < 5; i++) scene.add('circle')`, host)
    expect(getScene().layers).toHaveLength(5)
  })

  it('collects scene.log() output', () => {
    const result = runScript(`scene.log('hello', 42)`, host)
    expect(result.logs).toEqual(['hello 42'])
  })

  it('returns error (not throw) on bad layer kind', () => {
    const result = runScript(`scene.add('nope')`, host)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('nope')
  })

  it('returns error on JS syntax error without applying anything', () => {
    const result = runScript(`const x = (`, host)
    expect(result.ok).toBe(false)
    expect(getScene().layers).toHaveLength(0)
  })

  it('emits scriptStart and scriptComplete events (event convention)', () => {
    const events: ScriptEvent[] = []
    runScript(`scene.add('rect')`, host, { onEvent: (e) => events.push(e) })
    expect(events.map((e) => e.type)).toEqual(['scriptStart', 'scriptComplete'])
    expect(events[1].commandCount).toBe(1)
  })

  it('emits scriptError event on failure', () => {
    const events: ScriptEvent[] = []
    runScript(`scene.add('nope')`, host, { onEvent: (e) => events.push(e) })
    expect(events.map((e) => e.type)).toEqual(['scriptStart', 'scriptError'])
  })

  it('find() locates a layer by name', () => {
    runScript(`scene.add('rect')`, host)
    const name = getScene().layers[0].name
    const result = runScript(`const f = scene.find(${JSON.stringify(name)}); f.opacity = 0.1`, host)
    expect(result.ok).toBe(true)
    expect(getScene().layers[0].opacity).toBe(0.1)
  })

  it('partial failure rolls back — no commit when script throws mid-way', () => {
    // add() succeeds, then a throw — because commit happens only after the
    // script finishes, nothing should be applied.
    const result = runScript(`scene.add('rect'); throw new Error('boom')`, host)
    expect(result.ok).toBe(false)
    expect(getScene().layers).toHaveLength(0)
  })
})
