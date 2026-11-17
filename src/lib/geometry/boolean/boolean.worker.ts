import { PolygonClippingBackend } from './PolygonClippingBackend'
import type { BooleanRequest } from './types'
import type { BooleanWorkerReply } from './workerProtocol'

/** Dedicated one-job worker. Host cancellation/deadline terminates this worker;
 * synchronous solver code has no cooperative interrupt point or shared cache. */
self.onmessage = (event: MessageEvent<BooleanRequest>) => {
  let reply: BooleanWorkerReply
  try { reply = { kind: 'result', result: new PolygonClippingBackend().compute(event.data) } }
  catch (error) { reply = { kind: 'error', message: error instanceof Error ? error.message : String(error) } }
  self.postMessage(reply)
}
