import { createRoot } from 'react-dom/client'
import { useRef, useState } from 'react'
import { VisualAssetService } from '../VisualAssetService'
import { browserVisualDecoder } from '../browserVisualDecoder'
import { assetSourcePool } from '../../sources'
import { ResourceBudget } from '../../../resources/budget'
import type { Asset } from '../../../types'
import type { VisualResource } from '../types'

import { nativePng as png, nativeWebm as webm, seekNativeVideo as seek, nativeFingerprint as fingerprint } from './nativeMediaFixtures'

/** Native ownership checks. Small private budgets test admission/reclaim; no
 * claims about the full editor's decoded residency, FPS or OS RAM are made. */
async function run(canvases: HTMLCanvasElement[]) {
  const rows: Array<{ name: string; passed: boolean }> = []
  const test = (name: string, passed: boolean) => rows.push({ name, passed })
  const budget = new ResourceBudget({ maxBytes: 1024 * 1024 }), resources: VisualResource[] = []
  const service = new VisualAssetService({ budget, maxBytes: 512 * 1024, decoder: (input, signal) => {
    const resource = browserVisualDecoder(input, signal); resources.push(resource); return resource
  } })
  const imageSource = assetSourcePool.create(await png()), videoSource = assetSourcePool.create(await webm())
  const image: Asset = { id: 'png', name: 'Private PNG', type: 'image', url: imageSource.url, width: 32, height: 32 }
  const video: Asset = { ...image, id: 'webm', name: 'Private WebM', type: 'video', url: videoSource.url }
  try {
    const [a, b] = await Promise.all([service.acquire(image), service.acquire({ ...image, id: 'alias', type: 'spriteSheet' })])
    const original = a.value.element, reference = fingerprint(original, canvases[0])
    test('native PNG/sheet aliases share one decoded element and one 4096-byte allocation', original instanceof HTMLImageElement
      && original === b.value.element && resources.length === 1 && budget.getSnapshot().residentBytes === 4096)
    service.clear(); a.release(); budget.reclaimIdle()
    test('clear retires the element without resetting a pinned consumer', b.value.element === original && !!original.getAttribute('src'))
    b.release()
    test('final retired release resets native image src before uncharging', original.getAttribute('src') === null && budget.getSnapshot().chargedBytes === 0)
    const reloaded = await service.acquire(image)
    test('reload after eviction preserves exact native PNG RGBA', fingerprint(reloaded.value.element, canvases[0]) === reference)
    reloaded.release(); service.clearIdle()
    test('idle reclaim drops decoded pixels while original URL stays fetchable', budget.getSnapshot().chargedBytes === 0 && (await fetch(image.url)).ok)

    const left = await service.acquire(video, { consumerId: 'private-document:left' })
    const right = await service.acquire(video, { consumerId: 'private-document:right' })
    const l = left.value.element as HTMLVideoElement, r = right.value.element as HTMLVideoElement
    await Promise.all([seek(l, 0.1), seek(r, 0.5)])
    const lp = fingerprint(l, canvases[1]), rp = fingerprint(r, canvases[2])
    test('same WebM source creates separate native video elements for independent clips', l !== r && service.getSnapshot().residency.categories.video.residentBytes === 8192)
    test('independent clip seeks produce different native frames', Math.abs(l.currentTime - 0.1) < 0.025
      && Math.abs(r.currentTime - 0.5) < 0.025 && lp !== rp)
    await seek(l, 0.2)
    test('seeking one clip never changes the other clip clock', Math.abs(r.currentTime - 0.5) < 0.025)
    service.clear(); left.release()
    test('releasing one retired clip resets only its decoder', l.getAttribute('src') === null && !!r.getAttribute('src'))
    right.release()
    test('last clip release pauses and resets all retired native videos', r.paused && r.getAttribute('src') === null && budget.getSnapshot().chargedBytes === 0)

    const blocker = budget.reserve('scratch', 1024 * 1024)!, before = resources.length
    let denied = false
    try { await service.acquire(image) } catch (error) { denied = error instanceof RangeError }
    test('shared-budget refusal happens before native element construction', denied && before === resources.length)
    blocker.release()
    const broken = assetSourcePool.create(new Blob(['not an image'], { type: 'image/png' }))
    try {
      let failed = false
      try { await service.acquire({ ...image, url: broken.url }) } catch { failed = true }
      test('native decode failure resets its element and releases pending charge', failed && resources.at(-1)!.element.getAttribute('src') === null && budget.getSnapshot().chargedBytes === 0)
    } finally { broken.release() }
    const held = await service.acquire(image), heldElement = held.value.element
    service.dispose()
    test('service disposal does not destroy an independently pinned native image', !!heldElement.getAttribute('src') && budget.getSnapshot().protectedBytes === 4096)
    held.release()
    test('final disposal leaves no active jobs or decoded charges', heldElement.getAttribute('src') === null
      && budget.getSnapshot().chargedBytes === 0 && service.getSnapshot().preparation.active === 0)
    return { passed: rows.every(row => row.passed), results: rows, final: service.getSnapshot(), budget: budget.getSnapshot(),
      environment: { userAgent: navigator.userAgent, width: innerWidth, height: innerHeight, dpr: devicePixelRatio } }
  } finally { service.dispose(); imageSource.release(); videoSource.release() }
}

/** A visible native QA surface, not an editor route or window injection hook. */
function Host() {
  const refs = useRef<Array<HTMLCanvasElement | null>>([]), [status, setStatus] = useState('Ready'), [report, setReport] = useState<unknown>()
  return <main style={{ fontFamily: 'system-ui', background: '#080d19', color: '#e2e8f0', padding: 28, minHeight: '100vh' }}>
    <h1>Visual media ownership · native acceptance</h1>
    <p>Actual PNG/WebM decode · shared image · independent video clips · admission and disposal</p>
    <button disabled={status === 'Running'} onClick={async () => {
      setStatus('Running'); setReport(undefined)
      try { const result = await run(refs.current as HTMLCanvasElement[]); setReport(result); setStatus(result.passed ? 'PASS' : 'FAIL') }
      catch (error) { setReport({ passed: false, error: String(error) }); setStatus('FAIL') }
    }}>Run native checks</button>
    <p id="visual-status" role="status">{status}</p>
    <div style={{ display: 'flex', gap: 24 }}>{['Reloaded PNG', 'Clip A · 100ms', 'Clip B · 500ms'].map((label, index) => <figure key={label}>
      <canvas width={32} height={32} ref={node => { refs.current[index] = node }} style={{ width: 128, height: 128 }} /><figcaption>{label}</figcaption>
    </figure>)}</div>
    <p>Decoded charge counts one RGBA frame per video clip. Native decoder buffers and OS RAM are outside this estimate.</p>
    <pre id="visual-report" style={{ whiteSpace: 'pre-wrap', maxHeight: 540, overflow: 'auto' }}>{report ? JSON.stringify(report, null, 2) : 'Awaiting native completion'}</pre>
  </main>
}
createRoot(document.getElementById('app')!).render(<Host />)
