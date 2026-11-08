import { visualAssetService, type VisualAssetService, type VisualLease } from '../../asset/visual'
import type { AssetElementMap } from '../../asset/visual/AssetElementMap'
import { VisualDemandResolver } from './VisualDemandResolver'
import type { MediaFrameBridge, MediaFrameInput, VisualDemand } from './types'
import { MediaElementSnapshot, type MediaElementRecord } from './MediaElementSnapshot'
import {fontAssetService,FontBindingsSnapshot,type FontAssetService,type FontLease,type FontBindingRecord} from '../../asset/fonts'

interface Consumer { demand: VisualDemand; controller: AbortController; state: 'idle' | 'loading' | 'ready' | 'error'; lease?: VisualLease|FontLease; error?: string; detach?: () => void }
let nextScope = 0

/**
 * One viewport/player/job's visual and font consumer ownership. Each instance has a process-local
 * clip scope, a current demand diff and at most two submitted consumer requests;
 * the shared service still owns actual native concurrency, bytes and LRU. Queued
 * demand here is lightweight scene metadata, not thousands of native requests.
 * Source/scene JSON is never mutated. Stop cancels/releases this consumer only.
 * Construction is side-effect free and start/stop support React StrictMode replay.
 */
export class VisualMediaSession implements MediaFrameBridge {
  private readonly scope = `visual-session-${++nextScope}`
  private readonly resolver = new VisualDemandResolver()
  private readonly consumers = new Map<string, Consumer>()
  private readonly waiters = new Set<() => void>()
  private active = false
  private inFlight = 0
  private changed?: () => void
  private missing: readonly string[] = []
  /** Borrow one service contract; a process-local scope prevents native clip
   * clocks from aliasing across editor/player/jobs without serializing IDs. */
  constructor(private readonly service: VisualAssetService = visualAssetService,private readonly fontService:FontAssetService=fontAssetService) {}

