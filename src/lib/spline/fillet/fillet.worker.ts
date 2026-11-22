import { filletSpline } from './filletSpline'
import type { FilletRequest, FilletResult } from './types'
import type { WorkerReply } from '../../resources/jobs'

/** Stateless one-job CPU boundary. Host termination cancels all computation. */
self.onmessage = (event: MessageEvent<FilletRequest>) => {
  let reply: WorkerReply<FilletResult>
  try { reply = { kind: 'result', result: filletSpline(event.data) } }
  catch (error) { reply = { kind: 'error', message: error instanceof Error ? error.message : String(error) } }
  self.postMessage(reply)
}
