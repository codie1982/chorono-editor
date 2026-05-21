// ── Particle AI action tests ──────────────────────────────────────────────────
import { describe, it, expect, beforeEach } from 'vitest'
import { ActionRegistry } from '../../ActionRegistry'
import { registerParticleActions } from '../particle'
import { emptyScene } from '@/lib/defaults'
import type { ChronoScene } from '@/lib/types'

function run(reg: ActionRegistry, scene: ChronoScene, tool: string, params: Record<string, unknown>): ChronoScene {
  const def = reg.get(tool)!
  const cmd = def.toCommand!(params, scene)!
  if (cmd.label.startsWith('AI ERROR')) throw new Error(cmd.label)
  return cmd.execute(scene)
}

describe('AI add_particle_emitter', () => {
  let reg: ActionRegistry
  beforeEach(() => {
    reg = new ActionRegistry()
    registerParticleActions(reg)
  })

  it('creates a confetti emitter with valid nested config', () => {
    const scene = run(reg, emptyScene(), 'add_particle_emitter', { id: 'c1', preset: 'confetti' })
    const layer = scene.layers[0]
    expect(layer.type).toBe('particleEmitter')
    // The crash root cause: emitter sub-object must be defined.
    expect(layer.particleEmitter?.emitter).toBeDefined()
    expect(layer.particleEmitter?.particle).toBeDefined()
  })

  it('applies count / duration / loop overrides', () => {
    const scene = run(reg, emptyScene(), 'add_particle_emitter', {
      id: 'c2', preset: 'fire', count: 200, durationMs: 5000, loop: true,
    })
    const pe = scene.layers[0].particleEmitter!
    expect(pe.emitter.maxParticles).toBe(200)
    expect(pe.emitter.durationMs).toBe(5000)
    expect(pe.emitter.loop).toBe(true)
  })

  it('falls back to a valid default for an unknown preset', () => {
    const scene = run(reg, emptyScene(), 'add_particle_emitter', { id: 'c3', preset: 'nonsense' })
    expect(scene.layers[0].particleEmitter?.emitter).toBeDefined()
  })

  it('rejects a duplicate id', () => {
    let scene = run(reg, emptyScene(), 'add_particle_emitter', { id: 'dup' })
    expect(() => run(reg, scene, 'add_particle_emitter', { id: 'dup' })).toThrow(/already exists/)
  })
})
