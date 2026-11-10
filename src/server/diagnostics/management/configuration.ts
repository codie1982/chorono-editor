import { createHash } from 'node:crypto'
import { diagnosticDirectoryConfiguration } from '../configuration'

export interface DiagnosticManagementConfiguration {
  readonly enabled: boolean
  readonly valid: boolean
  readonly directory: string
  readonly tokenDigest: Uint8Array | null
}

/** Explicit server-only administrative access, independent of public ingest.
 * A32–256-character nonspace printable ASCII token is required. Raw secrets are
 * never included in config/results/client bundles or error text. Only a SHA256
 * digest survives this composition boundary for fixed-size timing-safe compare.
 * Missing/invalid token disables management; invalid private paths fail503. */
export function diagnosticManagementConfiguration(environment: Readonly<Record<string, string | undefined>> = process.env): DiagnosticManagementConfiguration {
  const token = environment.CHORONO_DIAGNOSTICS_ADMIN_TOKEN
  const enabled = typeof token === 'string' && token.length >= 32 && token.length <= 256 && !/[^\x21-\x7e]/.test(token)
  const depot = diagnosticDirectoryConfiguration(environment)
  return Object.freeze({ enabled, valid: depot.valid, directory: depot.directory,
    tokenDigest: enabled ? createHash('sha256').update(token).digest() : null })
}
