import { cancelledJobError } from '../../resources/jobs'

/** Runtime-only cancellation separate from serializable format options. Legacy
 * handlers may settle native work first; stale results must not be published. */
export interface ImportExecution { signal?: AbortSignal }

/** Shared AbortError at native/consumer/publication boundaries; does not claim
 * non-abortable native work has already settled. No mutation or allocation. */
export function checkImportExecution(execution?: ImportExecution): void {
  if (execution?.signal?.aborted) throw cancelledJobError()
}
