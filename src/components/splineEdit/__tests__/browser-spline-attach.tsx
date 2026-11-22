import { createRoot } from 'react-dom/client'
import { Subject } from './splineHarness'
import { checkSplineAttachPicking } from './checkSplineAttachPicking'

document.body.innerHTML = '<style>body{margin:16px;background:#101827;color:#e5e7eb;font:14px system-ui}nav button,#run{padding:8px;border:1px solid #475569;border-radius:5px;margin:4px}#host{max-width:1280px}pre{white-space:pre-wrap}</style><h1>Add Spline acceptance</h1><p>Actual + toggle, viewport picks and native history on disposable source.</p><button id="run">Run Add Spline checks</button><p id="status">Ready</p><section id="host"></section><pre id="report">No checks run</pre>'
createRoot(document.getElementById('host')!).render(<Subject />)
document.getElementById('run')!.onclick = async () => {
  const button = document.getElementById('run') as HTMLButtonElement, status = document.getElementById('status')!, report = document.getElementById('report')!
  button.disabled = true; status.textContent = 'Running'
  try {
    const evidence = await checkSplineAttachPicking()
    status.textContent = 'PASS · existing spline picks / holes / world positions / separate Undo/Redo / cancel'
    report.textContent = evidence
  } catch (error) { status.textContent = 'FAIL'; report.textContent = String(error) }
  finally { button.disabled = false }
}
