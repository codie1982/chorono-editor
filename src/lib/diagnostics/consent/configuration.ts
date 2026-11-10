export const DIAGNOSTIC_CONSENT_POLICY = 'summary-v1' as const

/** Public destination disclosed before permission; it contains no credentials.
 * Update checks share the same permission and service origin. */
export interface DiagnosticSharingConfiguration {
  readonly endpoint: string
  readonly versionEndpoint: string
  readonly operator: string
  readonly policyVersion: typeof DIAGNOSTIC_CONSENT_POLICY
}

/** Validate explicit application/deployment configuration, never source data.
 * HTTPS is required except local loopback development. Credentials/query/hash,
 * protocol-relative destinations and oversized labels are rejected. The update
 * route is the sibling `version` endpoint; no installed version is sent in a URL.
 * Missing/invalid configuration disables sharing and the first-run prompt. */
export function createDiagnosticConfiguration(endpoint: unknown, operator: unknown): DiagnosticSharingConfiguration | null {
  if (typeof endpoint !== 'string' || endpoint.length > 512 || typeof operator !== 'string' ||
    !operator.trim() || operator.length > 100 || /[\u0000-\u001f]/.test(operator)) return null
  try {
    const url = new URL(endpoint)
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if ((url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) || url.username ||
      url.password || url.search || url.hash || !url.pathname.endsWith('/reports')) return null
    return Object.freeze({ endpoint: url.href, versionEndpoint: new URL('version', url).href,
      operator: operator.trim(), policyVersion: DIAGNOSTIC_CONSENT_POLICY })
  } catch { return null }
}

/** Explicit build-time inputs only. Default local/editor installs do not guess
 * a remote service or transmit anything while unconfigured. */
export const applicationDiagnosticConfiguration = createDiagnosticConfiguration(
  process.env.NEXT_PUBLIC_CHORONO_DIAGNOSTICS_ENDPOINT,
  process.env.NEXT_PUBLIC_CHORONO_DIAGNOSTICS_OPERATOR,
)
