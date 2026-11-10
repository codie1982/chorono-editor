import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DiagnosticManagementController, type DiagnosticManagementSnapshot } from './DiagnosticManagementController'
import { DiagnosticManagementView } from './DiagnosticManagementView'
import { pageFixture } from './managementFixture'

function view(snapshot: DiagnosticManagementSnapshot) {
  return renderToStaticMarkup(<DiagnosticManagementView snapshot={snapshot} onConnect={() => {}} onDisconnect={() => {}}
    onRefresh={() => {}} onQuery={() => {}} onStatus={() => {}} />)
}
function empty() {
  const client = { list: vi.fn(async () => pageFixture()), update: vi.fn(async () => pageFixture().items[0]) }
  return new DiagnosticManagementController(client).getSnapshot()
}
describe('simple error management view', () => {
  it('renders a private empty login shell without credential names, query strings or automatic data', () => {
    const html = view(empty())
    expect(html).toContain('type="password"'); expect(html).toContain('autoComplete="current-password"')
    expect(html).toContain('method="post"'); expect(html).not.toContain('name="')
    expect(html).toContain('Admin token'); expect(html).not.toContain('Move commit failed')
  })
  it('renders one aggregated row/count, simple status controls and no duplicate events', () => {
    const html = view({ ...empty(), connected: true, page: pageFixture() })
    expect(html.match(/data-issue-key=/g)).toHaveLength(1)
    expect(html).toContain('143'); expect(html).toContain('Move commit failed')
    for (const label of ['New', 'Investigating', 'Fixed', 'Refresh', 'Most recent', 'Most frequent', 'First seen']) expect(html).toContain(label)
    expect(html).toContain('Counts are occurrences, not users.')
    expect(html).not.toContain('type="password"')
  })
  it('exposes pending/error/empty states with semantic labels and preserves old status', () => {
    const base = { ...empty(), connected: true, page: pageFixture() }
    const key = pageFixture().items[0].key
    const html = view({ ...base, pendingKeys: [key], rowErrors: { [key]: 'Could not save.' } })
    expect(html).toContain('Saving…'); expect(html).toContain('role="alert"'); expect(html).toContain('Could not save.')
    expect(html).toMatch(/<select[^>]*disabled=""/); expect(html).toContain('value="new" selected=""')
    const nothing = view({ ...base, page: { ...pageFixture(), items: [], total: 0 } })
    expect(nothing).toContain('No errors match these filters')
    expect(view({ ...empty(), connected: true, loading: true })).toContain('Loading issues…')
  })
})
