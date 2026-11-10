import { answerEditor, callEditorTool, closeClientConnection, disconnect, getClientConnection, openClientConnection, pairEditor, pollEditor } from '../../broker'
import { executeEditorJob, type MCPHost } from '../../editor'
import { MCP_VERSION } from '../../protocol'
import { isSourceMutation } from '../../source/ToolSourcePolicy'
import { SourceAccessError } from '../../source/SourceAccessError'
import { EditorDocumentLifetime } from '../../../editor/lifecycle/EditorDocumentLifetime'
import { emptyScene } from '../../../defaults'
import type { ChronoScene } from '../../../types'
import { getCallableTool } from '../../catalog'
import type { BridgeJob } from '../../protocol'

/** Real broker/browser-dispatch harness over a tiny in-memory editor. Existing
 * behavior tests use call() to acquire fresh authority automatically; access
 * tests use rawCall() explicitly so missing/stale reads cannot be hidden. */
export function fakeEditor(label = 'MCP tester') {
  let scene = emptyScene(), revision = 0, transactionActive = false
  const history: ChronoScene[] = [], future: ChronoScene[] = [], document = new EditorDocumentLifetime()
  const host = { editor: {
    getScene: () => scene, getRevision: () => revision, getDocumentSignal: () => document.signal,
    isTransactionActive: () => transactionActive,
    dispatchCommand: (command: any) => { history.push(scene); scene = command.execute(scene); revision++; future.length = 0 },
    undo: () => { if (history.length) { future.push(scene); scene = history.pop()!; revision++ } },
    redo: () => { if (future.length) { history.push(scene); scene = future.pop()!; revision++ } },
  }, assets: new Map(), selectedTimelineId: '', currentTimeMs: 0, selectTimeline: () => {}, seek: () => {}, playToggle: () => {}, setSpeed: () => {} } as unknown as MCPHost
  const paired = pairEditor('Test editor'), controller = new AbortController(), tokens: string[] = []
  /** Independent authenticated identity, even when labels are identical. */
  const createClient = (name = label) => {
    const connection = openClientConnection(name, MCP_VERSION); tokens.push(connection.connectionToken)
    const identity = getClientConnection(connection.connectionToken)
    return { identity, connectionToken: connection.connectionToken,
      rawCall: (tool: string, args: any = {}) => callEditorTool(tool, { ...args, sessionId: paired.id }, identity) }
  }
  const client = createClient(), retryAccess = new Map<string, { expectedRevision: number; readToken: string }>()
  let beforeJob: ((job: BridgeJob) => void) | undefined
  const pump = (async () => {
    while (!controller.signal.aborted) {
      const job = await pollEditor(paired.id, paired.token, controller.signal)
      if (!job) continue
      beforeJob?.(job)
      try { answerEditor(paired.id, paired.token, job.id, await executeEditorJob(job, host)) }
      catch (error) { answerEditor(paired.id, paired.token, job.id, undefined, (error as Error).message, error instanceof SourceAccessError ? error.toJSON() : undefined) }
    }
  })()
  return { paired, host, ...client, createClient,
    call: async (name: string, args: any = {}) => {
      await getCallableTool(name)
      if (!isSourceMutation(name) || args.readToken !== undefined) return client.rawCall(name, args)
      let access = args.requestId ? retryAccess.get(args.requestId) : undefined
      if (!access) {
        const snapshot = await client.rawCall('get_scene')
        access = { expectedRevision: snapshot.revision, readToken: snapshot.readToken }
        if (args.requestId) retryAccess.set(args.requestId, access)
      }
      return client.rawCall(name, { ...access, ...args })
    },
    setTransactionActive: (active: boolean) => { transactionActive = active },
    interceptJobs: (callback?: (job: BridgeJob) => void) => { beforeJob = callback },
    replaceDocument: (next: ChronoScene, nextRevision = 0) => { scene = next; revision = nextRevision; document.replace(); history.length = 0; future.length = 0 },
    historyLength: () => history.length,
    close: async () => { tokens.forEach(closeClientConnection); controller.abort(); await pump; disconnect(paired.id, paired.token) },
  }
}
