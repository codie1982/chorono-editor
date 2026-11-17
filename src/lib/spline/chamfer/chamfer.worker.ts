import { chamferSpline } from './chamferSpline'
import type { ChamferRequest, ChamferResult } from './types'
import type { WorkerReply } from '../../resources/jobs'

/** Stateless one-job CPU boundary. Host termination cancels all computation. */
self.onmessage = (event: MessageEvent<ChamferRequest>) => {
  let reply: WorkerReply<ChamferResult>
  try { reply = { kind: 'result', result: chamferSpline(event.data) } }
  catch (error) { reply = { kind: 'error', message: error instanceof Error ? error.message : String(error) } }
  self.postMessage(reply)
}
