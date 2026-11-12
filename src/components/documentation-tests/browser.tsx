import { createRoot } from 'react-dom/client'
import { useDocumentationState } from './useDocumentationState'
import { PanelHost } from './PanelHost'
import './host.css'

const params = new URLSearchParams(location.search)
const view = params.get('view') ?? 'layers'
const selection = params.get('layer') ?? ({ text: 'headline', path: 'path', particles: 'particles', spline: 'spline' }[view] ?? 'card')
const dialogs = ['composition', 'clone', 'array', 'json', 'bake', 'export-image', 'export-svg', 'export-sequence', 'wires'].includes(view)
const wide = dialogs || ['timeline', 'curves', 'dope-sheet', 'canvas', 'state-machine', 'tools', 'shortcuts'].includes(view)
// An explicit panel width exercises real dock sizing without changing component CSS.
const requestedWidth = Number(params.get('width'))
const captureWidth = Number.isFinite(requestedWidth) && requestedWidth >= 280 && requestedWidth <= 1120
  ? requestedWidth : wide ? 1120 : 500

/** Standalone React application with synthetic data and visible history proof.
 * Controls and JSON live outside the screenshot boundary. No application page,
 * autosave, server action, WebSocket or MCP connection is imported. */
function DocumentationTestHost() {
  const state = useDocumentationState(selection)
  return <main>
    <div id="doc-capture" data-view={view} style={{ width: captureWidth, maxWidth: '100vw', height: view === 'json' ? '100vh' : view === 'tools' ? 70 : dialogs ? 700 : wide ? 580 : 760 }}>
      <PanelHost view={view} state={state} />
    </div>
    <aside className="host-controls">
      <p>Isolated documentation fixture · {view} · no user-editor connection</p>
      <button onClick={state.editor.undo} disabled={!state.editor.canUndo}>Undo</button>
      <button onClick={state.editor.redo} disabled={!state.editor.canRedo}>Redo</button>
      <button onClick={() => location.reload()}>Reset fixture</button>
      <output id="host-history">Revision {state.editor.getRevision()} · {state.scene.layers.length} layers · {state.scene.timelines.reduce((n, t) => n + t.tracks.reduce((m, tr) => m + tr.keyframes.length, 0), 0)} keys</output>
      <pre id="host-source">{JSON.stringify(state.scene)}</pre>
    </aside>
  </main>
}
createRoot(document.getElementById('app')!).render(<DocumentationTestHost />)
