import { describe, expect, it, vi } from 'vitest'
import type { Asset, ChronoScene, Layer } from './types'
import { AudioAssetService } from './audio/AudioAssetService'
import { AudioEngine } from './audioEngine'
class Param {
  value = 0
  points: Array<[string, number, number]> = []
  cancelScheduledValues = vi.fn()
  setValueAtTime(value: number, time: number) { this.value = value; this.points.push(['set', value, time]); return this }
  linearRampToValueAtTime(value: number, time: number) { this.value = value; this.points.push(['ramp', value, time]); return this }
}
class Node {
  gain = new Param(); pan = new Param(); playbackRate = new Param(); buffer: AudioBuffer | null = null; loop = false; fftSize = 1024
  onended: (() => void) | null = null
  connect = vi.fn(() => this)
  disconnect = vi.fn()
  start = vi.fn(); stop = vi.fn()
  getFloatTimeDomainData = (data: Float32Array) => { data.fill(0.25) }
}
const asset = (id = 'asset', url = id): Asset => ({ id, name: id, url, type: 'audio' })
const layer = (patch: Partial<Layer> = {}): Layer => ({ id: 'a', name: 'Audio', type: 'audio', startMs: 0, endMs: 20000, audio: { assetId: 'asset', volume: 1, loop: true }, ...patch } as Layer)
const scene = (layers = [layer()]): ChronoScene => ({ layers, timelines: [{ id: 't', durationMs: 20000, autoplay: false, loop: false, tracks: [] }] } as unknown as ChronoScene)
function harness() {
  const sources: Node[] = [], gains: Node[] = [], analysers: Node[] = []
  const buffer = { duration: 5, length: 50, numberOfChannels: 1 } as AudioBuffer
  const context = { state: 'running', currentTime: 0, destination: new Node(), decodeAudioData: vi.fn(async () => buffer),
    createBufferSource: () => { const node = new Node(); sources.push(node); return node },
    createGain: () => { const node = new Node(); gains.push(node); return node }, createStereoPanner: () => new Node(), createChannelSplitter: () => new Node(),
    createAnalyser: () => { const node = new Node(); analysers.push(node); return node } }
  const service = new AudioAssetService({ createContext: () => context as unknown as AudioContext,
    fetch: vi.fn(async () => new Response(new Uint8Array(1))) })
  return { engine: new AudioEngine(service), service, context, sources, gains, analysers }
}

