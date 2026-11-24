import { createRoot } from 'react-dom/client'
import { Subject } from './splineHarness'
import { checkMeshFaceEditing } from './checkMeshFaceEditing'

/** Independent native UI fixture. Keeps the accepted Mesh visible for an actual
 * viewport/panel screenshot; scene writes stay in this private editor. */
document.body.innerHTML = '<style>body{margin:16px;background:#111411;color:#f1f0e9;font:14px system-ui}button{margin:3px}#host{max-width:1380px}pre{white-space:pre-wrap}</style><h1>Mesh Vertex / Edge / Face acceptance</h1><button id="run">Run Mesh Face checks</button><p id="status">Ready</p><section id="host"></section><pre id="report"></pre>'
createRoot(document.getElementById('host')!).render(<Subject strictPanel />)
document.getElementById('run')!.onclick = async () => {
  const status = document.getElementById('status')!, report = document.getElementById('report')!
  status.textContent = 'Running'
  try { const check = await checkMeshFaceEditing(true); status.textContent = 'PASS'; report.textContent = JSON.stringify({ passed: true, check }, null, 2) }
  catch (error) { status.textContent = 'FAIL'; report.textContent = JSON.stringify({ passed: false, error: String(error) }, null, 2) }
}
