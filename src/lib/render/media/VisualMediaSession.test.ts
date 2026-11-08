import { describe, expect, it, vi } from 'vitest'
import { VisualMediaSession } from './VisualMediaSession'
import { VisualAssetService, type VisualResource } from '../../asset/visual'
import type { VisualDemand } from './types'
import type { Asset } from '../../types'

const asset = (id: string): Asset => ({ id, name: id, type: 'image', url: id, width: 2, height: 2 })
const demand = (id: string): VisualDemand => ({ key: id, asset: asset(id), required: true })
function native(): VisualResource { return { element: {} as HTMLImageElement, ready: Promise.resolve(), width: 2, height: 2, dispose: vi.fn() } }

describe('one media consumer lifetime', () => {
  it('releases warm prefetch pins for pressure eviction and promotes a required frame without stale reuse', async () => {
    const decoder = vi.fn(() => native()), service = new VisualAssetService({ decoder })
    const session = new VisualMediaSession(service); session.start()
    session.setDemand([{ ...demand('warm'), required: false }])
    // ready waits required work only. A subsequently required demand joins the
    // same preparation, then downgrade demonstrates the actual idle admission.
    session.setDemand([demand('warm')]); await session.ready()
    session.setDemand([{ ...demand('warm'), required: false }])
    expect(service.getSnapshot().residency).toMatchObject({ protectedBytes: 0, reclaimableBytes: 16 })
    expect(session.elements().get('warm')).toBeUndefined()
    service.clearIdle(); session.setDemand([demand('warm')]); await session.ready()
    expect(decoder).toHaveBeenCalledTimes(2)
    expect(session.elements().get('warm')).toBeDefined(); session.stop(); service.dispose()
  })
  it('submits a bounded working set, preserves unchanged pins and makes old borrowed maps stale after demand leaves', async () => {
    const decoder = vi.fn(() => native()), service = new VisualAssetService({ decoder, maxBytes: 4096, maxEntries: 256 })
    const session = new VisualMediaSession(service); session.start()
    session.setDemand(Array.from({ length: 150 }, (_, i) => demand(String(i))))
    expect(service.getSnapshot().preparation.active).toBeLessThanOrEqual(2)
    await session.ready()
    expect(decoder).toHaveBeenCalledTimes(150); expect(service.getSnapshot().preparation.denied).toBe(0)
    const snapshot = session.elements(), element = snapshot.get('0')
    expect(JSON.stringify(snapshot)).toBe('{}')
    const external = {} as HTMLImageElement
    snapshot.set('foreign', external); expect(snapshot.get('foreign')).toBe(external)
    expect(snapshot.delete('foreign')).toBe(true); expect(snapshot.get('foreign')).toBeUndefined()
    session.setDemand([demand('0')]); await session.ready()
    expect(snapshot.get('1')).toBeUndefined(); expect(snapshot.get('0')).toBe(element)
    expect(decoder).toHaveBeenCalledTimes(150)
    session.stop(); expect(snapshot.get('0')).toBeUndefined(); service.clearIdle()
    expect(service.getSnapshot().residency.chargedBytes).toBe(0); service.dispose()
  })
  it('rejects required failures instead of silently completing, without a same-frame retry loop', async () => {
    const decoder = vi.fn(() => { throw new Error('native rejected') }), service = new VisualAssetService({ decoder })
    const session = new VisualMediaSession(service); session.start()
    session.setDemand([demand('bad')]); await expect(session.ready()).rejects.toThrow('native rejected')
    for (let i = 0; i < 20; i++) session.setDemand([demand('bad')])
    expect(decoder).toHaveBeenCalledOnce(); expect(session.snapshot().errors.bad).toContain('native rejected')
    session.stop(); service.dispose()
  })
  it('StrictMode stop/start cannot revive an old promise with the same source identity', async () => {
    let resolve!: () => void
    const ready = new Promise<void>(yes => { resolve = yes }), service = new VisualAssetService({ decoder: () => ({ ...native(), ready }) })
    const session = new VisualMediaSession(service); session.start(); session.setDemand([demand('same')])
    session.stop(); session.start(); session.setDemand([demand('same')]); resolve(); await session.ready()
    expect(session.elements().get('same')).toBeDefined()
    session.stop(); service.clearIdle(); expect(service.getSnapshot().residency.chargedBytes).toBe(0); service.dispose()
  })
})

it('does not revive an old image map after the same warm consumer reacquires an evicted source',async()=>{
  const service=new VisualAssetService({decoder:()=>native()}),session=new VisualMediaSession(service)
  session.start();session.setDemand([demand('same')]);await session.ready()
  const old=session.elements(),element=old.get('same')
  session.setDemand([{...demand('same'),required:false}]);service.clearIdle()
  session.setDemand([demand('same')]);await session.ready()
  expect(session.elements().get('same')).not.toBe(element)
  expect(old.get('same')).toBeUndefined();session.stop();service.dispose()
})
