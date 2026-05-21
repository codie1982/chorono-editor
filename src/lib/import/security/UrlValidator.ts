// ── UrlValidator ──────────────────────────────────────────────────────────────
//
// Validates URLs before the import pipeline fetches remote assets (BL-08).
// Blocks dangerous schemes (javascript:, file:, data: for remote import) and
// enforces https-only except for localhost during development.

export interface UrlValidationResult {
  ok: boolean
  /** Reason for rejection (empty when ok). */
  reason?: string
  /** Parsed URL when valid. */
  url?: URL
}

const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

export class UrlValidator {
  /**
   * Validate a remote import URL.
   * - Must parse as an absolute URL.
   * - Scheme must be https (or http for localhost only).
   * - Rejects javascript:, file:, data:, blob:, ftp:, etc.
   */
  validate(input: string): UrlValidationResult {
    let url: URL
    try {
      url = new URL(input)
    } catch {
      return { ok: false, reason: 'Not a valid absolute URL' }
    }

    const scheme = url.protocol.replace(/:$/, '').toLowerCase()
    const isLocalhost = LOCALHOST_HOSTS.has(url.hostname.toLowerCase())

    if (scheme === 'https') return { ok: true, url }
    if (scheme === 'http') {
      if (isLocalhost) return { ok: true, url }
      return { ok: false, reason: 'Insecure http:// is only allowed for localhost — use https://' }
    }

    return { ok: false, reason: `Unsupported URL scheme "${scheme}:" — only https is allowed` }
  }
}

export const urlValidator = new UrlValidator()
