import type { ColorValue, EasingType, Layer } from '../../types'
import type { ParticleEmitterData, ParticleEmitterConfig, ParticleVisualConfig, ParticleAnimationConfig,
  ParticleRandomConfig, ParticleRenderingConfig, MotionModifierConfig, MotionModifierType, LifeGradientStop, ParticleLifeGradient } from '../../particles/types'
import { getAllParticlePresets, getParticlePreset } from '../../particles/presets'
import { resolveParticlePresetId } from '../../particles/buildEmitterLayer'
import { makeUpdateLayerCmd } from '../../editor/commands-layer'
import { parseAnimatableColor } from '../../animation/typedValues'
import { resolveInstanceLayer } from '../../clone/InstanceResolver'
import type { ApiContext } from './LayerHandle'
import { copyScriptData, mergeScriptData, type DeepPartial } from './scriptData'
import { assertParticleJson, assertScriptParticleColor, validateScriptParticleData } from './particleValidation'

export type ParticleLifeChannel = 'scale' | 'opacity' | 'color'
export type ParticleLifeStop = LifeGradientStop<number | ColorValue | string>

export function listScriptParticlePresets() {
  return getAllParticlePresets().map(({ id, name, category, description, tags, mobileSafe, complexity }) =>
    ({ id, name, category, description, tags: [...tags], mobileSafe, complexity }))
}
export function deterministicParticleSeed(value: number | string): number {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new Error('Particle seed must be an unsigned 32-bit integer or a string.')
    return value
  }
  if (typeof value !== 'string' || value.length > 4096) throw new Error('Particle seed strings are limited to 4096 characters.')
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619)
  return hash >>> 0
}

/** Declarative authoring facade for the native simple particle evaluator.
 * All reads detach JSON; all writes are normal reversible layer commands. */
export class ParticleHandle {
  constructor(public readonly id: string, private readonly ctx: ApiContext) {}
  private layer(writable = false): Layer {
    const scene = this.ctx.host.getScene()
    const raw = scene.layers.find(item => item.id === this.id)
    if (writable && raw?.instanceOf) throw new Error(`Edit the source emitter '${raw.instanceOf}' explicitly; instance particle data is read-only.`)
    const layer = raw && (raw.instanceOf ? resolveInstanceLayer(raw, scene.layers) : raw)
    if (!layer || layer.type !== 'particleEmitter' || !layer.particleEmitter) throw new Error('Particle handle requires an existing particle emitter layer.')
    if (writable) {
      let current: Layer | undefined = layer
      const visited = new Set<string>()
      while (current) {
        if (visited.has(current.id)) throw new Error('Cyclic particle parent relationship.')
        visited.add(current.id)
        if (current.locked || current.frozen) throw new Error(`Unlock and unfreeze '${current.name}' before editing its particle system.`)
        const parentId: string | undefined = current.parentId
        current = parentId ? scene.layers.find(candidate => candidate.id === parentId) : undefined
      }
    }
    return layer
  }
  get data(): ParticleEmitterData { return copyScriptData(this.layer().particleEmitter!) }
  get presets() { return listScriptParticlePresets() }
  get motionModifiers(): MotionModifierConfig[] { return this.data.animation.motionModifiers ?? [] }
  getPreset(name: string): ParticleEmitterData {
    if (typeof name !== 'string' || !name.trim()) throw new Error('A particle preset name is required.')
    const id = resolveParticlePresetId(name)
    if (!id) throw new Error(`Unknown particle preset '${name}'.`)
    return copyScriptData(getParticlePreset(id)!.createData())
  }
  private commit(data: ParticleEmitterData): this {
    const previous = this.layer(true)
    validateScriptParticleData(data, this.ctx.host.getScene(), this.id)
    const snapshot = copyScriptData(data)
    this.ctx.host.applyCommand(makeUpdateLayerCmd(this.id, { particleEmitter: snapshot }, previous))
    return this
  }
  applyPreset(name: string): this { return this.commit(this.getPreset(name)) }
  patch(patch: DeepPartial<ParticleEmitterData>): this {
    assertParticleJson(patch)
    return this.commit(mergeScriptData<ParticleEmitterData>(this.data, patch))
  }
  emission(patch: DeepPartial<ParticleEmitterConfig>): this { return this.patch({ emitter: patch }) }
  visual(patch: DeepPartial<ParticleVisualConfig>): this { return this.patch({ particle: patch }) }
  animation(patch: DeepPartial<ParticleAnimationConfig>): this { return this.patch({ animation: patch }) }
  random(patch: DeepPartial<ParticleRandomConfig>): this { return this.patch({ random: patch }) }
  rendering(patch: DeepPartial<ParticleRenderingConfig>): this { return this.patch({ rendering: patch }) }
  seed(value: number | string): this { return this.random({ seed: deterministicParticleSeed(value) }) }

