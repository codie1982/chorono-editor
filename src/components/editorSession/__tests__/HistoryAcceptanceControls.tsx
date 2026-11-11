import { useState } from 'react'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { useFileVersioning, type SceneDirectory } from '@/app/hooks/useFileVersioning'
import { useSessionIdentity } from '../SessionOutputContext'
import { acquireSceneText } from '@/lib/export/text'
import { readSessionProject } from '@/lib/editor/session/SessionProject'
import { parseSceneJson } from '@/lib/format/scene/SceneJsonConverter'
import { sessionOutputFilename, sessionRecordKey, SESSION_INDEX_PREFIX } from '@/lib/editor/session/sessionIdentity'
import type { BrowserRecoverySession } from '@/lib/editor/persistence/recovery/browserSessionRecovery'

/** A controlled filesystem port exercises the production writer/admission and
 * folder hook without opening a native picker or touching user project files. */
function memoryDirectory(files: Map<string, string>, root = ''): SceneDirectory {
  return { name: 'Acceptance folder',
    getDirectoryHandle: async name => memoryDirectory(files, root + name + '/'),
    getFileHandle: async name => ({ createWritable: async () => {
      let pending = ''
      return { write: async value => { pending = String(value) }, close: async () => { files.set(root + name, pending) }, abort: async () => {} }
    } }),
  }
}
/** Inspectable UI around production hooks; no test-only access to editor state
 * is installed on window. Paste/open follows the real versioned converter. */
export function HistoryAcceptanceControls({ editor, session }: { editor: EditorStateReturn; session: BrowserRecoverySession }) {
  const identity = useSessionIdentity()!, [project, setProject] = useState(''), [result, setResult] = useState('')
  const [files] = useState(() => new Map<string, string>())
  const folder = useFileVersioning(editor.committedScene, { sessionId: identity.id, history: editor.committedHistory,
    pickDirectory: async () => memoryDirectory(files), interval_ms: 20, fallback_ms: 1000 })
  const history = editor.getCommittedHistory()
  return <section>
    <output id="history-counts">{JSON.stringify({ undo: history.past.length, redo: history.future.length, sessionId: identity.id, slotId: session.slotId })}</output>
    <nav className="flex gap-4 py-2">
      <button onClick={async () => {
        const source = editor.getCommittedHistory(), output = await acquireSceneText(source.present, 'editor-json', { session: { sessionId: identity.id, history: source } })
        try { setProject(output.value.text); setResult(sessionOutputFilename(output.value.filename, identity.id)) } finally { output.release() }
      }}>Prepare session JSON</button>
      <button onClick={() => { const opened = readSessionProject(parseSceneJson(project)); identity.adopt(opened.sessionId ?? crypto.randomUUID()); editor.resetHistory(opened.history); setResult('Opened session JSON') }}>Open pasted session JSON</button>
      <button onClick={async () => { await folder.pickDirectory(); setResult(JSON.stringify(Array.from(files, ([path, text]) => ({ path, project: JSON.parse(text) })))) }}>Choose test save folder</button>
      <button onClick={() => setResult(JSON.stringify(Array.from(files, ([path, text]) => ({ path, project: JSON.parse(text) }))))}>Inspect folder files</button>
      <button onClick={async () => setResult(JSON.stringify({ manifest: session.storage?.getItem(SESSION_INDEX_PREFIX + identity.id), record: await session.store.read(sessionRecordKey(identity.id, session.slotId)) }))}>Inspect session manifest</button>
    </nav>
    <label>Session project JSON<textarea aria-label="Session project JSON" value={project} onChange={event => setProject(event.target.value)} className="w-full h-16 text-black" /></label>
    <pre id="history-result" className="text-xs whitespace-pre-wrap">{result}</pre>
  </section>
}
