import { afterEach, expect, it, vi } from 'vitest'
import { BoundedTextReader } from './BoundedTextReader'
import { ResourceBudget } from '../budget'

/** Gate actual consumer settlement independently of cancellation notification. */
function gate() { let resolve!: () => void; const promise = new Promise<void>(yes => { resolve = yes }); return { promise, resolve } }
afterEach(() => vi.restoreAllMocks())

it('matches Blob.text UTF-8 replacement/BOM behavior and admits binary plus UTF-16 through consumer settlement', async () => {
  const bytes = new Uint8Array([239, 187, 191, 65, 240, 159, 152, 128, 255])
  const blob = new Blob([bytes]), expected = await blob.text(), budget = new ResourceBudget({ maxBytes: 128 })
  const reader = new BoundedTextReader({ budget, maxInputBytes: 32 }), unbounded = vi.spyOn(blob, 'text')
  const result = await reader.withBlob(blob, text => { expect(text).toBe(expected); expect(budget.getSnapshot().chargedBytes).toBe(bytes.length * 3); return text.length })
  expect(result).toBe(expected.length); expect(unbounded).not.toHaveBeenCalled()
  expect(budget.getSnapshot()).toMatchObject({ chargedBytes: 0, peakBytes: bytes.length * 3 })
})
it('rejects known size before stream IO and counts actual bytes despite dishonest Blob metadata', async () => {
  const reader = new BoundedTextReader({ maxInputBytes: 4 }), file = new Blob(['12345']), work = vi.fn()
  const stream = vi.spyOn(file, 'stream')
  await expect(reader.withBlob(file, work)).rejects.toThrow('input byte limit'); expect(stream).not.toHaveBeenCalled()
  Object.defineProperty(file, 'size', { value: 1 })
  await expect(reader.withBlob(file, work)).rejects.toThrow('byte limit'); expect(stream).toHaveBeenCalledOnce(); expect(work).not.toHaveBeenCalled()
})
it('refuses simultaneous sanitizer strings before decoding/calling work, then drops original input', async () => {
  const budget = new ResourceBudget({ maxBytes: 26 }), reader = new BoundedTextReader({ budget }), work = vi.fn()
  const decode = vi.spyOn(TextDecoder.prototype, 'decode')
  await expect(reader.withBlob(new Blob(['abc']), work, { copies: 4, label: 'SVG sanitizer text' })).rejects.toThrow('SVG sanitizer text')
  expect(work).not.toHaveBeenCalled(); expect(decode).not.toHaveBeenCalled()
  expect(budget.getSnapshot()).toMatchObject({ chargedBytes: 0, peakBytes: 3 })
})
it('keeps input and text charged while cancelled legacy consumer actually settles; does not orphan its independently owned output', async () => {
  const budget = new ResourceBudget({ maxBytes: 128 }), reader = new BoundedTextReader({ budget }), entered = gate(), hold = gate(), abort = new AbortController()
  const output = { owned: true }
  const pending = reader.withBlob(new Blob(['abcd']), async () => { entered.resolve(); await hold.promise; return output }, { signal: abort.signal })
  await entered.promise; abort.abort(); expect(budget.getSnapshot().chargedBytes).toBe(12)
  hold.resolve(); expect(await pending).toBe(output); expect(budget.getSnapshot().chargedBytes).toBe(0)
})
it('releases text and input on thrown/async-rejected work and validates copy policy before file IO', async () => {
  const budget = new ResourceBudget({ maxBytes: 128 }), reader = new BoundedTextReader({ budget }), file = new Blob(['abcd'])
  await expect(reader.withBlob(file, () => { throw new Error('parse failure') })).rejects.toThrow('parse failure')
  expect(budget.getSnapshot().chargedBytes).toBe(0)
  await expect(reader.withBlob(file, async () => { throw new Error('conversion failure') })).rejects.toThrow('conversion failure')
  expect(budget.getSnapshot().chargedBytes).toBe(0)
  const stream = vi.spyOn(file, 'stream')
  for (const copies of [0, -1, 1.5, 17]) await expect(reader.withBlob(file, () => null, { copies })).rejects.toThrow('copy policy')
  expect(stream).not.toHaveBeenCalled()
})
it('pre-abort starts no file stream, borrowed bytes enforce their own cap, and empty text keeps minimum charges finite', async () => {
  const abort = new AbortController(); abort.abort()
  const file = new Blob(['abc']), stream = vi.spyOn(file, 'stream'), budget = new ResourceBudget({ maxBytes: 16 }), reader = new BoundedTextReader({ budget, maxInputBytes: 4 })
  await expect(reader.withBlob(file, () => null, { signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' }); expect(stream).not.toHaveBeenCalled()
  await expect(reader.withBytes(new Uint8Array(5), () => null)).rejects.toThrow('input byte limit')
  expect(await reader.withBlob(new Blob(), text => { expect(budget.getSnapshot().chargedBytes).toBe(2); return text.length })).toBe(0)
  expect(budget.getSnapshot().chargedBytes).toBe(0)
})
it('shared concurrent scopes compete for actual admitted bytes and release independently', async () => {
  const budget = new ResourceBudget({ maxBytes: 20 }), reader = new BoundedTextReader({ budget }), entered = gate(), hold = gate()
  const first = reader.withBlob(new Blob(['abcd']), async () => { entered.resolve(); await hold.promise; return 1 })
  await entered.promise
  await expect(reader.withBlob(new Blob(['abcd']), () => 2)).rejects.toThrow('text')
  expect(budget.getSnapshot().chargedBytes).toBe(12); hold.resolve(); expect(await first).toBe(1); expect(budget.getSnapshot().chargedBytes).toBe(0)
})