  private channel(channel: ParticleLifeChannel): void {
    if (!['scale', 'opacity', 'color'].includes(channel)) throw new Error(`Unknown particle life channel '${channel}'.`)
  }
  private lifeStops(channel: ParticleLifeChannel): ParticleLifeStop[] {
    this.channel(channel)
    const data = this.data
    return channel === 'color' ? data.particle.colorOverLife?.stops ?? []
      : channel === 'scale' ? data.animation.scaleOverLife?.stops ?? [] : data.animation.opacityOverLife?.stops ?? []
  }
  /** Stops are normalized lifetime positions; easing belongs to the DESTINATION
   * stop, matching the native Particle LifeGradient evaluator. */
  life(channel: ParticleLifeChannel, stops: ParticleLifeStop[]): this {
    this.channel(channel); assertParticleJson(stops)
    if (!Array.isArray(stops)) throw new Error('Particle life stops must be an array.')
    const data = this.data
    const sorted = copyScriptData(stops).sort((a, b) => a.t - b.t)
    if (channel === 'color') {
      const colors = sorted.map(stop => {
        if (stop.value && typeof stop.value === 'object') assertScriptParticleColor(stop.value, 'life color')
        const value = parseAnimatableColor(stop.value)
        if (!value) throw new Error('Particle color life values must be valid colors.')
        return { ...stop, value }
      })
      data.particle.colorOverLife = { stops: colors }
      data.particle.colorMode = 'gradientOverLife'
    } else {
      const gradient = { stops: sorted } as ParticleLifeGradient<number>
      if (channel === 'scale') data.animation.scaleOverLife = gradient
      else data.animation.opacityOverLife = gradient
    }
    return this.commit(data)
  }
  lifeKey(channel: ParticleLifeChannel, t: number, value: number | ColorValue | string, easing?: EasingType): this {
    const stops = this.lifeStops(channel).filter(stop => Math.abs(stop.t - t) > 1e-9)
    return this.life(channel, [...stops, { t, value, ...(easing === undefined ? {} : { easing }) }])
  }
  clearLife(channel: ParticleLifeChannel): this {
    this.channel(channel)
    const data = this.data
    if (channel === 'color') {
      delete data.particle.colorOverLife
      if (data.particle.colorMode === 'gradientOverLife') { data.particle.colorMode = 'single'; data.particle.color ??= { r: 255, g: 255, b: 255, a: 255 } }
    } else if (channel === 'scale') delete data.animation.scaleOverLife
    else delete data.animation.opacityOverLife
    return this.commit(data)
  }
  removeLifeKey(channel: ParticleLifeChannel, t: number): this {
    if (!Number.isFinite(t) || t < 0 || t > 1) throw new Error('Particle life position must be within 0..1.')
    const previous = this.lifeStops(channel), stops = previous.filter(stop => Math.abs(stop.t - t) > 1e-9)
    if (stops.length === previous.length) throw new Error('Particle life stop was not found.')
    return stops.length ? this.life(channel, stops) : this.clearLife(channel)
  }
  addMotionModifier(type: MotionModifierType, options: Partial<Omit<MotionModifierConfig, 'type'>> = {}): number {
    assertParticleJson(options)
    const modifiers = this.motionModifiers, index = modifiers.length
    this.animation({ motionModifiers: [...modifiers, { enabled: true, ...copyScriptData(options), type }] })
    return index
  }
  updateMotionModifier(index: number, patch: Partial<MotionModifierConfig>): this {
    assertParticleJson(patch)
    const modifiers = this.motionModifiers
    if (!Number.isInteger(index) || index < 0 || index >= modifiers.length) throw new Error('Particle motion modifier index was not found.')
    modifiers[index] = { ...modifiers[index], ...copyScriptData(patch) }
    return this.animation({ motionModifiers: modifiers })
  }
  removeMotionModifier(index: number): this {
    const modifiers = this.motionModifiers
    if (!Number.isInteger(index) || index < 0 || index >= modifiers.length) throw new Error('Particle motion modifier index was not found.')
    return this.animation({ motionModifiers: modifiers.filter((_, position) => position !== index) })
  }
}
