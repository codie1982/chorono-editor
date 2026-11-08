import { expect, it, vi } from 'vitest'
import { editorMediaPreparation } from './editorMediaPreparation'
import { getAudioAssetService } from '../../audio/AudioAssetService'
import { visualAssetService } from '../../asset/visual/VisualAssetService'
import { fontAssetService } from '../../asset/fonts/FontAssetService'

/** Prove the real application singletons all borrow this same executor without
 * invoking browser decoders in Node. Two held jobs keep their inputs queued. */
it('wires all production owners to one two-job policy and exposes no global cancellation capability', async () => {
  const releases: (() => void)[] = []
  const blockers = [0, 1].map(() => editorMediaPreparation.submit(() => new Promise<void>(resolve => releases.push(resolve))))
  const audio = getAudioAssetService(), visualAbort = new AbortController(), fontAbort = new AbortController()
  const pending = [audio.acquireUrl('queued-audio'), visualAssetService.acquire({ id: 'v', name: 'Image', type: 'image', url: 'queued-image', width: 2, height: 2 }, { signal: visualAbort.signal }),
    fontAssetService.acquire({ id: 'f', name: 'Font', type: 'font', url: 'queued-font', metadata: { notes: 'family: Brand', filesize: 100 } }, { signal: fontAbort.signal })]
  const rejections = pending.map(task => expect(task).rejects.toMatchObject({ name: 'AbortError' }))
  try {
    await vi.waitFor(() => expect(editorMediaPreparation.getSnapshot()).toMatchObject({ active: 2, queued: 3, concurrency: 2, maxQueued: 128 }))
    expect(audio.getMemorySnapshot().preparation).toMatchObject({ executing: 0, waitingForExecutor: 1 })
    expect(visualAssetService.getSnapshot().preparation).toMatchObject({ executing: 0, waitingForExecutor: 1 })
    expect(fontAssetService.getSnapshot().preparation).toMatchObject({ executing: 0, waitingForExecutor: 1 })
    expect('cancelAll' in editorMediaPreparation).toBe(false); expect('dispose' in editorMediaPreparation).toBe(false)
    audio.cancelPending(); await rejections[0]
    await vi.waitFor(() => expect(editorMediaPreparation.getSnapshot().queued).toBe(2))
    expect(visualAssetService.getSnapshot().pendingCount).toBe(1); expect(fontAssetService.getSnapshot().pendingCount).toBe(1)
    visualAbort.abort(); fontAbort.abort(); await Promise.all(rejections)
    await vi.waitFor(() => expect(editorMediaPreparation.getSnapshot()).toMatchObject({ active: 2, queued: 0, closed: false }))
  } finally {
    audio.cancelPending(); visualAbort.abort(); fontAbort.abort(); releases.forEach(release => release())
    await Promise.allSettled([...blockers, ...pending])
  }
  expect(editorMediaPreparation.getSnapshot()).toMatchObject({ active: 0, queued: 0, closed: false })
})
