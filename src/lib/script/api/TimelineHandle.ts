import type { Timeline, Track, EasingDefinition, EasingType, AnimatableValue } from '../../types'
import type { ApiContext } from './LayerHandle'
import { LayerHandle } from './LayerHandle'
import { nextModifierId, makeAddCurveModifierCmd, makeBakeTrackToKeyframesCmd } from '../../editor/commands-track'
import type { CurveModifier } from '../../animation/modifiers/types'
import { copyScriptData } from './scriptData'

export class TimelineHandle {
  constructor(public readonly id: string, private readonly ctx: ApiContext) {}

  get data(): Timeline {
    const timeline = this.ctx.host.getScene().timelines.find(t => t.id === this.id)
    if (!timeline) throw new Error(`Timeline '${this.id}' not found`)
    return copyScriptData(timeline)
  }

  set(patch: Partial<Omit<Timeline, 'id' | 'tracks'>>): this {
    const prev = this.data
    const prevComposition = this.ctx.host.getScene().composition
    const next = { ...prev, ...patch, id: this.id, tracks: prev.tracks }
    this.ctx.host.applyCommand({
      label: `Update timeline ${this.id}`,
      execute: scene => ({ ...scene, composition: { ...scene.composition, durationMs: Math.max(scene.composition.durationMs, next.durationMs) }, timelines: scene.timelines.map(t => t.id === this.id ? next : t) }),
      undo: scene => ({ ...scene, composition: prevComposition, timelines: scene.timelines.map(t => t.id === this.id ? prev : t) }),
    })
    return this
  }

  key(layer: LayerHandle | string, property: string, timeMs: number, value: AnimatableValue, easing?: EasingType | EasingDefinition): this {
    const handle = new LayerHandle(typeof layer === 'string' ? layer : layer.id, { ...this.ctx, resolveTimelineId: () => this.id })
    handle.key(property, timeMs, value, easing)
    return this
  }

  track(target: string, patch: Partial<Omit<Track, 'target'>>): this {
    const prev = this.data
    const existing = prev.tracks.find(t => t.target === target)
    const next = { target, keyframes: [], ...existing, ...patch }
    this.ctx.host.applyCommand({
      label: `Update track ${target}`,
      execute: scene => ({ ...scene, timelines: scene.timelines.map(t => t.id !== this.id ? t : { ...t, tracks: existing ? t.tracks.map(tr => tr.target === target ? next : tr) : [...t.tracks, next] }) }),
      undo: scene => ({ ...scene, timelines: scene.timelines.map(t => t.id === this.id ? prev : t) }),
    })
    return this
  }

  removeTrack(target: string): this {
    const prev = this.data
    this.ctx.host.applyCommand({ label: 'Remove track', execute: scene => ({ ...scene, timelines: scene.timelines.map(t => t.id !== this.id ? t : { ...t, tracks: t.tracks.filter(tr => tr.target !== target) }) }), undo: scene => ({ ...scene, timelines: scene.timelines.map(t => t.id === this.id ? prev : t) }) })
    return this
  }

  modifier(target: string, config: Partial<CurveModifier> & Pick<CurveModifier, 'type'>): this {
    if (!this.data.tracks.some(t => t.target === target)) this.track(target, {})
    this.ctx.host.applyCommand(makeAddCurveModifierCmd(this.id, { kind: 'track', target }, {
      id: nextModifierId(), enabled: true, blendMode: 'add', weight: 1, parameters: {}, ...config,
    }))
    return this
  }

  bake(target: string, fps = 60, tolerance = 0.005): this {
    const track = this.data.tracks.find(t => t.target === target)
    if (!track) throw new Error(`Track '${target}' not found`)
    this.ctx.host.applyCommand(makeBakeTrackToKeyframesCmd(this.id, target, track, { startMs: 0, endMs: this.data.durationMs, fps, tolerance }))
    return this
  }
}
