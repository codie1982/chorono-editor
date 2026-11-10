import { diagnosticFailureAt } from '../contracts/catalog'
import type { DiagnosticFailure } from '../contracts/types'
import { diagnosticField } from './diagnosticFields'

/** Convert an explicit internal failure signal into one immutable safe record.
 * Only an own `failureSite` matching the static catalogue is read. All other
 * caller fields, including Error/message/stack, geometry and authored content,
 * are discarded without traversal. Returns undefined for ordinary interactions,
 * unknown sites, malformed records, getters and exceptions. No mutation, clock,
 * browser, collection, consent or network operation occurs here. Callers must
 * signal actual failures; a normal cancelled gesture must not call a failure site.
 */
export function convertDiagnosticFailure(input: unknown): DiagnosticFailure | undefined {
  return diagnosticFailureAt(diagnosticField(input, 'failureSite'))
}
