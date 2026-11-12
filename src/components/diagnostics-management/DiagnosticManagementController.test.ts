import { describe, expect, it, vi } from 'vitest'
import type { DiagnosticIssue, DiagnosticIssuePage } from '@/lib/diagnostics/management'
import { DiagnosticManagementController } from './DiagnosticManagementController'
import { DiagnosticManagementError } from './DiagnosticManagementApi'
import { issueFixture, pageFixture } from './managementFixture'

const token = 't'.repeat(40)
function setup() {
  const client = { list: vi.fn(async (_token: string, _query: unknown, _signal: AbortSignal) => pageFixture()),
    update: vi.fn(async (_token: string, _key: string, _status: unknown, _revision: number, _signal: AbortSignal) => issueFixture('investigating', 1)) }
  return { client, controller: new DiagnosticManagementController(client, () => Date.UTC(2026, 10, 10, 9)) }
}
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }

describe('management session ownership', () => {
  it('does no work before explicit valid login and never exposes the credential', async () => {
    const { client, controller } = setup(), before = controller.getSnapshot()
    expect(client.list).not.toHaveBeenCalled(); expect(before.connected).toBe(false)
    await controller.connect('short'); expect(client.list).not.toHaveBeenCalled()
    await controller.connect(token + '\n'); expect(client.list).not.toHaveBeenCalled()
    await controller.connect(token)
    expect(client.list).toHaveBeenCalledTimes(1); expect(controller.getSnapshot().page?.items).toHaveLength(1)
    expect(JSON.stringify(controller.getSnapshot())).not.toContain(token)
    expect(Object.isFrozen(controller.getSnapshot())).toBe(true)
  })
  it('discards a late login response and aborts all requests on disconnect', async () => {
    const { client, controller } = setup(), pending = deferred<DiagnosticIssuePage>()
    client.list.mockReturnValue(pending.promise)
    const task = controller.connect(token); const signal = client.list.mock.calls[0][2]
    controller.disconnect(); expect(signal.aborted).toBe(true)
    pending.resolve(pageFixture()); await task
    expect(controller.getSnapshot().page).toBeNull(); expect(controller.getSnapshot().connected).toBe(false)
  })
  it('does not let a stale filter response overwrite the latest query', async () => {
    const { client, controller } = setup(); await controller.connect(token)
    const first = deferred<DiagnosticIssuePage>(), second = deferred<DiagnosticIssuePage>()
    client.list.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const a = controller.setQuery({ status: 'fixed' }), b = controller.setQuery({ status: 'investigating' })
    expect(client.list.mock.calls[1][2].aborted).toBe(true)
    second.resolve(pageFixture(issueFixture('investigating', 1))); await b
    first.resolve(pageFixture(issueFixture('fixed', 2))); await a
    expect(controller.getSnapshot().query.status).toBe('investigating')
    expect(controller.getSnapshot().page?.items[0].status).toBe('investigating')
  })
  it('retains a row on failed CAS mutation and sends its actual last revision', async () => {
    const { client, controller } = setup(); await controller.connect(token)
    client.update.mockRejectedValue(new DiagnosticManagementError(503))
    await controller.changeStatus(issueFixture().key, 'fixed')
    expect(client.update.mock.calls[0].slice(0, 4)).toEqual([token, issueFixture().key, 'fixed', 0])
    expect(controller.getSnapshot().page?.items[0].status).toBe('new')
    expect(controller.getSnapshot().rowErrors[issueFixture().key]).toContain('previous value is unchanged')
    expect(controller.getSnapshot().pendingKeys).toHaveLength(0)
  })
  it('refreshes a conflict without overwriting the newer remote status', async () => {
    const { client, controller } = setup(); await controller.connect(token)
    client.update.mockRejectedValue(new DiagnosticManagementError(409))
    client.list.mockResolvedValue(pageFixture(issueFixture('fixed', 4)))
    await controller.changeStatus(issueFixture().key, 'investigating')
    expect(controller.getSnapshot().page?.items[0].status).toBe('fixed')
    expect(controller.getSnapshot().page?.items[0].revision).toBe(4)
    expect(controller.getSnapshot().message).toContain('another session')
  })
  it('guards one in-flight edit per row and discards its late ACK after logout', async () => {
    const { client, controller } = setup(); await controller.connect(token)
    const update = deferred<DiagnosticIssue>(); client.update.mockReturnValue(update.promise)
    const task = controller.changeStatus(issueFixture().key, 'investigating')
    await controller.changeStatus(issueFixture().key, 'fixed'); expect(client.update).toHaveBeenCalledTimes(1)
    const signal = client.update.mock.calls[0][4]; controller.disconnect(); expect(signal.aborted).toBe(true)
    update.resolve(issueFixture('investigating', 1)); await task
    expect(controller.getSnapshot().page).toBeNull(); expect(controller.getSnapshot().message).toBe('')
  })
  it('clears data/token on authentication rejection and hides raw exception messages', async () => {
    const { client, controller } = setup(); client.list.mockRejectedValue(new DiagnosticManagementError(401))
    await controller.connect(token)
    expect(controller.getSnapshot().connected).toBe(false); expect(controller.getSnapshot().error).toContain('not accepted')
    client.list.mockRejectedValue(new Error('RAW_SECRET_STACK')); await controller.connect(token)
    expect(JSON.stringify(controller.getSnapshot())).not.toContain('RAW_SECRET_STACK')
  })
  it('validates controls before sending and removes a filter-mismatched ACKed row', async () => {
    const { client, controller } = setup(); await controller.connect(token)
    await controller.setQuery({ appVersion: 'private/path' }); expect(client.list).toHaveBeenCalledTimes(1)
    await controller.setQuery({ status: 'new' })
    client.update.mockResolvedValue(issueFixture('fixed', 1)); client.list.mockRejectedValue(new Error('offline'))
    await controller.changeStatus(issueFixture().key, 'fixed')
    expect(controller.getSnapshot().page?.items).toHaveLength(0)
    expect(controller.getSnapshot().page?.counts.fixed).toBe(1)
  })
})
