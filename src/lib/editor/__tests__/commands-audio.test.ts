import { describe, expect, it } from 'vitest'
import { emptyScene, newAudioLayer, newTimeline } from '../../defaults'
import type { Asset, Layer, Track } from '../../types'
import { evaluateNumericTrack } from '../../evaluator'
import { dbToGain, gainToDb, resolveAudioClipWindow } from '../../audio/audioClip'
import { makeAddAudioClipCmd, makeMoveAudioClipCmd, makePatchAudioClipCmd, makeSetAudioGainKeyCmd, makeSplitAudioClipCmd, makeTrimAudioClipCmd } from '../commands-audio'
import { makeDeleteLayerCmd, makeDuplicateLayerCmd } from '../commands-layer'

const source: Asset = { id: 'sound', type: 'audio', name: 'Voice.wav', url: 'blob:voice', durationMs: 10000 }
function fixture() {
  const scene = emptyScene()
  const layer: Layer = { ...newAudioLayer(source.id, source.durationMs), id: 'voice', name: 'Voice', startMs: 1000, endMs: 6000,
    audio: { assetId: source.id, startOffsetMs: 2000, volume: 1, fadeInMs: 3000, fadeOutMs: 2000, timelineId: 'main' } }
  const track: Track = { target: 'layers.voice.audio.volume', keyframes: [
    { id: 'gain_a', timeMs: 0, value: 0.2, easing: { type: 'easeInOut' } },
    { id: 'gain_b', timeMs: 8000, value: 1.5, easing: { type: 'linear' } },
  ] }
  scene.assets = [source]
  scene.layers = [layer]
  scene.composition.durationMs = 1000
  scene.timelines = [{ ...newTimeline(), id: 'main', layerIds: ['voice'], tracks: [track], durationMs: 6000 },
    { ...newTimeline(), id: 'other', layerIds: ['voice'], tracks: [{ ...track }], durationMs: 1000 }]
  return { scene, layer, track }
}