describe('live Web Audio reconciliation', () => {
  it('loads only audible time-window sources from thousands of registered assets and releases old consumers on seek', async () => {
    const { engine, service, context, sources } = harness()
    const sample = { ...scene([layer({ endMs: 1000 }), layer({ id: 'next', startMs: 10000, endMs: 11000,
      audio: { assetId: 'next', loop: true } })]), assets: [asset(), asset('next'), ...Array.from({ length: 3000 }, (_, i) => asset(`unused-${i}`))] }
    await engine.prepareForTime(sample, 0, 1)
    expect(context.decodeAudioData).toHaveBeenCalledOnce()
    expect(engine.prepareForTime(sample, 0, 1)).toBeNull()
    engine.syncToTime(sample, 0, true, 1)
    expect(engine.getState().sources[0].assetId).toBe('asset')
    await engine.prepareForTime(sample, 10000, 1)
    expect(context.decodeAudioData).toHaveBeenCalledTimes(2)
    expect(sources[0].buffer).toBeNull()
    engine.syncToTime(sample, 10000, true, 1)
    expect(engine.getResourceSnapshot().assets.map(value => value.id)).toEqual(['next'])
    expect(engine.getState().sources[0].assetId).toBe('next')
    await engine.prepareForTime({ ...sample, layers: [] }, 10000, 1)
    service.clearIdle()
    expect(service.getMemorySnapshot().residency?.chargedBytes).toBe(0)
    engine.dispose()
  })
  it('unwinds a source start failure without leaking the active source PCM pin', async () => {
    const { engine, service, context, sources } = harness()
    await engine.setAssets([asset()])
    const create = context.createBufferSource
    context.createBufferSource = () => { const node = create(); node.start.mockImplementation(() => { throw new Error('start failed') }); return node }
    expect(() => engine.syncToTime(scene(), 0, true, 1)).toThrow('start failed')
    expect(sources[0].buffer).toBeNull(); expect(engine.getState().sources).toEqual([])
    engine.dispose(); service.clearIdle()
    expect(service.getMemorySnapshot().residency?.chargedBytes).toBe(0)
  })
  it('seeks late looping audio by modulo and stops it at the full exact clip end', async () => {
    const { engine, sources } = harness(); await engine.setAssets([asset()])
    engine.syncToTime(scene(), 12000, true, 1)
    expect(sources[0].start).toHaveBeenCalledWith(0, 2)
    expect(sources[0].stop).toHaveBeenCalledWith(8)
    expect(engine.getState().sources[0]).toMatchObject({ sourceOffsetSec: 2, stopsAtContextSec: 8 })
  })
  it('reschedules even an early rate change, source replacement or small offset edit', async () => {
    const { engine, sources, context } = harness(); await engine.setAssets([asset()])
    engine.syncToTime(scene(), 0, true, 1)
    context.currentTime = 0.02; engine.syncToTime(scene(), 20, true, 2)
    expect(sources).toHaveLength(2); expect(sources[1].playbackRate.value).toBe(2)
    engine.syncToTime(scene([layer({ audio: { assetId: 'asset', loop: true, startOffsetMs: 5 } })]), 20, true, 2)
    expect(sources).toHaveLength(3)
    await engine.setAssets([asset('asset', 'replacement')]); engine.syncToTime(scene(), 20, true, 2)
    expect(sources).toHaveLength(4); expect(context.decodeAudioData).toHaveBeenCalledTimes(2)
    expect(sources[0].disconnect).toHaveBeenCalled()
  })
  it('schedules upcoming clip start exactly, uses current gain automation, and reports the master meter', async () => {
    const { engine, sources, gains } = harness(); await engine.setAssets([asset()])
    const sample = scene([layer({ startMs: 1000, endMs: 3000, audio: { assetId: 'asset', fadeInMs: 1000, pan: -0.5 } })])
    engine.syncToTime(sample, 900, true, 2, { masterVolume: 0.5 })
    expect(sources[0].start).toHaveBeenCalledWith(0.05, 0)
    expect(sources[0].stop).toHaveBeenCalledWith(1.05)
    engine.syncToTime(sample, 1500, true, 2, { overrides: new Map([['layers.a.audio.volume', 3]]) })
    expect(engine.getState().sources[0]).toMatchObject({ gain: 1.5, pan: -0.5, rate: 2 })
    expect(engine.getState().meter).toEqual({ peak: 0.25, rms: 0.25, clipped: false })
    expect(gains[0].gain.value).toBe(0.5)
    engine.syncToTime(sample, 1500, false, 2)
    expect(engine.getState().sources).toEqual([]); expect(engine.getState().meter.peak).toBe(0)
  })
  it('meters opposing stereo channels without downmix cancellation', async () => {
    const { engine, analysers } = harness(); await engine.setAssets([asset()])
    engine.syncToTime(scene(), 0, true, 1)
    analysers[0].getFloatTimeDomainData = data => { data.fill(1.2) }
    analysers[1].getFloatTimeDomainData = data => { data.fill(-1.2) }
    engine.syncToTime(scene(), 0, true, 1)
    expect(engine.getState().meter.peak).toBeCloseTo(1.2)
    expect(engine.getState().meter.rms).toBeCloseTo(1.2)
    expect(engine.getState().meter.clipped).toBe(true)
  })
  it('stops removed assets and scoped/hidden audio, and never resumes after disposal', async () => {
    const { engine, sources } = harness(); await engine.setAssets([asset()])
    engine.syncToTime(scene(), 0, true, 1); await engine.setAssets([])
    expect(engine.getState().sources).toEqual([]); expect(sources[0].disconnect).toHaveBeenCalled()
    await engine.setAssets([asset()]); engine.syncToTime(scene([layer({ audio: { assetId: 'asset', timelineId: 't' } })]), 0, true, 1, { timelineIds: [] })
    expect(engine.getState().sources).toEqual([])
    engine.dispose(); await engine.setAssets([asset()]); engine.syncToTime(scene(), 0, true, 1)
    expect(engine.getState().sources).toEqual([])
  })
})
