import { expect, it, vi } from 'vitest'
import { SceneDocumentLoader } from './SceneDocumentLoader'
import { emptyScene } from '../../defaults'
import { BoundedTextReader } from '../../resources/io'
import { BoundedJobQueue } from '../../resources/jobs'
import { ResourceBudget } from '../../resources/budget'

/** Hold actual consumer work, not merely the returned promise's observation. */
function gate() { let resolve!: () => void; const promise = new Promise<void>(yes => { resolve = yes }); return { promise, resolve } }
it('loads exact editable scene data without unbounded File.text and releases transient input/text', async () => {
  const scene = emptyScene(), file = new File([JSON.stringify(scene)], 'scene.json'), text = vi.spyOn(file, 'text')
  const budget = new ResourceBudget({ maxBytes: 65536 }), loader = new SceneDocumentLoader({ reader: new BoundedTextReader({ budget }) })
  expect(await loader.load(file)).toEqual(scene); expect(text).not.toHaveBeenCalled()
  expect(budget.getSnapshot()).toMatchObject({ chargedBytes: 0, peakBytes: file.size * 3 })
})
it('queued cancelled opens start no stream and active non-abortable work retains its slot', async () => {
  const queue = new BoundedJobQueue({ concurrency: 1 }), entered = gate(), hold = gate(), abort = new AbortController()
  const first = queue.submit(async () => { entered.resolve(); await hold.promise }); await entered.promise
  const loader = new SceneDocumentLoader({ executor: queue }), file = new File([JSON.stringify(emptyScene())], 'scene.json'), stream = vi.spyOn(file, 'stream')
  const pending = loader.load(file, { signal: abort.signal }), rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  abort.abort(); await rejected; expect(stream).not.toHaveBeenCalled(); expect(queue.getSnapshot().active).toBe(1)
  hold.resolve(); await first
})
it('rejects malformed/incomplete sources and budget refusal without fallback', async () => {
  const loader = new SceneDocumentLoader({ reader: new BoundedTextReader({ maxInputBytes: 2048 }) })
  await expect(loader.load(new File(['{}'], 'scene.json'))).rejects.toThrow('complete Chorono scene')
  await expect(loader.load(new File(['{broken'], 'scene.json'))).rejects.toThrow(SyntaxError)
  const file = new File([JSON.stringify(emptyScene())], 'scene.json')
  const budget = new ResourceBudget({ maxBytes: file.size * 3 - 1 })
  await expect(new SceneDocumentLoader({ reader: new BoundedTextReader({ budget }) }).load(file)).rejects.toThrow('Scene JSON text')
  expect(budget.getSnapshot().chargedBytes).toBe(0)
})
