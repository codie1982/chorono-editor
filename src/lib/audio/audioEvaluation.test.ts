import { describe, expect, it } from 'vitest'
import type { ChronoScene, Layer } from '../types'
import { audibleAudioLayers, buildAudioClipSchedule, evaluateAudioClip, resolveAudioGain } from './audioEvaluation'
const audio = (patch: Partial<Layer> = {}): Layer => ({ id: 'a', name: 'Audio', type: 'audio', transform: { x: 0, y: 0 }, startMs: 1000, endMs: 5000, audio: { assetId: 'asset', volume: 1 }, ...patch } as Layer)
const scene = (layers: Layer[]): ChronoScene => ({ layers, timelines: [{ id: 'one', durationMs: 10000, autoplay: false, loop: false, tracks: [] }, { id: 'two', durationMs: 10000, autoplay: false, loop: false, tracks: [] }] } as unknown as ChronoScene)

describe('shared audio evaluation', () => {
  it('uses half-open clip bounds, trim offset and positive loop modulo for late seek', () => {
    const layer = audio({ endMs: 20000, audio: { assetId: 'asset', startOffsetMs: 1000, loop: true } })
    expect(evaluateAudioClip(layer, 5000, 13000)?.sourceOffsetSec).toBe(3)
    expect(evaluateAudioClip(layer, 5000, 999)).toBeNull()
    expect(evaluateAudioClip(layer, 5000, 20000)).toBeNull()
    expect(evaluateAudioClip(audio({ audio: { assetId: 'asset', startOffsetMs: 3000 } }), 5000, 3000)).toBeNull()
  })
  it('applies animated linear gain above unity, pan and both fades', () => {
    const layer = audio({ audio: { assetId: 'asset', fadeInMs: 1000, fadeOutMs: 1000 } })
    const overrides = new Map([['layers.a.audio.volume', 3], ['layers.a.audio.pan', -0.75]])
    expect(evaluateAudioClip(layer, 10000, 1500, { overrides })).toMatchObject({ gain: 1.5, pan: -0.75 })
    expect(evaluateAudioClip(layer, 10000, 4500, { overrides })?.gain).toBe(1.5)
    expect(resolveAudioGain({ ...layer, audio: { ...layer.audio!, muted: true } }, 10000, 1500, { overrides })).toBe(0)
  })
  it('retains original fade reference across split and negative moved anchors', () => {
    const original = audio({ startMs: 0, endMs: 4000, audio: { assetId: 'asset', fadeInMs: 2000, fadeOutMs: 1000 } })
    const left = { ...original, endMs: 1000, audio: { ...original.audio!, fadeRange: { startMs: 0, endMs: 4000 } } }
    const right = { ...original, startMs: 1000, audio: { ...original.audio!, startOffsetMs: 1000, fadeRange: { startMs: 0, endMs: 4000 } } }
    expect(resolveAudioGain(left, 10000, 999.999)).toBeCloseTo(0.5, 5)
    expect(resolveAudioGain(right, 10000, 1000)).toBe(0.5)
    expect(resolveAudioGain({ ...right, startMs: 0, endMs: 3000, audio: { ...right.audio, fadeRange: { startMs: -1000, endMs: 3000 } } }, 10000, 0)).toBe(0.5)
  })
  it('isolates audio owners, hidden ancestors and audio solo independently of visual solo', () => {
    const global = audio(), owned = audio({ id: 'b', audio: { assetId: 'asset', timelineId: 'two' } })
    const visual = { id: 'visual', type: 'shape', solo: true } as Layer
    expect(audibleAudioLayers(scene([global, owned, visual]), { timelineIds: ['one'] }).map(l => l.id)).toEqual(['a'])
    expect(audibleAudioLayers(scene([global, { ...owned, solo: true }])).map(l => l.id)).toEqual(['b'])
    expect(audibleAudioLayers(scene([{ ...global, parentId: 'g' }, { id: 'g', type: 'group', hidden: true } as Layer]))).toEqual([])
    expect(audibleAudioLayers(scene([{ ...global, parentId: 'g' }, { id: 'g', type: 'group', parentId: 'a' } as Layer]))).toEqual([])
    expect(audibleAudioLayers(scene([audio({ audio: { assetId: 'asset', timelineId: 'missing' } })]))).toEqual([])
  })
  it('schedules exact delayed starts/stops at changed rate with original source phase', () => {
    const layer = audio({ endMs: 3500, audio: { assetId: 'asset', startOffsetMs: 500, loop: true, fadeInMs: 1000 } })
    const schedule = buildAudioClipSchedule(layer, 2000, 500, 4000, { playbackSpeed: 2, getOverridesAtTime: t => new Map([['layers.a.audio.volume', t / 1000]]) })!
    expect(schedule).toMatchObject({ contextStartSec: 0.25, contextDurationSec: 1.25, stopTimeSec: 1.5, sourceOffsetSec: 0.5, sourceRate: 2, loop: true })
    expect(schedule.gainPoints.find(p => p.timeSec === 0.5)?.value).toBe(0.75)
    const late = buildAudioClipSchedule(layer, 2000, 3200, 3400)!
    expect(late.sourceOffsetSec).toBeCloseTo(0.7)
    expect(late.gainPoints.at(-1)?.value).toBe(1)
  })
  it('keeps another timeline solo out of isolated playback and supports shared clone membership', () => {
    const first = audio({ audio: { assetId: 'asset', timelineId: 'one' } })
    const second = audio({ id: 'b', solo: true, audio: { assetId: 'asset', timelineId: 'two' } })
    const value = scene([first, second, { id: 'g', type: 'group', solo: true } as Layer])
    expect(audibleAudioLayers(value, { timelineIds: ['one'] }).map(l => l.id)).toEqual(['a'])
    value.timelines[1].layerIds = ['a']
    second.solo = false
    expect(audibleAudioLayers(value, { timelineIds: ['two'] }).map(l => l.id)).toEqual(['a', 'b'])
    expect(audibleAudioLayers(value, { timelineIds: [] })).toEqual([])
  })
})
