import { describe, expect, it, vi } from 'vitest'
import { AssetSourcePool, type SourcePlatform } from './AssetSourcePool'
import { AssetSourceOwner } from './AssetSourceOwner'
import { emptyScene } from '../../defaults'
import { initHistory, pushHistory, undoHistory, redoHistory, type HistoryState } from '../../editor/history'
import type { Asset } from '../../types'

/** Explicit collector queue makes same-task transfers and failed disposal
 * deterministic without timers or browser globals. */
function fixture() {
  let next = 0
  const jobs: Array<() => void> = [], revoke = vi.fn()
  const api: SourcePlatform = { create: () => `blob:source-${++next}`, revoke, defer: callback => { jobs.push(callback) } }
  const pool = new AssetSourcePool(api)
  return { pool, revoke, jobs, flush: () => { jobs.splice(0).forEach(job => job()) } }
}
const asset = (url: string, owned = true): Asset => ({ id: url, name: url, url, type: 'image', ...(owned ? { runtime: { objectUrl: url } } : {}) })

describe('original source URL ownership', () => {
  it('coalesces immutable source sets, transfers creator ownership on adoption and releases after the last consumer', () => {
    const { pool, revoke, flush } = fixture(), creator = pool.create(new Blob(['source']))
    const assets = [asset(creator.url), { ...asset(creator.url), id: 'alias' }]
    const job = pool.retainAssets(assets), doc = pool.retainAssets(assets, { transferCreators: true })
    creator.release(); doc.release(); flush()
    expect(revoke).not.toHaveBeenCalled(); expect(pool.getSnapshot()).toMatchObject({ ownedUrls: 1, references: 1 })
    job.release(); job.release(); expect(revoke).not.toHaveBeenCalled(); flush()
    expect(revoke).toHaveBeenCalledExactlyOnceWith(creator.url); expect(pool.getSnapshot().references).toBe(0)
  })

  it('never claims foreign blob URLs by reading and skips remote/data URLs', () => {
    const { pool, revoke, flush } = fixture()
    const held = pool.retainAssets([asset('blob:foreign', false), asset('https://example.test/image', false), asset('data:image/png,x', false)])
    expect(pool.getSnapshot()).toMatchObject({ ownedUrls: 0, borrowedUrls: 1 })
    held.release(); flush(); expect(revoke).not.toHaveBeenCalled(); expect(pool.getSnapshot().borrowedUrls).toBe(0)
  })

  it('defers explicit deletion while a job holds the source and covers primary/runtime aliases once', () => {
    const { pool, revoke, flush } = fixture()
    const job = pool.retainUrls(['blob:shared', 'blob:shared'])
    pool.requestRevoke('blob:shared'); expect(revoke).not.toHaveBeenCalled()
    job.release(); flush(); expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:shared')
    pool.requestRevoke('blob:unheld'); expect(revoke).toHaveBeenCalledWith('blob:unheld')
  })

  it('survives StrictMode-style stop/start and acquires replacement arrays before dropping old ownership', () => {
    const { pool, revoke, flush } = fixture(), owner = new AssetSourceOwner(pool)
    owner.update([[asset('blob:live')]])
    expect(pool.getSnapshot().ownedUrls).toBe(0)
    owner.start(); owner.stop(); owner.start(); flush(); expect(revoke).not.toHaveBeenCalled()
    owner.update([[{ ...asset('blob:live'), name: 'changed' }]])
    flush(); expect(revoke).not.toHaveBeenCalled()
    owner.stop(); flush(); expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:live')
  })

  it('retains undo/redo and transaction base, then frees dropped redo and history beyond 50 states', () => {
    const { pool, revoke, flush } = fixture(), owner = new AssetSourceOwner(pool)
    const empty = emptyScene(), imported = { ...empty, assets: [asset('blob:import')] }
    let history = initHistory(empty)
    const sync = (state: HistoryState) => owner.update([state.present.assets, ...state.past.map(scene => scene.assets), ...state.future.map(scene => scene.assets)])
    sync(history); owner.start()
    history = pushHistory(history, imported); sync(history)
    history = undoHistory(history); sync(history); flush(); expect(revoke).not.toHaveBeenCalled()
    history = redoHistory(history); sync(history); flush(); expect(revoke).not.toHaveBeenCalled()
    history = undoHistory(history); sync(history)
    history = pushHistory(history, { ...empty }); sync(history); flush()
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:import')
    history = pushHistory(history, { ...empty, assets: [asset('blob:old')] }); sync(history)
    history = pushHistory(history, empty); sync(history)
    for (let i = 0; i < 51; i++) { history = pushHistory(history, { ...empty }); sync(history) }
    flush(); expect(revoke).toHaveBeenCalledWith('blob:old'); expect(history.past.length).toBe(50)
    owner.update([empty.assets, [asset('blob:base')], [asset('blob:preview')]])
    owner.update([empty.assets, [asset('blob:base')]]); flush()
    expect(revoke).toHaveBeenCalledWith('blob:preview'); expect(revoke).not.toHaveBeenCalledWith('blob:base')
    owner.stop(); flush(); expect(pool.getSnapshot().ownedUrls).toBe(0)
  })

  it('pins sources through async success/failure even after their document owner stops', async () => {
    const { pool, revoke, flush } = fixture(), owner = new AssetSourceOwner(pool), assets = [asset('blob:job')]
    owner.update([assets]); owner.start()
    let complete!: () => void
    const work = pool.withAssets(assets, () => new Promise<void>(resolve => { complete = resolve }))
    owner.stop(); flush(); expect(revoke).not.toHaveBeenCalled()
    complete(); await work; flush(); expect(revoke).toHaveBeenCalledWith('blob:job')
    await expect(pool.withAssets([asset('blob:failed')], () => { throw new Error('encode failed') })).rejects.toThrow('encode failed')
    flush(); expect(revoke).toHaveBeenCalledWith('blob:failed')
  })

  it('keeps failed revocation registered without retry loops and allows explicit retry', () => {
    const { pool, revoke, flush, jobs } = fixture()
    revoke.mockImplementationOnce(() => { throw new Error('platform failed') })
    const held = pool.retainAssets([asset('blob:failed')]); held.release(); flush()
    expect(pool.getSnapshot()).toMatchObject({ ownedUrls: 1, failedUrls: 1, failures: 1 })
    expect(jobs).toHaveLength(0)
    pool.requestRevoke('blob:failed')
    expect(pool.getSnapshot()).toMatchObject({ ownedUrls: 0, failedUrls: 0, revoked: 1 })
  })
})
