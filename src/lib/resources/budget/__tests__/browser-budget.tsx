import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { emptyScene } from '@/lib/defaults'
import { CanvasSurfacePool } from '@/lib/render/resources/CanvasSurfacePool'
import { OffscreenCanvasCache } from '@/lib/render/OffscreenCanvasCache'
import { ProjectResourceMonitor } from '@/lib/resources/monitor/ProjectResourceMonitor'
import ResourceMonitorPanel from '@/components/resources/ResourceMonitorPanel'
import { ResourceBudget } from '../ResourceBudget'

/** One isolated test owner. The limit is intentionally smaller than each
 * cache's local cap, proving shared admission rather than independent caps. */
function harness() {
  const scene = emptyScene(), budget = new ResourceBudget({ maxBytes: 8192 })
  const pool = new CanvasSurfacePool({ maxBytes: 16384, budget })
  const cache = new OffscreenCanvasCache({ maxBytes: 16384, budget })
  const monitor = new ProjectResourceMonitor({ scene, media: new Map(), isPlaying: false }, { budget, pool, lod: cache })
  const keepers: Array<() => void> = []
  return { scene, budget, pool, cache, monitor, keepers,
    releaseActive() { keepers.splice(0).forEach(release => release()); budget.reclaimIdle() },
    dispose() { this.releaseActive(); pool.dispose(); cache.clear() } }
}

/** Native allocation, pixel and ownership acceptance through the production
 * owners. Source project data is never changed or sent to a connected editor. */
function runChecks(owner: ReturnType<typeof harness>) {
  const { pool, cache, budget } = owner
  const results: Array<{ name: string; passed: boolean; details?: unknown }> = []
  const test = (name: string, passed: boolean, details?: unknown) => results.push({ name, passed, details })
  const scratch = pool.acquire(32, 32)
  scratch.context.fillStyle = '#ff0000'; scratch.context.fillRect(0, 0, 32, 32)
  test('active scratch rejects preview before native allocation', cache.getOrCreate('p', 'v', 32, 32, () => {}) === null
    && scratch.canvas.width === 32 && cache.getSnapshot().allocations === 0)
  scratch.release()
  const preview = cache.acquire('p', 'v', 32, 32, context => { context.fillStyle = '#0000ff'; context.fillRect(0, 0, 32, 32) })!
  test('idle scratch reclaimed before preview admission', scratch.canvas.width === 0 && pool.getSnapshot().residentBytes === 0)
  let denied = false
  try { pool.acquire(40, 40) } catch (error) { denied = error instanceof RangeError }
  test('pinned preview survives cross-owner pressure', denied && preview.canvas.width === 32
    && budget.getSnapshot().protectedBytes === 4100)
  cache.clear(); budget.reclaimIdle()
  const pixel = preview.canvas.getContext('2d')!.getImageData(16, 16, 1, 1).data
  test('clear keeps pinned pixels and retirement charge', pixel[2] === 255 && pixel[3] === 255
    && cache.getSnapshot().retiredEntries === 1 && budget.getSnapshot().chargedBytes === 4100)
  preview.release()
  test('final borrower releases retired native backing', preview.canvas.width === 0 && budget.getSnapshot().chargedBytes === 0)
  const reset = pool.acquire(16, 16)
  reset.context.fillStyle = '#00ff00'; reset.context.fillRect(0, 0, 16, 16); reset.release()
  const reused = pool.acquire(16, 16)
  test('reused native scratch resets pixels', reused.canvas === reset.canvas
    && reused.context.getImageData(1, 1, 1, 1).data[3] === 0)
  reused.release(); budget.reclaimIdle()
  const beforeFailure = budget.getSnapshot().chargedBytes
  let failed = false
  try { cache.getOrCreate('fail', 'v', 16, 16, () => { throw new Error('expected painter failure') }) } catch { failed = true }
  test('failed painter unwinds pending native reservation', failed && budget.getSnapshot().chargedBytes === beforeFailure
    && cache.getSnapshot().pendingBytes === 0)
  for (let i = 0; i < 60; i++) { const frame = pool.acquire(16 + i % 3, 16); frame.release() }
  test('ROI size changes reuse one scratch identity', pool.getSnapshot().allocations === 3
    && pool.getSnapshot().idleSurfaces === 1 && budget.getSnapshot().entries === 1, { pool: pool.getSnapshot() })
  budget.reclaimIdle()
  test('idle cleanup returns both ledgers to zero', budget.getSnapshot().chargedBytes === 0 && pool.getSnapshot().residentBytes === 0 && cache.size() === 0)

  // Keep actual active/idle stores so the real panel can verify safe cleanup.
  const active = pool.acquire(24, 24), idle = pool.acquire(24, 24)
  idle.release()
  const pinned = cache.acquire('held', 'v', 16, 16, context => { context.fillStyle = '#4b93e8'; context.fillRect(0, 0, 16, 16) })!
  owner.keepers.push(() => active.release(), () => pinned.release())
  return { passed: results.every(result => result.passed), results, held: budget.getSnapshot(),
    environment: { userAgent: navigator.userAgent, width: innerWidth, height: innerHeight, dpr: devicePixelRatio } }
}

/** Real English resource dock on a disposable loopback page, with no test route
 * in the application. Only explicit native controls mutate test resource owners. */
function Host() {
  const [owner, setOwner] = useState(harness), [report, setReport] = useState<unknown>(null)
  const [status, setStatus] = useState('Ready')
  useEffect(() => () => owner.dispose(), [owner])
  const audio = { getResources: () => ({ bytes: 0, bufferCount: 0, pendingCount: 0, assets: [] }),
    getState: () => ({ contextState: 'idle', masterVolume: 1, meter: { peak: 0, rms: 0, clipped: false }, loadingAssetIds: [], errors: {}, sources: [] }) }
  return <main style={{ background: '#080d19', color: '#e2e8f0', minHeight: '100vh', fontFamily: 'sans-serif', padding: 20 }}>
    <h1>Shared allocation budget · native acceptance</h1>
    <p>8 KiB shared test limit · actual scratch and preview owners · no source scene edits</p>
    <button onClick={() => {
      owner.dispose(); const next = harness(); setOwner(next)
      try { const result = runChecks(next); setReport(result); setStatus(result.passed ? 'PASS · active resources held for panel verification' : 'FAIL') }
      catch (error) { setReport({ passed: false, error: String(error) }); setStatus('FAIL') }
    }}>Run native checks</button>{' '}
    <button disabled={!owner.keepers.length} onClick={() => { owner.releaseActive(); setStatus('Active test leases released') }}>Release active test resources</button>
    <p id="budget-status" role="status">{status}</p>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(400px, 600px)', gap: 20 }}>
      <pre id="budget-report" style={{ whiteSpace: 'pre-wrap' }}>{report ? JSON.stringify(report, null, 2) : 'Ready'}</pre>
      <div style={{ display: 'flex', minHeight: 0, height: 650 }}>
        <ResourceMonitorPanel scene={owner.scene} assets={new Map()} audio={audio} isPlaying={false} source={owner.monitor} />
      </div>
    </div>
  </main>
}
createRoot(document.getElementById('app')!).render(<Host />)
