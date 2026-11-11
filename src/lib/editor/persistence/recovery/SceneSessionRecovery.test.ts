import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyScene, newRectLayer } from '../../../defaults'
import { SceneSessionRecovery, type RecoveryStatus } from './SceneSessionRecovery'
import { CommittedScene } from './CommittedScene'
import { decodeCheckpoint, JOURNAL_PREFIX, writeSessionJournal } from './SessionCheckpoint'

const metadata = { version: 1 as const, id: 'tab', sequence: 1, savedAt: 100 }
function scene(x = 0) { const value = emptyScene(); value.layers = [{ ...newRectLayer(), id: 'manual', transform: { ...newRectLayer().transform, x } }]; return value }
function storage() { const values = new Map<string, string>(); return { values, setItem: (key: string, value: string) => { values.set(key, value) } } }
function gate() { let resolve!: () => void; const promise = new Promise<void>(yes => { resolve = yes }); return { promise, resolve } }
afterEach(() => vi.useRealTimers())

describe('local editor recovery', () => {
  it('journals a small commit synchronously, retaining source IDs, manual fields and unknown metadata', () => {
    const source = scene(90), target = storage()
    source.editorGuides = { version: 1, guides: [] }
    expect(writeSessionJournal(target, metadata, source)).toBe(true)
    const decoded = decodeCheckpoint(JSON.parse(target.values.get(JOURNAL_PREFIX + 'tab')!))!
    expect(JSON.parse(decoded.json)).toEqual(source)
    expect(source.layers[0].transform.x).toBe(90)
  })
  it('does not claim large or Blob scenes have synchronous protection', () => {
    const source = scene(), target = storage()
    source.assets = [{ id: 'media', name: 'media', type: 'image', url: 'blob:old' }]
    expect(writeSessionJournal(target, metadata, source)).toBe(false)
    source.assets = []; source.layers[0].name = 'x'.repeat(600000)
    expect(writeSessionJournal(target, metadata, source)).toBe(false)
    expect(target.values.size).toBe(0)
  })
  it('strips runtime caches while preserving data URLs and source metadata', () => {
    const source = scene(), target = storage()
    source.assets = [{ id: 'a', name: 'a', type: 'image', url: 'data:image/png;base64,AAAA', runtime: { decoded: new Map() } }]
    expect(writeSessionJournal(target, metadata, source)).toBe(true)
    expect(JSON.parse(decodeCheckpoint(JSON.parse(target.values.get(JOURNAL_PREFIX + 'tab')!))!.json).assets[0]).not.toHaveProperty('runtime')
    expect(source.assets[0].runtime).toBeDefined()
  })
  it('refuses corrupt and future-version envelopes', () => {
    expect(decodeCheckpoint({ ...metadata, version: 2, json: '{}', assetUrls: [] })).toBeNull()
    expect(decodeCheckpoint({ ...metadata, sequence: -1, json: '{}', assetUrls: [] })).toBeNull()
    expect(() => decodeCheckpoint({ ...metadata, json: '{}', assetUrls: [] })).toThrow(/scene/)
  })
  it('does not save a default on construction; coalesces bursts to the latest committed source', async () => {
    vi.useFakeTimers(); const save = vi.fn(async (_scene: import('../../../types').ChronoScene) => {}), states: RecoveryStatus[] = []
    const owner = new SceneSessionRecovery({ id: 'tab', storage: storage(), save, onStatus: status => states.push(status) })
    await vi.advanceTimersByTimeAsync(2000); expect(save).not.toHaveBeenCalled()
    const latest = scene(30); owner.request(scene(10)); owner.request(latest)
    expect(owner.safeToLeave).toBe(true)
    await vi.advanceTimersByTimeAsync(250)
    expect(save).toHaveBeenCalledOnce(); expect(save.mock.calls[0][0]).toBe(latest)
    expect(states.at(-1)?.state).toBe('saved'); owner.dispose(); expect(vi.getTimerCount()).toBe(0)
  })
  it('cannot label newer unsaved edits saved when an older native write finishes', async () => {
    vi.useFakeTimers(); const first = gate(), second = gate(), states: RecoveryStatus[] = []
    const save = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const owner = new SceneSessionRecovery({ id: 'tab', storage: null, save, onStatus: status => states.push(status) })
    owner.request(scene(1)); await vi.advanceTimersByTimeAsync(250)
    owner.request(scene(2)); expect(owner.safeToLeave).toBe(false)
    first.resolve(); await vi.advanceTimersByTimeAsync(250)
    expect(states.at(-1)?.state).toBe('saving'); expect(owner.safeToLeave).toBe(false)
    second.resolve(); await vi.advanceTimersByTimeAsync(0)
    expect(owner.safeToLeave).toBe(true); owner.dispose()
  })
  it('handles undo to an active scene and later reuse of an already saved identity', async () => {
    vi.useFakeTimers(); const native = gate(), a = scene(1), b = scene(2)
    const save = vi.fn().mockReturnValueOnce(native.promise).mockResolvedValue(undefined)
    const owner = new SceneSessionRecovery({ id: 'tab', storage: null, save, onStatus: () => {} })
    owner.request(a); await vi.advanceTimersByTimeAsync(250); owner.request(b); owner.request(a)
    native.resolve(); await vi.advanceTimersByTimeAsync(500); expect(owner.safeToLeave).toBe(true)
    owner.request(b); await vi.advanceTimersByTimeAsync(250); owner.request(a); await vi.advanceTimersByTimeAsync(1)
    expect(save.mock.calls.at(-1)?.[0]).toBe(a); expect(owner.safeToLeave).toBe(true); owner.dispose()
  })
  it('surfaces quota failure, keeps navigation guarded and releases retries on dispose', async () => {
    vi.useFakeTimers(); const states: RecoveryStatus[] = []
    const owner = new SceneSessionRecovery({ id: 'tab', storage: { setItem() { throw new Error('quota') } }, save: async () => { throw new RangeError('quota') }, onStatus: status => states.push(status) })
    owner.request(scene(5)); await vi.advanceTimersByTimeAsync(250)
    expect(owner.safeToLeave).toBe(false); expect(states.at(-1)).toMatchObject({ state: 'error', error: 'quota' })
    owner.dispose(); expect(vi.getTimerCount()).toBe(0)
  })
  it('a durable journal still protects a small scene when IDB is denied', async () => {
    vi.useFakeTimers(); const states: RecoveryStatus[] = []
    const owner = new SceneSessionRecovery({ id: 'tab', storage: storage(), save: async () => { throw new RangeError('IDB denied') }, onStatus: status => states.push(status) })
    owner.request(scene(8)); await vi.advanceTimersByTimeAsync(250)
    expect(owner.safeToLeave).toBe(true); expect(states.at(-1)?.state).toBe('saved'); owner.dispose()
  })
  it('committed source subscribers are synchronous, independently releasable and cannot break editing', () => {
    const a = scene(0), b = scene(5), source = new CommittedScene(a), observer = vi.fn()
    source.subscribe(() => { throw new Error('storage denied') })
    const unsubscribe = source.subscribe(observer); source.publish(a); expect(observer).not.toHaveBeenCalled()
    source.publish(b); expect(observer).toHaveBeenCalledWith(b); expect(source.getScene()).toBe(b)
    unsubscribe(); unsubscribe(); source.publish(a); expect(observer).toHaveBeenCalledOnce()
  })
})
