import { describe, expect, it } from 'vitest'
import { emptyScene, newParticleEmitterLayer, newRectLayer } from '../../defaults'
import type { ChronoScene } from '../../types'
import type { EditorCommand } from '../../editor/commands-keyframe'
import { ParticleHandle, deterministicParticleSeed, listScriptParticlePresets } from '../api/ParticleHandle'
import { computeSpawnParams } from '../../particles/runtime/ParticleSpawner'
import { evalNumberGradient } from '../../particles/animation/LifeGradient'
function harness(initial?: ChronoScene, id?: string) {
  let scene = initial ?? { ...emptyScene(), layers: [newParticleEmitterLayer()] }
  const commands: EditorCommand[] = []
  const ctx = { host: { getScene: () => scene, applyCommand: (command: EditorCommand) => { scene = command.execute(scene); commands.push(command) } }, resolveTimelineId: () => undefined }
  return { handle: new ParticleHandle(id ?? scene.layers[0].id, ctx), getScene: () => scene, commands,
    undo: () => { const command = commands.pop(); if (command) scene = command.undo(scene) } }
}
describe('declarative ParticleHandle', () => {
  it('reads detached full data/preset metadata and applies each real preset without changing the layer shell', () => {
    const h = harness(), original = structuredClone(h.getScene().layers[0])
    original.name = 'Hero fireworks'; original.startMs = 200; original.endMs = 4000; original.transform.rotationDeg = 25
    h.getScene().layers[0] = original
    const snapshot = h.handle.data; snapshot.emitter.maxParticles = 2
    expect(h.handle.data.emitter.maxParticles).toBe(60)
    const metadata = listScriptParticlePresets(); metadata[0].tags.push('detached')
    expect(listScriptParticlePresets()[0].tags).not.toContain('detached')
    for (const preset of h.handle.presets) {
      h.handle.applyPreset(preset.id)
      const layer = h.getScene().layers[0]
      expect({ ...layer, particleEmitter: undefined }).toEqual({ ...original, particleEmitter: undefined })
    }
    const count = h.commands.length
    expect(() => h.handle.applyPreset('made-up-preset')).toThrow('Unknown particle preset')
    expect(h.commands).toHaveLength(count)
  })
  it('deep merges every config section and reverses a change through the normal command undo contract', () => {
    const h = harness(), original = h.handle.data
    h.handle.emission({ shape: 'rectangle', area: { width: 100, height: 50 } })
      .emission({ area: { width: 200 } }).animation({ positionOffset: { y: { min: -200 } } })
      .rendering({ glow: { enabled: true, radius: 12, intensity: 1 } }).rendering({ glow: { radius: 20 } })
    expect(h.handle.data.emitter.area).toEqual({ width: 200, height: 50 })
    expect(h.handle.data.animation.positionOffset?.x).toEqual(original.animation.positionOffset?.x)
    expect(h.handle.data.animation.positionOffset?.y).toEqual({ min: -200, max: -20 })
    expect(h.handle.data.rendering.glow).toEqual({ enabled: true, radius: 20, intensity: 1 })
    h.undo(); expect(h.handle.data.rendering.glow?.radius).toBe(12)
    expect(original.emitter.area).toBeUndefined()
  })
  it('edits normalized life stops and native gradients, including color conversion and clearing the final key', () => {
    const h = harness()
    h.handle.life('opacity', [{ t: 1, value: 0 }, { t: 0, value: 1 }]).lifeKey('opacity', 0.5, 0.25)
    expect(h.handle.data.animation.opacityOverLife?.stops.map(stop => stop.t)).toEqual([0, 0.5, 1])
    expect(evalNumberGradient(h.handle.data.animation.opacityOverLife!, 0.25)).toBe(0.625)
    h.handle.life('color', [{ t: 0, value: '#ff0000' }, { t: 1, value: '#0000ff80' }])
    expect(h.handle.data.particle.colorMode).toBe('gradientOverLife')
    expect(h.handle.data.particle.colorOverLife?.stops[1].value).toEqual({ r: 0, g: 0, b: 255, a: 128 })
    h.handle.life('scale', [{ t: 0, value: 2 }]).removeLifeKey('scale', 0)
    expect(h.handle.data.animation.scaleOverLife).toBeUndefined()
    expect(() => h.handle.life('opacity', [{ t: 0.5, value: 1 }, { t: 0.5, value: 0 }])).toThrow('unique')
    expect(() => h.handle.lifeKey('opacity', 1.2, 0)).toThrow('particle')
    expect(() => h.handle.lifeKey('color', 0.2, { r: 256, g: 0, b: 0, a: 255 })).toThrow('Invalid particle')
  })
  it('CRUDs native motion modifiers and produces the same spawns for the same string seed', () => {
    const h = harness()
    const index = h.handle.addMotionModifier('sineWave', { amount: 20, speed: 2, phase: Math.PI / 2 })
    expect(index).toBe(0)
    h.handle.updateMotionModifier(index, { enabled: false, amount: 40 })
    expect(h.handle.motionModifiers[0]).toMatchObject({ type: 'sineWave', enabled: false, amount: 40, phase: Math.PI / 2 })
    h.handle.seed('brand-confetti'); const one = computeSpawnParams(h.handle.data, 500).map(p => [p.baseSize, p.seedPhase, p.basePosition])
    h.handle.seed('brand-confetti'); const two = computeSpawnParams(h.handle.data, 500).map(p => [p.baseSize, p.seedPhase, p.basePosition])
    expect(two).toEqual(one)
    expect(deterministicParticleSeed('brand-confetti')).toBe(h.handle.data.random.seed)
    expect(deterministicParticleSeed(0xffffffff)).toBe(0xffffffff)
    h.handle.removeMotionModifier(index); expect(h.handle.motionModifiers).toEqual([])
    expect(() => h.handle.updateMotionModifier(99, { enabled: true })).toThrow('index')
  })
  it('rejects invalid counts/ranges, unknown settings, callbacks and nonfunctional flow/burst-marker stubs atomically', () => {
    const h = harness(), before = h.handle.data
    for (const patch of [ { emitter: { maxParticles: 10001 } }, { emitter: { burstCount: 1.5 } }, { animation: { lifetimeMs: { min: 1000, max: 100 } } },
      { random: { positionRandomness: 2 } }, { random: { seed: -1 } }, { rendering: { blendMode: 'made-up' } }, { emitter: { invented: true } },
      { animation: { motionModifiers: [{ type: 'gravity', enabled: true }] } }, { mode: 'flow', flow: { _version: 'v3-stub' } },
      { burstMarkers: [{ id: 'burst', timeMs: 1000, count: 10 }] }, { animation: { positionOffset: { easing: () => 1 } } } ]) {
      expect(() => h.handle.patch(patch as never)).toThrow()
      expect(h.handle.data).toEqual(before)
    }
    expect(h.commands).toHaveLength(0)
  })
  it('resolves detached instance data but rejects implicit source edits and locked-layer writes', () => {
    const source = newParticleEmitterLayer(), instance = { ...newRectLayer(), instanceOf: source.id }
    const h = harness({ ...emptyScene(), layers: [source, instance] }, instance.id)
    expect(h.handle.data).toEqual(source.particleEmitter)
    expect(() => h.handle.seed('override')).toThrow('Edit the source emitter')
    expect(source.particleEmitter?.random.seed).toBe(42)
    source.locked = true
    const locked = harness({ ...emptyScene(), layers: [source] })
    expect(() => locked.handle.applyPreset('snow')).toThrow('Unlock')
  })
  it('validates emission references against current scene geometry, including registered shapes', () => {
    const emitter = newParticleEmitterLayer(), pathShape = newRectLayer()
    const h = harness({ ...emptyScene(), layers: [emitter, pathShape] })
    h.handle.emission({ shape: 'path', area: { pathLayerId: pathShape.id } })
    expect(h.handle.data.emitter.area?.pathLayerId).toBe(pathShape.id)
    expect(() => h.handle.emission({ area: { pathLayerId: 'not-created-yet' } })).toThrow('valid geometry')
    expect(() => h.handle.emission({ shape: 'sourceLayer', area: { sourceLayerId: emitter.id } })).toThrow('valid geometry')
    h.handle.emission({ shape: 'sourceLayer', area: { sourceLayerId: pathShape.id } })
    expect(h.handle.data.emitter.shape).toBe('sourceLayer')
  })
})
