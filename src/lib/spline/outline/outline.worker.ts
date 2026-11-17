import { PlanarOutlineBackend } from './PlanarOutlineBackend'
import type { OutlineRequest, OutlineResult } from './types'
import type { WorkerReply } from '../../resources/jobs'

/** One bounded pure geometry calculation; host termination is cancellation. */
self.onmessage = (event: MessageEvent<OutlineRequest>) => {
  let reply: WorkerReply<OutlineResult>
  try { reply = { kind: 'result', result: new PlanarOutlineBackend().compute(event.data) } }
  catch (error) { reply = { kind: 'error', message: error instanceof Error ? error.message : String(error) } }
  self.postMessage(reply)
}
