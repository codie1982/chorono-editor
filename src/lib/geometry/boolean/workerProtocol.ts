import type { BooleanRequest, BooleanResult } from './types'
import type { WorkerReply, OneShotWorkerHandle } from '../../resources/jobs'
/** Compatibility aliases over the shared one-shot protocol; wire shape is unchanged. */
export type BooleanWorkerReply = WorkerReply<BooleanResult>
export type BooleanWorkerHandle = OneShotWorkerHandle<BooleanRequest, BooleanResult>
