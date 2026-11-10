import path from 'node:path'
import { createBuildInfo } from '@/lib/version'

export const DIAGNOSTIC_POLICY = 'summary-v1'
export interface ReceiverConfiguration {
  readonly enabled: boolean
  readonly valid: boolean
  readonly directory: string
  readonly allowedOrigins: readonly string[]
}

/** Resolve explicit deployment configuration only. No wildcard CORS, account,
 * network discovery or raw environment value is sent to clients. Public traffic
 * requires HTTPS; loopback HTTP is supported for local development/acceptance. */
export function receiverConfiguration(environment: Readonly<Record<string, string | undefined>> = process.env): ReceiverConfiguration {
  const values = (environment.CHORONO_DIAGNOSTICS_ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean)
  let valid = values.length > 0 && values.length <= 20
  const allowedOrigins: string[] = []
  const directory = environment.CHORONO_DIAGNOSTICS_DIR
  if (directory !== undefined && (!directory.trim() || directory.length > 4096 || directory.includes('\0'))) valid = false
  for (const value of values) {
    try {
      const url = new URL(value)
      if (value.length > 256 || value !== url.origin || url.username || url.password || !safeProtocol(url)) valid = false
      else allowedOrigins.push(url.origin)
    } catch { valid = false }
  }
  return Object.freeze({ enabled: environment.CHORONO_DIAGNOSTICS_ENABLED === '1', valid,
    directory: path.resolve(directory?.trim() || path.join(process.cwd(), '.chorono', 'diagnostics')),
    allowedOrigins: Object.freeze(allowedOrigins) })
}

/** Return current release metadata or null when deliberately unconfigured.
 * Invalid trusted config throws for a generic503 response; URLs cannot contain
 * credentials/query/fragment or execute arbitrary protocol content. */
export function diagnosticRelease(environment: Readonly<Record<string, string | undefined>> = process.env): { version: string; notesUrl: string | null } | null {
  const version = environment.CHORONO_DIAGNOSTICS_LATEST_VERSION
  if (!version) return null
  createBuildInfo(version)
  const source = environment.CHORONO_DIAGNOSTICS_RELEASE_NOTES_URL
  if (!source) return { version, notesUrl: null }
  const url = new URL(source)
  const hostname = url.hostname.toLowerCase()
  if (source.length > 1024 || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || !hostname.includes('.') || hostname.startsWith('[') || /^\d+(?:\.\d+){3}$/.test(hostname)
    || /\.(?:localhost|local|internal|lan|home)$/.test(hostname)) throw new Error('Invalid release configuration')
  return { version, notesUrl: url.href }
}

/** Exact protocol boundary shared by trusted config validation. */
function safeProtocol(url: URL): boolean {
  return url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
}