describe('audio clip commands', () => {
  it('adds source, named clip, active membership and playback duration atomically at the playhead', () => {
    const { scene } = fixture()
    scene.layers = []; scene.assets = []; scene.timelines[0].layerIds = []
    const other = scene.timelines[1]
    const command = makeAddAudioClipCmd(source, { timelineId: 'main', startMs: 2500, layerId: 'added' })
    const after = command.execute(scene)
    expect(after.layers[0]).toMatchObject({ id: 'added', name: 'Voice.wav', startMs: 2500, endMs: 12500, audio: { timelineId: 'main' } })
    expect(after.assets).toEqual([source])
    expect(after.timelines[0]).toMatchObject({ layerIds: ['added'], durationMs: 12500 })
    expect(after.timelines[1]).toBe(other)
    expect(after.composition.durationMs).toBe(12500)
    expect(command.undo(after)).toBe(scene)
    expect(command.execute(scene).layers[0].id).toBe('added')
  })

  it('reuses one source and can duplicate a trimmed clip without expanding it', () => {
    const { scene, layer } = fixture()
    const after = makeAddAudioClipCmd(source, { layer: { ...layer, id: 'copy' }, timelineId: 'main', preserveDuration: true }).execute(scene)
    expect(after.assets).toHaveLength(1)
    expect(after.layers[1]).toMatchObject({ startMs: 1000, endMs: 6000, audio: { startOffsetMs: 2000 } })
    expect(after.timelines[0].layerIds).toEqual(['voice', 'copy'])
  })

  it('native clip deletion removes its rows and gain tracks while retaining the shared source and restoring on undo', () => {
    const { scene, layer } = fixture()
    const sibling: Layer = { ...layer, id: 'sibling', name: 'Another clip' }
    scene.layers.push(sibling)
    scene.timelines[0].layerIds!.push(sibling.id)
    const siblingTrack: Track = { ...scene.timelines[0].tracks[0], target: 'layers.sibling.audio.volume' }
    scene.timelines[0].tracks.push(siblingTrack)
    const command = makeDeleteLayerCmd(layer)
    const after = command.execute(scene)
    expect(after.layers).toEqual([sibling])
    expect(after.assets).toBe(scene.assets)
    expect(after.assets).toEqual([source])
    expect(after.timelines[0].layerIds).toEqual(['sibling'])
    expect(after.timelines[0].tracks).toEqual([siblingTrack])
    expect(after.timelines[1].tracks).toEqual([])
    expect(command.undo(after)).toBe(scene)
    expect(command.execute(scene).layers).toEqual([sibling])
  })

  it('routes ordinary duplicate/paste through audio insertion with membership and envelope identity', () => {
    const { scene, layer } = fixture()
    const original = { ...layer, audio: { ...layer.audio!, fadeRange: { startMs: -1000, endMs: 8000 } } }
    scene.layers = [original]
    const copy = { ...original, id: 'copy', name: 'Voice Copy', startMs: 3000, endMs: 8000 }
    const command = makeDuplicateLayerCmd(original, copy)
    const after = command.execute(scene)
    expect(after.assets).toHaveLength(1)
    expect(after.layers[1]).toMatchObject({ startMs: 3000, endMs: 8000, audio: { fadeRange: { startMs: 1000, endMs: 10000 }, startOffsetMs: 2000 } })
    expect(after.timelines[0].layerIds).toEqual(['voice', 'copy'])
    const track = after.timelines[0].tracks[1]
    expect(track.target).toBe('layers.copy.audio.volume')
    expect(track.keyframes.map(key => key.timeMs)).toEqual([2000, 10000])
    expect(command.undo(after)).toBe(scene)
    expect(command.execute(scene).timelines[0].tracks[1].keyframes.map(key => key.id)).toEqual(track.keyframes.map(key => key.id))
  })

  it('moves a clip and only its selected volume envelope without changing source in or duration', () => {
    const { scene } = fixture()
    const other = scene.timelines[1]
    const after = makeMoveAudioClipCmd('voice', 3000, { timelineId: 'main' }).execute(scene)
    expect(after.layers[0]).toMatchObject({ startMs: 3000, endMs: 8000, audio: { startOffsetMs: 2000 } })
    expect(after.timelines[0].tracks[0].keyframes.map(key => key.timeMs)).toEqual([2000, 10000])
    expect(after.timelines[1]).toBe(other)
  })

  it('left-trims source in by the same delta and preserves all keyed curve values', () => {
    const { scene, track } = fixture()
    const command = makeTrimAudioClipCmd('voice', { startMs: 1500, endMs: 5500 }, { timelineId: 'main' })
    const after = command.execute(scene)
    expect(after.layers[0]).toMatchObject({ startMs: 1500, endMs: 5500, audio: { startOffsetMs: 2500 } })
    expect(after.timelines[0].tracks[0]).toBe(track)
    expect(command.undo(after)).toBe(scene)
  })

  it('clamps source-bound trims and cannot extend before the beginning of the source', () => {
    const { scene } = fixture()
    const after = makeTrimAudioClipCmd('voice', { startMs: 0, endMs: 20000 }).execute(scene)
    expect(after.layers[0]).toMatchObject({ startMs: 0, endMs: 9000, audio: { startOffsetMs: 1000 } })
    expect(resolveAudioClipWindow(after.layers[0], source.durationMs).sourceEndMs).toBe(10000)
  })

  it('splits losslessly with shared source, exact envelopes, unique stable key ids and one-step undo', () => {
    const { scene, track } = fixture()
    const other = scene.timelines[1]
    const command = makeSplitAudioClipCmd('voice', 2500, { timelineId: 'main', rightLayerId: 'right' })
    const after = command.execute(scene)
    expect(after.layers[0]).toMatchObject({ endMs: 2500, audio: { fadeRange: { startMs: 1000, endMs: 6000 } } })
    expect(after.layers[1]).toMatchObject({ id: 'right', startMs: 2500, endMs: 6000, audio: { assetId: 'sound', startOffsetMs: 3500, fadeInMs: 3000, fadeOutMs: 2000 } })
    const rightTrack = after.timelines[0].tracks[1]
    expect(rightTrack.target).toBe('layers.right.audio.volume')
    expect(new Set([...track.keyframes, ...rightTrack.keyframes].map(key => key.id)).size).toBe(4)
    for (const time of [2500, 3333, 5000, 5999]) expect(evaluateNumericTrack(rightTrack, time)).toBeCloseTo(evaluateNumericTrack(track, time)!)
    expect(after.timelines[1]).toBe(other)
    expect(after.timelines[0].layerIds).toEqual(['voice', 'right'])
    const ids = rightTrack.keyframes.map(key => key.id)
    expect(command.undo(after)).toBe(scene)
    expect(command.execute(scene).timelines[0].tracks[1].keyframes.map(key => key.id)).toEqual(ids)
  })

  it('keeps the original fade and volume curve when moving a split right half to zero', () => {
    const { scene, track } = fixture()
    const split = makeSplitAudioClipCmd('voice', 2500, { rightLayerId: 'right' }).execute(scene)
    const moved = makeMoveAudioClipCmd('right', 0).execute(split)
    const range = resolveAudioClipWindow(moved.layers[1], source.durationMs)
    expect(range).toMatchObject({ startMs: 0, endMs: 3500, sourceOffsetMs: 3500, fadeStartMs: -1500, fadeEndMs: 3500, fadeInMs: 3000 })
    for (const t of [0, 500, 2000]) expect(evaluateNumericTrack(moved.timelines[0].tracks[1], t)).toBeCloseTo(evaluateNumericTrack(track, t + 2500)!)
  })

  it('reanchors an explicitly edited fade to the new clip edges and clamps gain/pan/fades', () => {
    const { scene } = fixture()
    const split = makeSplitAudioClipCmd('voice', 2500, { rightLayerId: 'right' }).execute(scene)
    const after = makePatchAudioClipCmd('right', { volume: 9, pan: -3, fadeInMs: 10000 }).execute(split)
    expect(after.layers[1].audio).toMatchObject({ volume: 4, pan: -1, fadeInMs: 3500 })
    expect(after.layers[1].audio?.fadeRange).toBeUndefined()
  })

  it('shortens a clip safely when source-in is changed near the end', () => {
    const { scene } = fixture()
    const after = makePatchAudioClipCmd('voice', { startOffsetMs: 9000 }).execute(scene)
    expect(after.layers[0]).toMatchObject({ startMs: 1000, endMs: 2000, audio: { startOffsetMs: 9000, fadeInMs: 1000, fadeOutMs: 1000 } })
    expect(() => makePatchAudioClipCmd('voice', { startOffsetMs: 10000 }).execute(scene)).toThrow(/no playable/)
  })

  it('extends the new owner and moves membership even if the inspector context names the old owner', () => {
    const { scene } = fixture()
    scene.timelines[1] = { ...scene.timelines[1], layerIds: [] }
    const command = makePatchAudioClipCmd('voice', { timelineId: 'other' }, { timelineId: 'main' })
    const after = command.execute(scene)
    expect(after.layers[0].audio?.timelineId).toBe('other')
    expect(after.timelines[1]).toMatchObject({ layerIds: ['voice'], durationMs: 6000 })
    expect(after.timelines[0]).toMatchObject({ layerIds: [], durationMs: 6000 })
    expect(command.undo(after)).toBe(scene)
  })

  it('keeps existing timeline view memberships when a clip becomes global', () => {
    const { scene } = fixture()
    scene.timelines[1] = { ...scene.timelines[1], layerIds: [] }
    const command = makePatchAudioClipCmd('voice', { timelineId: undefined }, { timelineId: 'main' })
    const after = command.execute(scene)
    expect(after.layers[0].audio?.timelineId).toBeUndefined()
    expect(after.timelines[0]).toBe(scene.timelines[0])
    expect(after.timelines[0].layerIds).toEqual(['voice'])
    expect(after.timelines[1]).toBe(scene.timelines[1])
    expect(after.timelines[1].layerIds).toEqual([])
    expect(command.undo(after)).toBe(scene)
  })

  it('preserves loop phase for trim and split beyond one source cycle', () => {
    const { scene } = fixture()
    scene.layers[0] = { ...scene.layers[0], endMs: 30000, audio: { ...scene.layers[0].audio!, loop: true } }
    const split = makeSplitAudioClipCmd('voice', 14000, { rightLayerId: 'right' }).execute(scene)
    expect(split.layers[1].audio?.startOffsetMs).toBe(5000)
    const trim = makeTrimAudioClipCmd('voice', { startMs: 14000 }).execute(scene)
    expect(trim.layers[0].audio?.startOffsetMs).toBe(5000)
  })

  it('rejects invalid mutations, locked clips and identity collisions without changing the scene', () => {
    const { scene } = fixture()
    expect(() => makeAddAudioClipCmd(source, { layerId: 'voice' }).execute(scene)).toThrow(/already exists/)
    expect(() => makeAddAudioClipCmd(source, { layerId: '' }).execute(scene)).toThrow(/must not be empty/)
    expect(() => makeMoveAudioClipCmd('voice', 0, { timelineId: '' }).execute(scene)).toThrow(/must not be empty/)
    expect(() => makeMoveAudioClipCmd('voice', Infinity).execute(scene)).toThrow(/finite/)
    expect(() => makePatchAudioClipCmd('voice', { volume: NaN }).execute(scene)).toThrow(/finite/)
    expect(() => makePatchAudioClipCmd('voice', { arbitrary: true } as never).execute(scene)).toThrow(/Unknown audio property/)
    expect(() => makeSplitAudioClipCmd('voice', 1000).execute(scene)).toThrow(/inside/)
    scene.layers[0] = { ...scene.layers[0], locked: true }
    for (const command of [makePatchAudioClipCmd('voice', { muted: true }), makeMoveAudioClipCmd('voice', 0), makeTrimAudioClipCmd('voice', { endMs: 4000 }), makeSplitAudioClipCmd('voice', 2000)]) expect(() => command.execute(scene)).toThrow(/Unlock/)
  })

  it('converts linear gain and decibels with an explicit silence value', () => {
    expect(gainToDb(1)).toBe(0)
    expect(gainToDb(0)).toBe(-Infinity)
    expect(dbToGain(-Infinity)).toBe(0)
    expect(dbToGain(6)).toBeCloseTo(1.995262)
    expect(dbToGain(30)).toBe(4)
  })

  it('updates only an existing gain key value, preserving its identity, exact time and curve metadata', () => {
    const { scene } = fixture()
    const beforeKey = { ...scene.timelines[0].tracks[0].keyframes[0], timeMs: 2000.25,
      easing: { type: 'customBezier' as const, bezier: { cx1: 0.2, cy1: -0.3, cx2: 0.8, cy2: 1.2 } }, tangentMode: 'aligned' as const,
      segmentModifiers: [{ id: 'modifier', type: 'noise' as const, enabled: true, blendMode: 'add' as const, weight: 0.2, parameters: { amplitude: 0.1 } }] }
    scene.timelines[0].tracks[0].keyframes[0] = beforeKey
    const command = makeSetAudioGainKeyCmd('voice', 2001, 2)
    const after = command.execute(scene)
    expect(after.timelines[0].tracks[0].keyframes[0]).toEqual({ ...beforeKey, value: 2 })
    expect(after.timelines[0].tracks[0].keyframes).toHaveLength(2)
    expect(after.timelines[1]).toBe(scene.timelines[1])
    expect(after.layers).toBe(scene.layers)
    expect(after.layers[0].audio?.volume).toBe(1)
    expect(command.undo(after)).toBe(scene)
  })

  it('creates a missing gain track with a stable linear key in one undo step', () => {
    const { scene } = fixture()
    scene.timelines[0] = { ...scene.timelines[0], tracks: [] }
    const command = makeSetAudioGainKeyCmd('voice', 2345, 0.5)
    const after = command.execute(scene)
    const key = after.timelines[0].tracks[0].keyframes[0]
    expect(after.timelines[0].tracks[0]).toMatchObject({ target: 'layers.voice.audio.volume', keyframes: [{ timeMs: 2345, value: 0.5, easing: { type: 'linear' } }] })
    expect(command.undo(after)).toBe(scene)
    expect(command.execute(scene).timelines[0].tracks[0].keyframes[0].id).toBe(key.id)
  })

  it('honors explicit gain-key scope and rejects locked or invalid input', () => {
    const { scene } = fixture()
    const after = makeSetAudioGainKeyCmd('voice', 1000, 3, { timelineId: 'other' }).execute(scene)
    expect(after.timelines[0]).toBe(scene.timelines[0])
    expect(after.timelines[1].tracks[0].keyframes.find(key => key.timeMs === 1000)?.value).toBe(3)
    expect(() => makeSetAudioGainKeyCmd('voice', NaN, 1).execute(scene)).toThrow(/finite/)
    expect(() => makeSetAudioGainKeyCmd('voice', 1000, Infinity).execute(scene)).toThrow(/finite/)
    scene.layers[0] = { ...scene.layers[0], locked: true }
    expect(() => makeSetAudioGainKeyCmd('voice', 1000, 1).execute(scene)).toThrow(/Unlock/)
  })
})
