/// <reference lib="webworker" />
import { RigidBodySimulationRunner } from '../rigid/RigidBodySimulationRunner'
import type { RigidBodyWorkerReply, RigidBodyWorkerRequest } from '../rigid/RigidBodyWorkerProtocol'

const context = self as unknown as DedicatedWorkerGlobalScope
let controller: AbortController | undefined
let started = false

/**
 * One worker owns one simulation. The runner yields in bounded tick chunks so
 * cancel messages can abort Matter before result transfer. Dense buffers move
 * to the client; no engine/native object crosses this boundary.
 */
context.onmessage = async (event: MessageEvent<RigidBodyWorkerRequest>) => {
  const request = event.data
  if (request.kind === 'cancel') {
    controller?.abort()
    return
  }
  if (started) return
  started = true
  controller = new AbortController()
  try {
    const result = await new RigidBodySimulationRunner().simulate(request.recipe, {
      signal: controller.signal,
      reportProgress: progress => context.postMessage({ kind: 'progress', ...progress } satisfies RigidBodyWorkerReply),
    })
    const sampleTimesBuffer = result.sampleTimesMs.buffer as ArrayBuffer
    const posesBuffer = result.poses.buffer as ArrayBuffer
    context.postMessage({ kind: 'result', sampleTimesBuffer, posesBuffer, events: result.events } satisfies RigidBodyWorkerReply,
      [sampleTimesBuffer, posesBuffer])
  } catch (error) {
    context.postMessage({
      kind: 'error',
      name: error instanceof Error ? error.name : 'Error',
      message: error instanceof Error ? error.message : String(error),
    } satisfies RigidBodyWorkerReply)
  }
}

context.postMessage({ kind: 'ready', supported: true } satisfies RigidBodyWorkerReply)
