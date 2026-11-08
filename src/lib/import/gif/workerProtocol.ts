import type { DecodedGifSheet, GifLimits, GifSheetPlan } from './types'

/** One worker owns one admitted conversion. Ready precedes input transfer;
 * cancellation waits for native cleanup/error reply unless deadline terminates. */
export type GifWorkerRequest = { kind: 'decode'; buffer: ArrayBuffer; plan: GifSheetPlan; limits: GifLimits } | { kind: 'cancel' }
export type GifWorkerReply = { kind: 'ready'; supported: boolean }
  | { kind: 'result'; sheet: DecodedGifSheet }
  | { kind: 'error'; name: string; message: string }

/** Small platform handle supports real Worker and deterministic lifecycle tests. */
export interface GifWorkerHandle {
  onmessage: ((event: MessageEvent<GifWorkerReply>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  onmessageerror: ((event: MessageEvent) => void) | null
  postMessage(message: GifWorkerRequest, transfer?: Transferable[]): void
  terminate(): void
}
