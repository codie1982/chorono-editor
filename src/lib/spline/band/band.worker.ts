import { SplineBandBackend } from './SplineBandBackend'
import type { SplineBandRequest, SplineBandResult } from './types'
import type { WorkerReply } from '../../resources/jobs'
/** Host termination cancels this one bounded, immutable source calculation. */
self.onmessage = (event: MessageEvent<SplineBandRequest>) => {
  let reply: WorkerReply<SplineBandResult>
  try { reply = { kind: 'result', result: new SplineBandBackend().compute(event.data) } }
  catch (error) { reply = { kind: 'error', message: error instanceof Error ? error.message : String(error) } }
  self.postMessage(reply)
}
