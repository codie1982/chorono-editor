import { describe, expect, it, vi } from 'vitest'
import { BoundedBinaryReader } from './BoundedBinaryReader'
import { ResourceBudget } from '../budget'

/** Zero prefetch makes cancellation observable without assumptions about the
 * network's chunk boundaries. All chunks still use real Web Streams/Response. */
function response(chunks: Uint8Array[], headers: HeadersInit = {}, cancel = vi.fn()) {
  let index = 0
  const stream = new ReadableStream<Uint8Array>({ pull(controller) {
    if (index === chunks.length) controller.close(); else controller.enqueue(chunks[index++])
  }, cancel }, { highWaterMark: 0 })
  return { response: new Response(stream, { headers }), cancel }
}
/** Explicit actual native cancellation settlement, not an elapsed-time guess. */
function deferred() { let resolve!: () => void; const promise = new Promise<void>(yes => { resolve = yes }); return { promise, resolve } }

describe('bounded binary input ownership', () => {
  it('copies only a prefix from borrowed chunks despite a large full-file size', async () => {
    const reader = new BoundedBinaryReader({ maxBytes: 8 }), bytes = new Uint8Array([1, 2, 3, 4, 5, 6])
    const input = response([bytes, new Uint8Array(100)], { 'content-length': '9999999' })
    const lease = await reader.readPrefix(input.response, 4)
    expect(Array.from(new Uint8Array(lease.buffer))).toEqual([1, 2, 3, 4])
    expect(bytes).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6])); bytes.fill(0)
    expect(new Uint8Array(lease.buffer)[0]).toBe(1)
    expect(input.cancel).toHaveBeenCalledOnce(); expect(reader.getSnapshot().chargedBytes).toBe(4)
    lease.release(); expect(reader.getSnapshot().chargedBytes).toBe(0)
  })

  it('retains the complete prefix charge until actual native cancellation settles', async () => {
    const gate = deferred(), cancelling = deferred(), reader = new BoundedBinaryReader({ maxBytes: 8 })
    const input = response([new Uint8Array(6)], {}, vi.fn(() => { cancelling.resolve(); return gate.promise }))
    let delivered = false
    const pending = reader.readPrefix(input.response, 4).then(lease => { delivered = true; return lease })
    await cancelling.promise
    expect(delivered).toBe(false); expect(reader.getSnapshot().chargedBytes).toBe(4)
    gate.resolve(); const lease = await pending; expect(delivered).toBe(true)
    lease.release(); expect(reader.getSnapshot().chargedBytes).toBe(0)
  })

  it('discards a prefix if abort wins during cancellation and releases failed cancellation storage', async () => {
    const gate = deferred(), cancelling = deferred(), abort = new AbortController()
    const reader = new BoundedBinaryReader({ maxBytes: 8 })
    const input = response([new Uint8Array(4)], {}, vi.fn(() => { cancelling.resolve(); return gate.promise }))
    const pending = reader.readPrefix(input.response, 4, { signal: abort.signal })
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await cancelling.promise; abort.abort(); expect(reader.getSnapshot().chargedBytes).toBe(4)
    gate.resolve(); await rejected; expect(reader.getSnapshot().chargedBytes).toBe(0)
    const failed = response([new Uint8Array(4)], {}, vi.fn(() => Promise.reject(new Error('native cancel failed'))))
    await expect(reader.readPrefix(failed.response, 4)).rejects.toThrow('native cancel failed')
    expect(reader.getSnapshot().chargedBytes).toBe(0)
  })

  it('supports short/empty prefixes and cancels invalid limits without reading or retaining storage', async () => {
    const reader = new BoundedBinaryReader({ maxBytes: 8 })
    for (const bytes of [new Uint8Array(), new Uint8Array([1, 2])]) {
      const lease = await reader.readPrefix(response([bytes]).response, 8)
      expect(lease.byteLength).toBe(bytes.length); lease.release()
    }
    for (const limit of [0, -1, 9, NaN, 1.5]) {
      const input = response([new Uint8Array(2)])
      await expect(reader.readPrefix(input.response, limit)).rejects.toThrow('prefix')
      expect(input.cancel).toHaveBeenCalledOnce()
    }
    expect(reader.getSnapshot().chargedBytes).toBe(0)
  })

  it('is independent of chunk boundaries and admits growth plus exact compaction overlap', async () => {
    const source = Uint8Array.from({ length: 10 }, (_, i) => i), reader = new BoundedBinaryReader({ maxBytes: 16 })
    const a = await reader.readResponse(response([source.subarray(0, 3), source.subarray(3, 6), source.subarray(6)]).response)
    expect(Array.from(new Uint8Array(a.buffer))).toEqual(Array.from(source)); expect(a.byteLength).toBe(10)
    expect(reader.getSnapshot()).toMatchObject({ residentBytes: 10, reservedBytes: 0, peakBytes: 22 })
    source.fill(255); expect(new Uint8Array(a.buffer)[0]).toBe(0)
    a.release(); a.release(); expect(reader.getSnapshot().chargedBytes).toBe(0)
    expect(() => a.buffer).toThrow('released')
  })

  it('checks actual bytes despite a dishonest/missing size and cancels the rejected body', async () => {
    const cases: HeadersInit[] = [{}, { 'content-length': '1' }, { 'content-length': 'invalid' }]
    for (const headers of cases) {
      const input = response([new Uint8Array(2), new Uint8Array(2)], headers), reader = new BoundedBinaryReader({ maxBytes: 3 })
      await expect(reader.readResponse(input.response)).rejects.toThrow('byte limit')
      expect(input.cancel).toHaveBeenCalledOnce(); expect(reader.getSnapshot().chargedBytes).toBe(0)
    }
  })

  it('uses identity length only for early rejection and never treats encoded wire length as actual bytes', async () => {
    const reader = new BoundedBinaryReader({ maxBytes: 4 }), large = response([new Uint8Array(3)], { 'content-length': '999' })
    await expect(reader.readResponse(large.response)).rejects.toThrow('byte limit')
    expect(large.cancel).toHaveBeenCalledOnce(); expect(reader.getSnapshot().peakBytes).toBe(0)
    const encoded = await reader.readResponse(response([new Uint8Array(3)], { 'content-length': '999', 'content-encoding': 'gzip' }).response)
    expect(encoded.byteLength).toBe(3); encoded.release()
  })

  it('rejects an impossible old+new allocation before copying and rolls back all host charges', async () => {
    const budget = new ResourceBudget({ maxBytes: 21 }), reader = new BoundedBinaryReader({ maxBytes: 16, budget })
    await expect(reader.readResponse(response([new Uint8Array(3), new Uint8Array(3), new Uint8Array(4)]).response)).rejects.toThrow('growth')
    expect(budget.getSnapshot()).toMatchObject({ chargedBytes: 0, peakBytes: 18, denials: 1 })
    expect(reader.getSnapshot().chargedBytes).toBe(0)
  })

  it('retains input through actual cancel completion and removes signal listeners on failure', async () => {
    const cancelGate = deferred(), waiting = deferred(), abort = new AbortController()
    const remove = vi.spyOn(abort.signal, 'removeEventListener'); let reads = 0
    const native = new ReadableStream<Uint8Array>({ pull(controller) {
      if (++reads === 1) controller.enqueue(new Uint8Array(4)); else waiting.resolve()
    }, cancel: () => cancelGate.promise }, { highWaterMark: 0 })
    const reader = new BoundedBinaryReader({ maxBytes: 8 }), pending = reader.readResponse(new Response(native), { signal: abort.signal })
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await waiting.promise; abort.abort(); await Promise.resolve()
    expect(reader.getSnapshot().chargedBytes).toBe(4)
    cancelGate.resolve(); await rejected
    expect(remove).toHaveBeenCalledOnce(); expect(reader.getSnapshot().chargedBytes).toBe(0)
  })

  it('pre-abort and HTTP errors cancel bodies and unsupported streaming never uses an unbounded fallback', async () => {
    const reader = new BoundedBinaryReader(), abort = new AbortController(); abort.abort()
    const pre = response([new Uint8Array(2)])
    await expect(reader.readResponse(pre.response, { signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(pre.cancel).toHaveBeenCalledOnce()
    const cancel = vi.fn(), bad = new Response(new ReadableStream({ cancel }, { highWaterMark: 0 }), { status: 500 })
    await expect(reader.readResponse(bad)).rejects.toThrow('HTTP 500'); expect(cancel).toHaveBeenCalledOnce()
    const missing = new Response('unreadable'), unbounded = vi.spyOn(missing, 'arrayBuffer')
    Object.defineProperty(missing, 'body', { value: undefined })
    await expect(reader.readResponse(missing)).rejects.toThrow('streaming')
    expect(unbounded).not.toHaveBeenCalled(); expect(reader.getSnapshot().chargedBytes).toBe(0)
  })

  it('releases a prepared result if native stream-lock cleanup fails before delivery', async () => {
    const reader = new BoundedBinaryReader({ maxBytes: 8 }), nativeResponse = new Response(new Uint8Array(4))
    const stream = nativeResponse.body!, nativeReader = stream.getReader(), unlock = nativeReader.releaseLock.bind(nativeReader)
    Object.defineProperty(stream, 'getReader', { value: () => nativeReader })
    vi.spyOn(nativeReader, 'releaseLock').mockImplementation(() => { throw new Error('lock release failed') })
    try {
      await expect(reader.readResponse(nativeResponse)).rejects.toThrow('lock release failed')
      expect(reader.getSnapshot().chargedBytes).toBe(0)
    } finally { unlock() }
  })

  it('owns empty buffers without changing the positive-size ledger contract', async () => {
    const reader = new BoundedBinaryReader({ maxBytes: 1 }), input = await reader.readResponse(new Response(null))
    expect(input.byteLength).toBe(0); expect(input.buffer.byteLength).toBe(0); expect(reader.getSnapshot().chargedBytes).toBe(1)
    input.release(); expect(reader.getSnapshot().chargedBytes).toBe(0)
  })

  it('keeps the logical charge for native-detached input and prevents reuse as an empty copy', async () => {
    const reader = new BoundedBinaryReader({ maxBytes: 8 }), input = await reader.readResponse(new Response(new Uint8Array(4)))
    const data = input.buffer; structuredClone(data, { transfer: [data] })
    expect(data.byteLength).toBe(0); expect(input.byteLength).toBe(4); expect(reader.getSnapshot().chargedBytes).toBe(4)
    expect(() => input.buffer).toThrow('consumed'); await expect(input.withCopy(() => 1)).rejects.toThrow('consumed')
    input.release(); expect(reader.getSnapshot().chargedBytes).toBe(0)
  })

  it('holds original and copy admission until conversion settles even if release was requested', async () => {
    const reader = new BoundedBinaryReader({ maxBytes: 8 }), input = await reader.readResponse(new Response(new Uint8Array(4)))
    const gate = deferred(), started = deferred()
    const pending = input.withCopy(async buffer => { started.resolve(); await gate.promise; return buffer.byteLength })
    await started.promise; input.release()
    expect(reader.getSnapshot().chargedBytes).toBe(8); expect(() => input.buffer).toThrow('released')
    gate.resolve(); expect(await pending).toBe(4); expect(reader.getSnapshot().chargedBytes).toBe(0)
  })

  it('does not run conversion without admission and preserves original ownership on conversion failure', async () => {
    const budget = new ResourceBudget({ maxBytes: 7 }), reader = new BoundedBinaryReader({ maxBytes: 8, budget })
    const input = await reader.readResponse(new Response(new Uint8Array(4))), work = vi.fn()
    await expect(input.withCopy(work)).rejects.toThrow('copy'); expect(work).not.toHaveBeenCalled()
    expect(input.byteLength).toBe(4); input.release(); expect(budget.getSnapshot().chargedBytes).toBe(0)
    const other = await reader.readResponse(new Response(new Uint8Array(2)))
    await expect(other.withCopy(() => { throw new Error('conversion failed') })).rejects.toThrow('conversion failed')
    expect(reader.getSnapshot().chargedBytes).toBe(2); other.release()
  })
})
