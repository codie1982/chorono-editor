import Ajv from 'ajv'
import { describe, expect, it } from 'vitest'
import { bootstrapMCPActions } from '../actions'
import { actionRegistry } from '../../ai/ActionRegistry'
import { layerPatchSchema, particlePatchSchema } from './registryPayloadSchemas'
import { modifierSchema } from './modifierSchema'
import { trackPatchSchema } from './trackPatchSchema'
import { modifierRegistry } from '../../animation/modifiers/ModifierRegistry'

describe('MCP payload schema adapters', () => {
  it('derives actual layer/particle field addresses without narrowing extension or UI-slider ranges', async () => {
    await bootstrapMCPActions()
    const layer = layerPatchSchema(), particle = particlePatchSchema()
    expect(layer.properties.transform.properties.rotationDeg.description).toContain('transform.rotationDeg')
    expect(particle.properties.emitter.properties.maxParticles.description).toContain('particleEmitter.emitter.maxParticles')
    const validate = new Ajv({ strict: false }).compile(layer)
    expect(validate({ size: { width: 4096, height: 2160 }, customExtension: { handles: ['a', 'b'] }, style: { fill: { gradient: { stops: [] } } } })).toBe(true)
    expect(new Ajv({ strict: false }).compile(particle)({ emitter: { area: { pathLayerId: 'motion-source' } }, animation: { opacityOverLife: { stops: [{ t: 0, value: 0 }] } } })).toBe(true)
  })

  it('discovers registered modifier parameter defaults without claiming timeWarp is implemented', () => {
    const schema = modifierSchema() as { properties: Record<string, any> }
    expect(schema.properties.type.description).toContain('spring')
    expect(schema.properties.parameters.properties.stiffness.description).toContain('170')
    expect(modifierRegistry.get('timeWarp')).toBeUndefined()
    expect(schema.properties.type.description).toContain('no-op')
    expect(new Ajv({ strict: false }).compile(schema)({ type: 'timeWarp', parameters: { unknown: 1 } })).toBe(true)
  })

  it('keeps legacy nested clearing and replacement payloads open while requiring an object patch', async () => {
    await bootstrapMCPActions()
    const patch = actionRegistry.get('patch_object')!, particles = actionRegistry.get('configure_particles')!
    const validatePatch = new Ajv({ strict: false }).compile(patch.parameters)
    for (const value of [{ style: null }, { text: null }, { style: { fill: null } }, { particleEmitter: null }]) {
      expect(validatePatch({ layerId: 'hero', patch: value })).toBe(true)
    }
    expect(validatePatch({ layerId: 'hero', patch: null })).toBe(false)
    expect(validatePatch({ layerId: 'hero', patch: [] })).toBe(false)
    const validateConfig = new Ajv({ strict: false }).compile(particles.parameters)
    expect(validateConfig({ layerId: 'emitter', config: { rendering: { glow: null }, particle: null } })).toBe(true)
    expect(validateConfig({ layerId: 'emitter', config: null })).toBe(false)
  })

  it('transports legacy typed-object extension metadata to the unchanged domain gate', async () => {
    await bootstrapMCPActions()
    const validate = new Ajv({ strict: false }).compile(actionRegistry.get('set_keyframes')!.parameters)
    for (const value of [{ x: 1, y: 2, source: 'legacy' }, { r: 255, g: 0, b: 0, a: 255, colorSpace: 'srgb' }]) {
      expect(validate({ timelineId: 'intro', layerId: 'hero', property: 'custom.value', keyframes: [{ timeMs: 0, value }] })).toBe(true)
    }
  })

  it('keeps complete-track replacement distinct and supports typed keys and custom Bezier input', async () => {
    await bootstrapMCPActions()
    const upsert = actionRegistry.get('set_keyframes')!
    const validate = new Ajv({ strict: false }).compile(upsert.parameters)
    expect(validate({ timelineId: 'intro', layerId: 'hero', property: 'style.fill.color', keyframes: [{ timeMs: 0, value: '#ff0000', easing: { type: 'customBezier', bezier: { cx1: .2, cy1: 0, cx2: .8, cy2: 1 } } }] })).toBe(true)
    expect(validate({ timelineId: 'intro', layerId: 'hero', property: 'custom.vector', keyframes: [{ timeMs: 0, value: { x: 1, y: 2 } }] })).toBe(true)
    expect(validate({ timelineId: 'intro', layerId: 'hero', property: 'opacity', keyframes: [{ timeMs: 0, value: { unexpected: 1 } }] })).toBe(false)
    expect(trackPatchSchema().description).toContain('replaces the entire key array')
    expect(new Ajv({ strict: false }).compile(trackPatchSchema())({ controller: null, keyframes: [] })).toBe(true)
  })
})