  /** Activate the owner; listener is invalidation only, not resource ownership. */
  start(changed?: () => void): void { this.active = true; this.changed = changed }
  /** Release pins and pending requests. Returned old maps become borrowed stale
   * views and must not be used by async jobs; jobs create their own session. */
  stop(): void {
    this.active = false; this.changed = undefined
    this.consumers.forEach(consumer => this.release(consumer)); this.consumers.clear(); this.missing = []; this.notify()
  }
  /** Prepare actual draw plus conservative warm demand; completion invalidates
   * the host. Temporal/ghost calls extend the same current demand, never erase it. */
  request(input: MediaFrameInput, mode: 'replace' | 'extend' = 'replace'): void {
    if (!this.active) return
    const demand = this.resolver.resolve(input)
    const missing = mode === 'extend' ? Array.from(new Set([...this.missing, ...this.resolver.missing])) : this.resolver.missing
    this.setDemand(mode === 'extend' ? [...Array.from(this.consumers.values(), consumer => consumer.demand), ...demand] : demand)
    this.missing = missing
  }
  /** Replace descriptors without resubmitting unchanged source/clip identity.
   * New current sources are prioritized over warm entries; each error persists
   * until the demand set changes or an explicit retry avoids a render retry loop. */
  setDemand(demand: readonly VisualDemand[]): void {
    if (!this.active) return
    this.missing = []
    const wanted = new Map<string, VisualDemand>()
    demand.forEach(item => { const old = wanted.get(item.key); wanted.set(item.key, { ...item, required: item.required || !!old?.required }) })
    let changed = false
    this.consumers.forEach((consumer, key) => {
      if (!wanted.has(key)) { this.release(consumer); this.consumers.delete(key); changed = true }
    })
    wanted.forEach((item, key) => {
      const old = this.consumers.get(key)
      if (old) {
        old.demand = item
        if (!item.required && old.lease) { this.releasePin(old); changed = true }
        if (item.required && old.state === 'ready' && !old.lease) { old.state = 'idle'; changed = true }
      }
      else { this.consumers.set(key, { demand: item, controller: new AbortController(), state: 'idle' }); changed = true }
    })
    if (changed) { this.retryFailures(false); this.notify() }
    this.pump()
  }
  /** Explicit retry, or one attempt after the working set changes. */
  retryFailures(pump = true): void {
    this.consumers.forEach(consumer => { if (consumer.state === 'error') { consumer.state = 'idle'; consumer.error = undefined } })
    if (pump) this.pump()
  }
  /** Build a borrowed map of ready current elements. Images retain the legacy
   * asset lookup; videos have clip-specific lookup and one legacy alias for
   * older diagnostics. Only videoForLayer is authoritative for drawing. Font
   * bindings expose source-scoped aliases/status without native handles; both
   * maps and bindings expire when their exact consumer pin is released. */
  elements(frameDemand = true): AssetElementMap {
    const records: MediaElementRecord[] = []
    const fonts:FontBindingRecord[]=[]
    this.consumers.forEach((consumer, key) => {
      if(consumer.demand.asset.type==='font'){
        fonts.push({asset:consumer.demand.asset,get alias(){const value=consumer.lease?.value;return value&&'alias'in value?value.alias:undefined},state:()=>{
          if(this.consumers.get(key)!==consumer)return 'notResident'
          return consumer.lease?'ready':consumer.state==='error'?'error':consumer.state==='ready'?'notResident':'loading'
        }})
        return
      }
      if (!consumer.lease) return
      const { asset, layerId } = consumer.demand,value=consumer.lease.value
      if(!('element'in value))return
      const element=value.element
      records.push({ assetId: asset.id, layerId, element, live: () => this.consumers.get(key) === consumer && consumer.lease?.value===value })
    })
    return new MediaElementSnapshot(records, frameDemand ? this : undefined,new FontBindingsSnapshot(fonts))
  }
  /** Readiness/errors only; no acquire or LRU refresh. IDs refer to source assets. */
  snapshot() {
    const loading = new Set<string>(), errors: Record<string, string> = {}
    this.missing.forEach(id => { errors[id] = 'Asset metadata is missing.' })
    this.consumers.forEach(consumer => {
      if (consumer.state === 'idle' || consumer.state === 'loading') loading.add(consumer.demand.asset.id)
      if (consumer.error) errors[consumer.demand.asset.id] = consumer.error
    })
    return { loading: Array.from(loading), errors }
  }
  /** Final jobs wait for every current required pin. Failure is explicit rather
   * than returning a successfully blank image. Aborted/stopped sessions reject. */
  async ready(): Promise<void> {
    if (this.missing.length) throw new Error(`Missing media asset metadata: ${this.missing.join(', ')}`)
    while (this.active && Array.from(this.consumers.values()).some(consumer => consumer.demand.required && ['idle', 'loading'].includes(consumer.state))) {
      await new Promise<void>(resolve => this.waiters.add(resolve))
    }
    if (!this.active) throw new Error('Media preparation consumer stopped.')
    const failed = Array.from(this.consumers.values()).find(consumer => consumer.demand.required && consumer.state === 'error')
    if (failed) throw new Error(`Media '${failed.demand.asset.name}' is unavailable: ${failed.error}`)
  }
  /** Producer completions are checked against exact entry identity after every
   * await; removed/replaced/StrictMode requests cannot revive an obsolete map. */
  private pump(): void {
    if (!this.active) return
    const waiting = Array.from(this.consumers.values()).filter(consumer => consumer.state === 'idle')
      .sort((a, b) => Number(b.demand.required) - Number(a.demand.required))
    for (const consumer of waiting) {
      if (this.inFlight >= 2) break
      this.inFlight++; consumer.state = 'loading'
      const { asset, layerId, key } = consumer.demand
      const preparation:Promise<VisualLease|FontLease>=asset.type==='font'
        ?this.fontService.acquire(asset,{signal:consumer.controller.signal})
        :this.service.acquire(asset, { consumerId: layerId ? `${this.scope}:${layerId}` : undefined, signal: consumer.controller.signal })
      preparation.then(lease => {
        if (!this.active || consumer.controller.signal.aborted || this.consumers.get(key) !== consumer) { lease.release(); return }
        consumer.state = 'ready'
        if (!consumer.demand.required) { lease.release(); return }
        consumer.lease = lease
        if (asset.type === 'video'&&'element'in lease.value) {
          const element = lease.value.element, redraw = () => this.notify()
          element.addEventListener?.('seeked', redraw)
          consumer.detach = () => element.removeEventListener?.('seeked', redraw)
        }
      }, error => {
        if (this.consumers.get(key) !== consumer || consumer.controller.signal.aborted) return
        consumer.error = error instanceof Error ? error.message : String(error); consumer.state = 'error'
      }).finally(() => { this.inFlight--; this.pump(); this.notify() })
    }
  }
  /** Stop an owned clip before releasing its last consumer pin; warm decoders
   * never keep producing playback/audio after this consumer leaves. */
  private release(consumer: Consumer): void {
    consumer.controller.abort()
    this.releasePin(consumer)
  }
  /** Warm prefetch never pins storage indefinitely. Pressure may evict it before
   * the actual frame promotes it; required promotion acquires a fresh cache pin. */
  private releasePin(consumer: Consumer): void {
    consumer.detach?.()
    consumer.detach = undefined
    const value=consumer.lease?.value
    if (value&&'element'in value&&consumer.demand.asset.type === 'video') (value.element as HTMLVideoElement).pause()
    consumer.lease?.release(); consumer.lease = undefined
  }
  /** Coalesced host notification is delegated to React/browser scheduling. */
  private notify(): void { this.changed?.(); this.waiters.forEach(resolve => resolve()); this.waiters.clear() }
}
