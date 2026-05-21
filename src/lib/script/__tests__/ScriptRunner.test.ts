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

  it('key() adds the layer to timeline.layerIds so it shows in the dope sheet (B4)', () => {
    const result = runScript(`const c = scene.add('rect'); c.key('opacity', 0, 0)`, host)
    expect(result.ok).toBe(true)
    const layerId = getScene().layers[0].id
    const tl = getScene().timelines[0]
    expect(tl.layerIds).toContain(layerId)
    // idempotent — keying again does not duplicate the id
    runScript(`scene.get('${layerId}').key('opacity', 600, 1)`, host)
    expect(getScene().timelines[0].layerIds!.filter((id) => id === layerId)).toHaveLength(1)
  })

  it('key() leaves layerIds undefined (show-all) untouched (B4 caveat)', () => {
    let scene = sceneWithTimeline()
    scene.timelines[0].layerIds = undefined
    const showAllHost: ScriptHost = {
      getScene: () => scene,
      applyCommand: (cmd: EditorCommand) => { scene = cmd.execute(scene) },
    }
    runScript(`const c = scene.add('rect'); c.key('opacity', 0, 0)`, showAllHost)
    expect(scene.timelines[0].layerIds).toBeUndefined()
  })

  it('key() accepts an easing argument (defaults to linear)', () => {
    runScript(`const c = scene.add('rect'); c.key('opacity', 0, 0, 'easeInOut')`, host)
    const track = getScene().timelines[0].tracks.find((t) => t.target.endsWith('.opacity'))
    expect(track!.keyframes[0].easing.type).toBe('easeInOut')
  })

  it('sets text content and typography via handle', () => {
    runScript(
      `const t = scene.add('text'); t.text = 'Merhaba'; t.font({ weight: '700', size: 48, uppercase: true })`,
      host,
    )
    const layer = getScene().layers[0]
    expect(layer.text?.value).toBe('Merhaba')
    expect(layer.text?.fontWeight).toBe('700')
    expect(layer.text?.fontSize).toBe(48)
    expect(layer.text?.uppercase).toBe(true)
  })

  it('sets stroke, cornerRadius and shapeParam on a shape', () => {
    runScript(
      `const c = scene.add('rect'); c.stroke({ color: '#FF0000', width: 4 }); c.cornerRadius = 12; c.shapeParam('sides', 6)`,
      host,
    )
    const layer = getScene().layers[0]
    expect(layer.style?.stroke?.color).toBe('#FF0000')
    expect(layer.style?.stroke?.width).toBe(4)
    expect(layer.style?.cornerRadius).toBe(12)
    expect(layer.shapeParams?.sides).toBe(6)
  })

  it('sets blendMode and reparents via handle.parent()', () => {
    runScript(
      `const g = scene.add('group'); const c = scene.add('rect'); c.blendMode = 'multiply'; c.parent(g)`,
      host,
    )
    const rect = getScene().layers.find((l) => l.type === 'shape')!
    const group = getScene().layers.find((l) => l.type === 'group')!
    expect(rect.blendMode).toBe('multiply')
    expect(rect.parentId).toBe(group.id)
  })

  it('builds a state machine via scene.addStateMachine()', () => {
    const result = runScript(
      `const sm = scene.addStateMachine('seasons');
       const spring = sm.addState('spring', 'tl1');
       const summer = sm.addState('summer', 'tl1');
       sm.addTransition(spring, summer, 'next');
       sm.addTransition(summer, spring, 'next')`,
      host,
    )
    expect(result.ok).toBe(true)
    const machine = getScene().stateMachines![0]
    expect(machine.states).toHaveLength(2)
    expect(machine.transitions).toHaveLength(2)
    // First-added state auto-becomes initial.
    expect(machine.initialStateId).toBe(machine.states[0].id)
  })

  it('adds a particle emitter and configures it without crashing (B/particle fix)', () => {
    const result = runScript(
      `const fx = scene.addEmitter('confetti', { x: 100, y: 100 });
       fx.configureParticles({ emitter: { maxParticles: 150, loop: true } })`,
      host,
    )
    expect(result.ok).toBe(true)
    const layer = getScene().layers.find((l) => l.type === 'particleEmitter')!
    expect(layer.particleEmitter?.emitter.maxParticles).toBe(150)
    expect(layer.particleEmitter?.emitter.loop).toBe(true)
  })

  it('adds parameters, wires and interactivity via the scene API', () => {
    const result = runScript(
      `scene.addParam('angle', 0.5, { min: 0, max: 1 });
       const box = scene.add('rect');
       box.interactive({ draggable: true, axis: 'x', setsParameter: 'angle' });
       scene.wire('angle', 'transform.rotationDeg', 'map(source,0,1,0,360)', { targetLayerId: box.id });
       scene.addTrigger('click', 'play', { layerId: box.id, timelineId: 'tl1' })`,
      host,
    )
    expect(result.ok).toBe(true)
    const s = getScene()
    expect(s.parameters[0]).toMatchObject({ id: 'angle', type: 'number', defaultValue: 0.5 })
    expect(s.parameterWires![0].expression).toBe('map(source,0,1,0,360)')
    expect(s.triggers[0].event.type).toBe('click')
    const box = s.layers.find((l) => l.type === 'shape')!
    expect(box.draggable).toBe(true)
    expect(box.dragConfig).toMatchObject({ axis: 'x', setsParameter: 'angle' })
  })

  it('adds a path and makes a layer follow it via the scene API', () => {
    const result = runScript(
      `const track = scene.addPath([[0,0],[300,100]], { role: 'motion' });
       const ball = scene.add('circle');
       ball.followPath(track.id, { orientToPath: true })`,
      host,
    )
    expect(result.ok).toBe(true)
    const path = getScene().layers.find((l) => l.type === 'path')!
    expect(path.path?.anchors).toHaveLength(2)
    const ball = getScene().layers.find((l) => l.type === 'shape')!
    expect(ball.followPath).toMatchObject({ pathLayerId: path.id, orientToPath: true })
  })

  it('clones and arrays layers via the scene API', () => {
    const result = runScript(
      `const box = scene.add('rect');
       scene.clone(box, 2);
       const dots = scene.add('circle');
       scene.array(dots, { pattern: 'radial', count: 6, radius: 100 })`,
      host,
    )
    expect(result.ok).toBe(true)
    const shapes = getScene().layers.filter((l) => l.type === 'shape')
    // box + 2 clones + circle source + 5 radial copies = 9
    expect(shapes.length).toBe(9)
  })

  it('auto-creates a default timeline when none exists (BL-78 ordering fix)', () => {
    // Scene with NO timelines — key() must not throw; it auto-creates one.
    let scene = emptyScene()
    const noTlHost: ScriptHost = {
      getScene: () => scene,
      applyCommand: (cmd: EditorCommand) => { scene = cmd.execute(scene) },
    }
    const result = runScript(
      `const c = scene.add('rect'); c.key('opacity', 0, 0); c.key('opacity', 800, 1)`,
      noTlHost,
    )
    expect(result.ok).toBe(true)
    expect(scene.timelines).toHaveLength(1)
    const tl = scene.timelines[0]
    expect(tl.durationMs).toBeGreaterThanOrEqual(800)
    const track = tl.tracks.find((t) => t.target.endsWith('.opacity'))
    expect(track?.keyframes).toHaveLength(2)
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
