import { BoundedBinaryReader } from '@/lib/resources/io'
import type { DiagnosticReport } from '../contracts/types'
import { DIAGNOSTIC_POLICY_VERSION } from './types'

export interface DiagnosticSendResult {
  readonly kind: 'accepted' | 'retry' | 'permanent'
  readonly retryAfterMs?: number
}

/** Interpret Retry-After seconds or HTTP-date, bounded by the 24-hour queue TTL. */
function retryDelay(header: string | null, now: number): number | undefined {
  if (!header || header.length > 80) return
  const seconds = /^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - now
  return Number.isFinite(seconds) ? Math.max(0, Math.min(24 * 60 * 60 * 1000, seconds)) : undefined
}

/** Send one frozen report to the configured endpoint, without credentials,
 * referrer, redirect following, keepalive or arbitrary metadata. ACK parsing is
 * capped at 1 KiB by the existing binary reader, with lease release on every
 * exit. All failures are categorical; response bodies/errors are not retained.
 * Consent and timeout ownership belong to the dispatcher, which supplies signal.
 */
export async function sendDiagnosticReport(fetcher: (url: string, options: RequestInit) => Promise<Response>,
  endpoint: string, report: DiagnosticReport, signal: AbortSignal, now: number): Promise<DiagnosticSendResult> {
  try {
    const response = await fetcher(endpoint, { method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer',
      redirect: 'error', cache: 'no-store', keepalive: false, signal,
      headers: { 'Content-Type': 'application/json', 'X-Chorono-Diagnostics-Policy': DIAGNOSTIC_POLICY_VERSION },
      body: JSON.stringify(report) })
    if (!response.ok) {
      await response.body?.cancel().catch(() => {})
      const retry = response.status === 408 || response.status === 429 || response.status >= 500
      return { kind: retry ? 'retry' : 'permanent', retryAfterMs: retry ? retryDelay(response.headers.get('retry-after'), now) : undefined }
    }
    const reader = new BoundedBinaryReader({ maxBytes: 1024 })
    const input = await reader.readResponse(response, { signal })
    try {
      const ack = JSON.parse(new TextDecoder().decode(input.buffer))
      const keys = ack && typeof ack === 'object' ? Object.keys(ack) : []
      return keys.length === 3 && keys.every(key => ['accepted', 'reportId', 'duplicate'].includes(key)) &&
        ack.accepted === true && ack.reportId === report.reportId && typeof ack.duplicate === 'boolean'
        ? { kind: 'accepted' } : { kind: 'retry' }
    } finally { input.release() }
  } catch { return { kind: 'retry' } }
}
