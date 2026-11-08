import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { acquireAudioBuffer, type AudioPcmLease } from './AudioAssetService'
import { acquireAudioMix,renderAudioMix, normalizedClipGain } from './audioRender'
import {OutputResources} from '../export/resources'
import { emptyScene, newAudioLayer } from '../defaults'

vi.mock('./AudioAssetService', () => ({ acquireAudioBuffer: vi.fn() }))
const acquire = vi.mocked(acquireAudioBuffer)
const data = new Float32Array(480).fill(0.5)
const pcm: AudioBuffer = { length: 480, numberOfChannels: 2, duration: 0.01, sampleRate: 48000,
  getChannelData: () => data, copyFromChannel: () => {}, copyToChannel: () => {} }
const release = vi.fn()
const lease = (): AudioPcmLease => ({ buffer: pcm, release, retain: lease })
const param = () => ({ value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() })
class FakeNode {
  gain = param(); pan = param(); playbackRate = param(); buffer: AudioBuffer | null = null; loop = false
  connect(node: FakeNode) { return node }
  disconnect = vi.fn()
  start = vi.fn(); stop = vi.fn()
}
const nodes: FakeNode[] = []
let failRendering = false
let nativeRender:Promise<AudioBuffer>|undefined,renderStarted:(()=>void)|undefined,contexts=0
class FakeOffline {
  constructor(){contexts++}
  destination = new FakeNode()
  createGain = () => new FakeNode()
  createStereoPanner = () => new FakeNode()
  createBufferSource = () => { const node = new FakeNode(); nodes.push(node); return node }
  async startRendering() {
    expect(release).not.toHaveBeenCalled()
    renderStarted?.()
    if(nativeRender)return nativeRender
    if (failRendering) throw new Error('native render failed')
    return pcm
  }
}
const scene = () => {
  const result = emptyScene()
  result.composition.durationMs = 10
  result.timelines = [{ id: 't', durationMs: 10, tracks: [], loop: false, autoplay: false }]
  result.assets = [{ id: 'audio', name: 'audio', type: 'audio', url: 'source', durationMs: 10 }]
  result.layers = [newAudioLayer('audio', 10)]
  return result
}
beforeEach(() => {
  acquire.mockReset().mockImplementation(async () => lease()); release.mockClear(); nodes.length = 0; failRendering = false
  nativeRender=undefined;renderStarted=undefined;contexts=0
  vi.stubGlobal('OfflineAudioContext', FakeOffline)
})
afterEach(() => vi.unstubAllGlobals())

describe('offline PCM input lease ownership', () => {
  it('holds input through native rendering, preserves output PCM/WAV, and clears source references afterwards', async () => {
    const result = await renderAudioMix(scene())
    expect(result.stats.peak).toBe(0.5); expect(result.stats.clippedSamples).toBe(0)
    expect(result.bytes.length).toBe(44 + 480 * 2 * 2)
    expect(result.clips[0]).toMatchObject({ startSec: 0, durationSec: 0.01 })
    expect(release).toHaveBeenCalledOnce(); expect(nodes[0].buffer).toBeNull(); expect(nodes[0].disconnect).toHaveBeenCalledOnce()
    expect(data[0]).toBe(0.5)
  })
  it('unwinds input leases and source references when native rendering rejects', async () => {
    failRendering = true
    await expect(renderAudioMix(scene())).rejects.toThrow('native render failed')
    expect(release).toHaveBeenCalledOnce(); expect(nodes[0].buffer).toBeNull()
  })
  it('normalization returns the same source peak and releases ownership on completion', async () => {
    const current = scene()
    const result = await normalizedClipGain(current, current.layers[0].id, -6)
    expect(result.sourcePeak).toBe(0.5); expect(result.reachedTarget).toBe(true)
    expect(release).toHaveBeenCalledOnce(); expect(current.layers[0].audio?.volume).toBe(1)
  })
  it('denies offline native allocation before context construction when the output budget cannot fit',async()=>{
    const resources=new OutputResources({maxBytes:1024})
    await expect(acquireAudioMix(scene(),{},{resources})).rejects.toThrow('budget')
    expect(contexts).toBe(0);expect(acquire).not.toHaveBeenCalled();expect(resources.getSnapshot().residency.chargedBytes).toBe(0);resources.dispose()
  })
  it('keeps source PCM and cancelled native rendering charged until actual completion',async()=>{
    const resources=new OutputResources(),abort=new AbortController()
    let finish!:(buffer:AudioBuffer)=>void
    nativeRender=new Promise(yes=>{finish=yes});const started=new Promise<void>(yes=>{renderStarted=yes})
    const pending=acquireAudioMix(scene(),{},{resources,signal:abort.signal}),rejected=expect(pending).rejects.toMatchObject({name:'AbortError'})
    await started;abort.abort();expect(release).not.toHaveBeenCalled();expect(nodes[0].buffer).toBe(pcm)
    expect(resources.getSnapshot().jobs.active).toBe(1);expect(resources.getSnapshot().residency.chargedBytes).toBeGreaterThan(0)
    finish(pcm);await rejected
    expect(nodes[0].buffer).toBeNull();expect(release).toHaveBeenCalledOnce();expect(resources.getSnapshot().residency.chargedBytes).toBe(0);resources.dispose()
  })
  it('quarantines a failed source detach with its PCM pin and retries through the owner',async()=>{
    const resources=new OutputResources()
    acquire.mockImplementationOnce(async()=>{
      // The graph creates its source only after acquire returns; fail on the
      // first actual detach, not on a mirrored accounting-only callback.
      renderStarted=()=>nodes[0].disconnect.mockImplementationOnce(()=>{throw new Error('native detach failed')})
      return lease()
    })
    const result=await acquireAudioMix(scene(),{},{resources})
    expect(result.value.stats.peak).toBe(.5);expect(release).not.toHaveBeenCalled();result.release()
    expect(resources.getSnapshot().residency.failedEntries).toBe(1);expect(resources.getSnapshot().residency.chargedBytes).toBeGreaterThan(0)
    resources.clearIdle();expect(release).toHaveBeenCalledOnce();expect(resources.getSnapshot().residency.chargedBytes).toBe(0);resources.dispose()
  })
})
