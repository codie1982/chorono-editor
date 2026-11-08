import type { ParticleEmitterData } from '../../particles/types'
import type { ChronoScene } from '../../types'
import { layerRegistry } from '../../registry'
import { resolveInstanceLayer } from '../../clone/InstanceResolver'

export const SCRIPT_PARTICLE_LIMITS = { particles: 10000, stops: 256, modifiers: 64, durationMs: 3600000, scalar: 3600000 }
const fail = (field: string) => { throw new Error(`Invalid particle ${field}.`) }
const finite = (value: unknown, min: number, max: number, field: string, integer = false) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) fail(field)
}
const bool = (value: unknown, field: string) => { if (typeof value !== 'boolean') fail(field) }
const oneOf = (value: unknown, values: string[], field: string) => { if (typeof value !== 'string' || !values.includes(value)) fail(field) }
function record(value: unknown, keys: string[], field: string): asserts value is Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(field)
  for (const key of Object.keys(value as object)) if (!keys.includes(key)) throw new Error(`Unknown particle ${field}.${key}.`)
}
export function assertParticleJson(value: unknown): void {
  let nodes = 0
  const path = new Set<object>()
  const visit = (input: unknown, depth: number) => {
    if (++nodes > 50000 || depth > 32) throw new Error('Particle data budget exceeded.')
    if (input == null || typeof input === 'string' || typeof input === 'boolean' || typeof input === 'undefined') return
    if (typeof input === 'number') { if (!Number.isFinite(input)) fail('non-finite number'); return }
    if (typeof input !== 'object') throw new Error('Particle configuration accepts JSON data, not callbacks or native objects.')
    if (path.has(input)) throw new Error('Cyclic particle data is unsupported.')
    if (!Array.isArray(input) && Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null) throw new Error('Particle configuration must use plain JSON objects.')
    path.add(input)
    for (const [key, item] of Object.entries(input)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error(`Unsafe particle property '${key}'.`)
      visit(item, depth + 1)
    }
    path.delete(input)
  }
  visit(value, 0)
}
function range(value: unknown, min: number, max: number, field: string) {
  record(value, ['min', 'max'], field)
  finite(value.min, min, max, `${field}.min`); finite(value.max, min, max, `${field}.max`)
  if (value.min > value.max) throw new Error(`Particle ${field}.min must not exceed max.`)
}
export function assertScriptParticleColor(value: unknown, field: string) {
  record(value, ['r', 'g', 'b', 'a'], field)
  for (const channel of ['r', 'g', 'b', 'a']) finite(value[channel], 0, 255, `${field}.${channel}`)
}
const color = assertScriptParticleColor
function vector(value: unknown, field: string) {
  record(value, ['x', 'y'], field)
  finite(value.x, -SCRIPT_PARTICLE_LIMITS.scalar, SCRIPT_PARTICLE_LIMITS.scalar, `${field}.x`)
  finite(value.y, -SCRIPT_PARTICLE_LIMITS.scalar, SCRIPT_PARTICLE_LIMITS.scalar, `${field}.y`)
}
export const PARTICLE_LIFE_EASINGS = ['linear', 'hold', 'easeIn', 'easeOut', 'easeInOut']
function gradient(value: unknown, kind: 'scale' | 'opacity' | 'color', field: string) {
  record(value, ['stops'], field)
  if (!Array.isArray(value.stops) || !value.stops.length || value.stops.length > SCRIPT_PARTICLE_LIMITS.stops) fail(`${field}.stops (1..${SCRIPT_PARTICLE_LIMITS.stops})`)
  let last = -1
  for (const stop of value.stops) {
    record(stop, ['t', 'value', 'easing'], `${field}.stop`)
    finite(stop.t, 0, 1, `${field}.t`)
    if (stop.t <= last) throw new Error('Particle life stops must have unique increasing t values.')
    last = stop.t
    if (stop.easing !== undefined) oneOf(stop.easing, PARTICLE_LIFE_EASINGS, `${field}.easing (customBezier handles are unsupported)`)
    if (kind === 'color') color(stop.value, `${field}.value`)
    else finite(stop.value, 0, kind === 'opacity' ? 1 : 1000, `${field}.value`)
  }
}
export function validateScriptParticleData(data: ParticleEmitterData, scene: ChronoScene, layerId: string): void {
  assertParticleJson(data)
  record(data, ['mode', 'emitter', 'particle', 'animation', 'random', 'rendering', 'burstMarkers', 'flow'], 'config')
  if (data.mode !== 'simple' || data.flow !== undefined) throw new Error('Particle Flow graphs are not implemented; use simple particle configuration.')
  if (data.burstMarkers !== undefined && (!Array.isArray(data.burstMarkers) || data.burstMarkers.length)) throw new Error('Particle burstMarkers are not implemented; use an emitter burst or a separate emitter layer.')
  const e = data.emitter
  record(e, ['mode', 'shape', 'ratePerSecond', 'burstCount', 'maxParticles', 'durationMs', 'loop', 'startDelayMs', 'area'], 'emitter')
  oneOf(e.mode, ['continuous', 'burst'], 'emitter.mode')
  oneOf(e.shape, ['point', 'line', 'circle', 'rectangle', 'path', 'sourceLayer'], 'emitter.shape')
  finite(e.maxParticles, 1, SCRIPT_PARTICLE_LIMITS.particles, 'emitter.maxParticles', true)
  finite(e.durationMs, 1, SCRIPT_PARTICLE_LIMITS.durationMs, 'emitter.durationMs'); bool(e.loop, 'emitter.loop')
  if (e.ratePerSecond !== undefined) finite(e.ratePerSecond, 0, SCRIPT_PARTICLE_LIMITS.particles, 'emitter.ratePerSecond')
  if (e.burstCount !== undefined) finite(e.burstCount, 0, SCRIPT_PARTICLE_LIMITS.particles, 'emitter.burstCount', true)
  if (e.startDelayMs !== undefined) finite(e.startDelayMs, 0, SCRIPT_PARTICLE_LIMITS.durationMs, 'emitter.startDelayMs')
  if (e.area !== undefined) {
    record(e.area, ['width', 'height', 'radius', 'lineStart', 'lineEnd', 'pathLayerId', 'sourceLayerId', 'emitFromEdge'], 'emitter.area')
    for (const key of ['width', 'height', 'radius'] as const) if (e.area[key] !== undefined) finite(e.area[key], 0, SCRIPT_PARTICLE_LIMITS.scalar, `emitter.area.${key}`)
    for (const key of ['lineStart', 'lineEnd'] as const) if (e.area[key] !== undefined) vector(e.area[key], `emitter.area.${key}`)
    if (e.area.emitFromEdge !== undefined) bool(e.area.emitFromEdge, 'emitter.area.emitFromEdge')
    for (const key of ['pathLayerId', 'sourceLayerId'] as const) if (e.area[key] !== undefined) {
      const raw = scene.layers.find(layer => layer.id === e.area![key])
      const target = raw && resolveInstanceLayer(raw, scene.layers)
      if (!target || target.id === layerId || target.type === 'particleEmitter'
        || (key === 'pathLayerId' && !layerRegistry.findForLayer(target)?.toPath)) throw new Error(`Particle ${key} must reference another valid geometry layer.`)
    }
  }
  if (e.shape === 'path' && !e.area?.pathLayerId) throw new Error('Path emission requires area.pathLayerId.')
  if (e.shape === 'sourceLayer' && !e.area?.sourceLayerId) throw new Error('Source-layer emission requires area.sourceLayerId.')
  const p = data.particle
  record(p, ['shape', 'size', 'colorMode', 'color', 'palette', 'colorOverLife', 'stroke', 'starPoints', 'starInnerRatio'], 'particle')
  oneOf(p.shape, ['circle', 'softCircle', 'rect', 'roundedRect', 'line', 'star', 'triangle', 'smokePuff', 'flameBlob'], 'particle.shape')
  range(p.size, 0.5, 10000, 'particle.size'); oneOf(p.colorMode, ['single', 'palette', 'random', 'gradientOverLife'], 'particle.colorMode')
  if (p.color !== undefined) color(p.color, 'particle.color')
  if (p.palette !== undefined) {
    if (!Array.isArray(p.palette) || !p.palette.length || p.palette.length > 256) fail('particle.palette (1..256 colors)')
    p.palette.forEach((value, index) => color(value, `particle.palette.${index}`))
  }
  if (p.colorMode === 'palette' && !p.palette?.length) fail('particle.palette')
  if (p.colorOverLife !== undefined) gradient(p.colorOverLife, 'color', 'particle.colorOverLife')
  if (p.colorMode === 'gradientOverLife' && !p.colorOverLife) fail('particle.colorOverLife')
  if (p.stroke !== undefined) { record(p.stroke, ['enabled', 'color', 'width'], 'particle.stroke'); bool(p.stroke.enabled, 'particle.stroke.enabled'); color(p.stroke.color, 'particle.stroke.color'); finite(p.stroke.width, 0, 1000, 'particle.stroke.width') }
  if (p.starPoints !== undefined) finite(p.starPoints, 3, 128, 'particle.starPoints', true)
  if (p.starInnerRatio !== undefined) finite(p.starInnerRatio, 0, 1, 'particle.starInnerRatio')
  const a = data.animation
  record(a, ['lifetimeMs', 'positionOffset', 'scaleOverLife', 'opacityOverLife', 'rotationVelocity', 'motionModifiers'], 'animation')
  range(a.lifetimeMs, 50, SCRIPT_PARTICLE_LIMITS.durationMs, 'animation.lifetimeMs')
  if (a.positionOffset !== undefined) {
    record(a.positionOffset, ['x', 'y', 'easing'], 'animation.positionOffset')
    range(a.positionOffset.x, -SCRIPT_PARTICLE_LIMITS.scalar, SCRIPT_PARTICLE_LIMITS.scalar, 'animation.positionOffset.x')
    range(a.positionOffset.y, -SCRIPT_PARTICLE_LIMITS.scalar, SCRIPT_PARTICLE_LIMITS.scalar, 'animation.positionOffset.y')
    if (a.positionOffset.easing !== undefined) oneOf(a.positionOffset.easing, PARTICLE_LIFE_EASINGS, 'animation.positionOffset.easing')
  }
  if (a.scaleOverLife !== undefined) gradient(a.scaleOverLife, 'scale', 'animation.scaleOverLife')
  if (a.opacityOverLife !== undefined) gradient(a.opacityOverLife, 'opacity', 'animation.opacityOverLife')
  if (a.rotationVelocity !== undefined) range(a.rotationVelocity, -SCRIPT_PARTICLE_LIMITS.scalar, SCRIPT_PARTICLE_LIMITS.scalar, 'animation.rotationVelocity')
  if (a.motionModifiers !== undefined) {
    if (!Array.isArray(a.motionModifiers) || a.motionModifiers.length > SCRIPT_PARTICLE_LIMITS.modifiers) fail('animation.motionModifiers')
    a.motionModifiers.forEach(mod => {
      record(mod, ['type', 'enabled', 'amount', 'speed', 'phase'], 'motionModifier')
      oneOf(mod.type, ['noiseDrift', 'sineWave', 'spiral'], 'motionModifier.type'); bool(mod.enabled, 'motionModifier.enabled')
      for (const key of ['amount', 'speed', 'phase'] as const) if (mod[key] !== undefined) finite(mod[key], -SCRIPT_PARTICLE_LIMITS.scalar, SCRIPT_PARTICLE_LIMITS.scalar, `motionModifier.${key}`)
    })
  }
  const random = data.random
  record(random, ['seed', 'positionRandomness', 'sizeRandomness', 'rotationRandomness', 'delayRandomness', 'lifetimeRandomness', 'colorRandomness'], 'random')
  finite(random.seed, 0, 0xffffffff, 'random.seed', true)
  for (const key of ['positionRandomness', 'sizeRandomness', 'rotationRandomness', 'delayRandomness', 'lifetimeRandomness', 'colorRandomness'] as const) finite(random[key], 0, 1, `random.${key}`)
  const r = data.rendering
  record(r, ['blendMode', 'softEdges', 'glow', 'blur', 'quality'], 'rendering')
  oneOf(r.blendMode, ['normal', 'screen', 'additive', 'multiply'], 'rendering.blendMode'); bool(r.softEdges, 'rendering.softEdges'); oneOf(r.quality, ['low', 'medium', 'high'], 'rendering.quality')
  if (r.glow !== undefined) { record(r.glow, ['enabled', 'radius', 'intensity'], 'rendering.glow'); bool(r.glow.enabled, 'rendering.glow.enabled'); finite(r.glow.radius, 0, 1000, 'rendering.glow.radius'); finite(r.glow.intensity, 0, 100, 'rendering.glow.intensity') }
  if (r.blur !== undefined) { record(r.blur, ['enabled', 'radius'], 'rendering.blur'); bool(r.blur.enabled, 'rendering.blur.enabled'); finite(r.blur.radius, 0, 1000, 'rendering.blur.radius') }
}
