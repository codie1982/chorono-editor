import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import ResourceMonitorPanel from '@/components/resources/ResourceMonitorPanel'
import { createNativeMediaPreparationFixture, type NativeMediaPreparationFixture } from './nativeMediaPreparationFixture'
import { checkNativeMediaPreparation } from './checkNativeMediaPreparation'

/** Real panel over private native owners. An explicit inspection gate keeps the
 * two actual completions active long enough to verify aggregate/local counts.
 * Consumer pins, sources, context and surfaces are drained even on failed QA. */
function Host() {
  const [owner, setOwner] = useState<NativeMediaPreparationFixture | null>(null), [status, setStatus] = useState('Ready')
  const [report, setReport] = useState<unknown>(null), [continueChecks, setContinueChecks] = useState<(() => void) | null>(null)
  useEffect(() => () => { void owner?.dispose() }, [owner])
  const run = async () => {
    setStatus('Preparing native fixtures'); const rows: object[] = []
    let fixture: NativeMediaPreparationFixture | null = null
    try {
      fixture = await createNativeMediaPreparationFixture(); setOwner(fixture)
      const build = await (await fetch('media-preparation-sources.json')).json()
      const beforeCleanup = await checkNativeMediaPreparation(fixture, () => new Promise<void>(resolve => {
        setStatus('Inspect shared admission'); setContinueChecks(() => () => { setStatus('Running'); setContinueChecks(null); resolve() })
      }), rows, document.getElementById('copies')!)
      await fixture.dispose()
      const final = { queue: fixture.executor.getSnapshot(), budget: fixture.budget.getSnapshot(), native: fixture.stats() }
      if (final.queue.active !== 0 || final.queue.queued !== 0 || final.budget.chargedBytes !== 0 || final.native.active !== 0) throw new Error('Native cleanup did not drain')
      setReport({ passed: true, rows, build, beforeCleanup, final, environment: { userAgent: navigator.userAgent, dpr: devicePixelRatio } })
      setStatus('PASS')
    } catch (error) {
      let cleanupError: string | undefined
      await fixture?.dispose().catch(error => { cleanupError = String(error) })
      setReport({ passed: false, error: String(error), cleanupError, rows, queue: fixture?.executor.getSnapshot(), budget: fixture?.budget.getSnapshot() })
      setStatus('FAIL')
    }
  }
  return <main style={{ background: '#101827', color: '#e2e8f0', fontFamily: 'system-ui', minHeight: '100vh', padding: 20 }}>
    <h1>Shared media preparation · native acceptance</h1>
    <p>Real WAV / PNG / WOFF / independent video · two aggregate slots · private 512 MiB ledger</p>
    <button onClick={run} disabled={status !== 'Ready'}>Run native checks</button>
    <button onClick={() => continueChecks?.()} disabled={!continueChecks}>Continue checks</button>
    <p id="status">{status}</p>
    <div id="copies" style={{ display: 'flex', gap: 16, alignItems: 'center', minHeight: 48 }} />
    {owner && <div style={{ width: 960, height: 680, marginTop: 16 }}>
      <ResourceMonitorPanel scene={owner.scene} assets={owner.media} isPlaying={false} source={owner.monitor}
        audio={{ getResources: () => owner.engine.getResourceSnapshot(), getState: () => owner.engine.getState() }} />
    </div>}
    <pre id="report" style={{ whiteSpace: 'pre-wrap', maxHeight: 240, overflow: 'auto' }}>{report ? JSON.stringify(report, null, 2) : 'Ready'}</pre>
  </main>
}

createRoot(document.getElementById('app')!).render(<Host />)
