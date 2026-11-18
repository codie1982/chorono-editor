import { describe, expect, it, vi } from 'vitest'
import { BakeService, BakeSourceStaleError } from '../index'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(next => { resolve = next })
  return { promise, resolve }
}

function source() {
  return { kind: 'test', ownerId: 'fixture', revision: 1 }
}

describe('BakeService typed job lifecycle', () => {
  it('prepares a typed preview and commits it exactly once', async () => {
    const service = new BakeService(), publish = vi.fn(), states: string[] = []
    const job = service.createJob({
      kind: 'test', label: 'Test bake', source: source(), isSourceCurrent: () => true,
      prepare: context => {
        context.reportProgress({ value: .25, phase: 'sample', message: 'Sampling' })
        context.reportProgress({ value: .1, phase: 'late', message: 'Must not regress' })
        return { frames: 3 }
      },
    })
    job.subscribe(() => states.push(job.getSnapshot().status))
    await job.start()
    expect(job.getSnapshot()).toMatchObject({ status: 'preview-ready', preview: { frames: 3 }, progress: { value: 1 } })
    expect(states).toContain('queued'); expect(states).toContain('running')
    await job.commit(publish)
    expect(publish).toHaveBeenCalledWith({ frames: 3 })
    expect(job.getSnapshot().status).toBe('completed')
    await expect(job.commit(publish)).rejects.toThrow(/not ready/)
    expect(publish).toHaveBeenCalledTimes(1)
    service.dispose()
  })

  it('cancels running work without publishing its late result', async () => {
    const service = new BakeService(), entered = deferred<void>(), release = deferred<number>()
    const job = service.createJob({
      kind: 'test', label: 'Slow bake', source: source(), isSourceCurrent: () => true,
      prepare: async () => { entered.resolve(); return release.promise },
    })
    const running = job.start(); await entered.promise
    job.cancel(); expect(job.getSnapshot().status).toBe('cancelled')
    release.resolve(7); await running
    expect(job.getSnapshot()).toMatchObject({ status: 'cancelled', preview: undefined })
    service.dispose()
  })

  it('invalidates a running preview when its source changes', async () => {
    const service = new BakeService(), entered = deferred<void>(), release = deferred<string>()
    let current = true
    const job = service.createJob({
      kind: 'test', label: 'Stale bake', source: source(), isSourceCurrent: () => current,
      prepare: async () => { entered.resolve(); return release.promise },
    })
    const running = job.start(); await entered.promise
    current = false
    expect(job.checkSource()).toBe(false)
    expect(job.getSnapshot()).toMatchObject({ status: 'stale', preview: undefined })
    release.resolve('late'); await running
    expect(job.getSnapshot().status).toBe('stale')
    await expect(job.commit(() => {})).rejects.toThrow(/not ready/)
    service.dispose()
  })

  it('treats document replacement as stale and protects commit', async () => {
    const service = new BakeService(), document = new AbortController()
    const job = service.createJob({
      kind: 'test', label: 'Document bake', source: source(), documentSignal: document.signal,
      isSourceCurrent: () => !document.signal.aborted, prepare: () => 'ready',
    })
    await job.start(); expect(job.getSnapshot().status).toBe('preview-ready')
    document.abort()
    expect(job.getSnapshot().status).toBe('stale')
    await expect(job.commit(() => {})).rejects.toThrow(/not ready/)
    service.dispose()
  })

  it('reports an atomic source race before commit as a stale error', async () => {
    const service = new BakeService(); let current = true
    const job = service.createJob({
      kind: 'test', label: 'Commit race', source: source(), isSourceCurrent: () => current, prepare: () => 4,
    })
    await job.start()
    await expect(job.commit(() => { current = false; throw new Error('race') })).rejects.toBeInstanceOf(BakeSourceStaleError)
    expect(job.getSnapshot().status).toBe('stale')
    service.dispose()
  })
})
