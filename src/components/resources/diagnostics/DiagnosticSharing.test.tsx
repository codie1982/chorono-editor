import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { DiagnosticSharingSnapshot } from '@/lib/diagnostics/browser/sharing'
import { DiagnosticConsentContent, shouldShowDiagnosticPrompt } from './DiagnosticConsentPrompt'
import { DiagnosticSharingView } from './DiagnosticSharingSection'

/** Static UI data is content-free and uses a loopback test receiver. The tests
 * render presentation only, never initializing browser storage or transport. */
function snapshot(extra: Partial<DiagnosticSharingSnapshot> = {}): DiagnosticSharingSnapshot {
  return { ready: true, configured: true, choice: 'unknown', storageAvailable: true, queueAvailable: true,
    queued: 0, dropped: 0, lastOutcome: 'idle', latestVersion: null, notesUrl: null, versionStatus: 'idle',
    configuration: { endpoint: 'http://127.0.0.1:2000/api/diagnostics/reports',
      versionEndpoint: 'http://127.0.0.1:2000/api/diagnostics/version', operator: 'Chorono test receiver', policyVersion: 'summary-v1' },
    ...extra }
}

describe('diagnostic first-run question eligibility', () => {
  it('requires a visible, configured, durable and safe unknown preference', () => {
    expect(shouldShowDiagnosticPrompt(snapshot())).toBe(true)
    expect(shouldShowDiagnosticPrompt(snapshot(), false)).toBe(false)
    for (const extra of [{ ready: false }, { configured: false }, { configuration: null },
      { storageAvailable: false }, { queueAvailable: false }]) expect(shouldShowDiagnosticPrompt(snapshot(extra))).toBe(false)
  })

  it.each(['allowed', 'denied', 'dismissed'] as const)('does not ask again for persisted %s', choice => {
    expect(shouldShowDiagnosticPrompt(snapshot({ choice }))).toBe(false)
  })

  it('discloses service, report scope, recurrence and update checks without making a decision', () => {
    const choose = vi.fn()
    const html = renderToStaticMarkup(<DiagnosticConsentContent snapshot={snapshot()} onChoose={choose} />)
    for (const text of ['Help improve Chorono', 'anonymous error summaries and update checks', 'app version, error codes and repeat counts',
      'five minutes', 'daily', 'Chorono test receiver', 'http://127.0.0.1:2000/api/diagnostics/reports', 'Your choice is remembered',
      'Data and retention', '7 days', '90 days', 'network IP', 'Close diagnostic sharing question', 'Allow']) expect(html).toContain(text)
    expect(html).toMatch(/Don(?:&#x27;|&#39;|')t send/)
    expect(html).not.toContain('checked='); expect(choose).not.toHaveBeenCalled()
  })
})

describe('diagnostic sharing settings', () => {
  it('keeps unknown/denied preference unchecked and prevents version checks without permission', () => {
    for (const choice of ['unknown', 'denied', 'dismissed'] as const) {
      const consent = vi.fn(), check = vi.fn()
      const html = renderToStaticMarkup(<DiagnosticSharingView snapshot={snapshot({ choice })} onConsent={consent} onCheckVersion={check} />)
      expect(html).not.toContain('checked=')
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Check now<\/button>/)
      expect(html).toContain('Detailed Interaction recordings stay local.')
      expect(consent).not.toHaveBeenCalled(); expect(check).not.toHaveBeenCalled()
    }
  })

  it('reflects allowed delivery counters without exposing opaque error text', () => {
    const html = renderToStaticMarkup(<DiagnosticSharingView snapshot={snapshot({ choice: 'allowed', queued: 2,
      dropped: 3, lastOutcome: 'PRIVATE_SECRET_STACK' })} onConsent={() => {}} onCheckVersion={() => {}} />)
    expect(html).toContain('checked=""'); expect(html).toContain('Sharing is on.')
    expect(html).toContain('<dt>Queued</dt><dd>2</dd>'); expect(html).toContain('<dt>Dropped</dt><dd>3</dd>')
    expect(html).not.toContain('PRIVATE_SECRET_STACK')
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Check now<\/button>/)
  })

  it('fails closed for missing destination, unavailable storage or unsafe queue', () => {
    for (const extra of [{ configured: false, configuration: null }, { storageAvailable: false }, { queueAvailable: false }]) {
      const html = renderToStaticMarkup(<DiagnosticSharingView snapshot={snapshot(extra)} onConsent={() => {}} onCheckVersion={() => {}} />)
      expect(html).toMatch(/<input[^>]*disabled=""/)
      expect(html).not.toContain('checked=""')
      expect(html).not.toContain('<dt>Queued</dt>')
    }
  })

  it('announces supported version results and a guarded asynchronous action', () => {
    const html = renderToStaticMarkup(<DiagnosticSharingView snapshot={snapshot({ choice: 'allowed', latestVersion: '0.2.1',
      versionStatus: 'available', notesUrl: 'https://chorono.example/releases/0.2.1' })} onConsent={() => {}} onCheckVersion={() => {}} />)
    expect(html).toContain('Version 0.2.1 is available.')
    expect(html).toContain('rel="noopener noreferrer"')
    const checking = renderToStaticMarkup(<DiagnosticSharingView snapshot={snapshot({ choice: 'allowed', versionStatus: 'checking' })}
      onConsent={() => {}} onCheckVersion={() => {}} />)
    expect(checking).toMatch(/<button[^>]*disabled=""[^>]*>Checking…<\/button>/)
  })

  it('lets a stored allowed preference be turned off when the outbox becomes unavailable', () => {
    const html = renderToStaticMarkup(<DiagnosticSharingView snapshot={snapshot({ choice: 'allowed', queueAvailable: false })}
      onConsent={() => {}} onCheckVersion={() => {}} />)
    expect(html).toContain('checked=""')
    expect(html).not.toMatch(/<input[^>]*disabled=""/)
    expect(html).toContain('You can turn sharing off.')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Check now<\/button>/)
  })
})
