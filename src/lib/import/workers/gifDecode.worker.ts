/// <reference lib="webworker" />
import { composeGif } from '../gif/composeGif'
import { browserGifPlatform } from '../gif/browserGifPlatform'
import { readGifMetadata } from '../gif/readGifMetadata'
import { planGifSheet } from '../gif/planGifSheet'
import { resolveGifLimits, type GifSheetPlan } from '../gif/types'
import type { GifWorkerRequest, GifWorkerReply } from '../gif/workerProtocol'

const context = self as unknown as DedicatedWorkerGlobalScope
let controller: AbortController | undefined
let started = false

/** One-shot transport delegates every frame/resource to the same composer as
 * the main-thread backend. Errors are sent only after its finally cleanup has
 * completed. Parent may request cooperative abort while native awaits settle. */
context.onmessage = async (event: MessageEvent<GifWorkerRequest>) => {
  const request = event.data
  if (request.kind === 'cancel') { controller?.abort(); return }
  if (started) return
  started = true; controller = new AbortController()
  let reply: GifWorkerReply
  try {
    const limits = resolveGifLimits(request.limits), metadata = readGifMetadata(request.buffer, limits), plan = planGifSheet(metadata, limits)
    if (Object.entries(plan).some(([key, value]) => request.plan[key as keyof GifSheetPlan] !== value)) throw new Error('GIF worker plan differs from admitted metadata.')
    const sheet = await composeGif(request.buffer, plan, limits, browserGifPlatform, { signal: controller.signal })
    reply = { kind: 'result', sheet }
  } catch (error) { reply = { kind: 'error', name: error instanceof Error ? error.name : 'Error', message: String(error) } }
  context.postMessage(reply)
}

/** Never receive/transfer input until actual worker codec support is known. */
async function ready(): Promise<void> {
  let supported = false
  try { supported = typeof ImageDecoder !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && await ImageDecoder.isTypeSupported('image/gif') } catch { /* explicit unsupported handshake */ }
  context.postMessage({ kind: 'ready', supported } satisfies GifWorkerReply)
}
void ready()
