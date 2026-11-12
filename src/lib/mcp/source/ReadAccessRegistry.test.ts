import { describe, expect, it } from 'vitest'
import { ReadAccessRegistry, READ_ACCESS_TTL_MS, type SourceScope } from './ReadAccessRegistry'
import { ClientConnections } from './ClientConnections'

const scope: SourceScope = { clientId: 'a', sessionId: 'editor', documentEpoch: 'document-a', revision: 4 }
const factory = () => { let id = 0; return () => (++id).toString(16).padStart(64, '0') }

describe('one-use source read authority', () => {
  it('pins all four dimensions and consumes exactly once without accepting guessed/foreign reads', () => {
    const reads = new ReadAccessRegistry(factory())
    const access = reads.issue(scope)
    for (const change of [{ clientId: 'b' }, { sessionId: 'other' }]) {
      expect(() => reads.consume(access.readToken, { ...scope, ...change })).toThrow(expect.objectContaining({ code: 'SOURCE_READ_SCOPE' }))
    }
    expect(() => reads.consume(access.readToken, { ...scope, revision: 5 })).toThrow(expect.objectContaining({ code: 'SOURCE_REVISION_CONFLICT' }))
    expect(() => reads.consume(access.readToken, { ...scope, documentEpoch: 'document-b' })).toThrow(expect.objectContaining({ code: 'SOURCE_DOCUMENT_CHANGED' }))
    reads.consume(access.readToken, scope)
    expect(() => reads.consume(access.readToken, scope)).toThrow(expect.objectContaining({ code: 'SOURCE_READ_USED' }))
    expect(() => reads.consume('f'.repeat(64), scope)).toThrow(expect.objectContaining({ code: 'SOURCE_READ_REQUIRED' }))
  })
  it('expires, caps and revokes grants without retaining source snapshots', () => {
    let now = 100
    const reads = new ReadAccessRegistry(factory(), () => now, 1), access = reads.issue(scope)
    expect(() => reads.issue({ ...scope, clientId: 'b' })).toThrow(expect.objectContaining({ code: 'SOURCE_ACCESS_CAPACITY' }))
    now += READ_ACCESS_TTL_MS
    expect(() => reads.consume(access.readToken, scope)).toThrow(expect.objectContaining({ code: 'SOURCE_READ_EXPIRED' }))
    const fresh = reads.issue(scope)
    reads.revoke({ sessionId: scope.sessionId })
    expect(() => reads.consume(fresh.readToken, scope)).toThrow()
  })
  it('reserves plan scope independently from later reads and ordinary writes', () => {
    const reads = new ReadAccessRegistry(factory()), first = reads.issue(scope)
    reads.consume(first.readToken, scope)
    const plan = reads.issue(scope, 'plan')
    const next = reads.issue(scope)
    expect(() => reads.consume(plan.readToken, scope)).toThrow(expect.objectContaining({ code: 'SOURCE_READ_SCOPE' }))
    expect(() => reads.consume(next.readToken, scope, 'plan')).toThrow(expect.objectContaining({ code: 'SOURCE_READ_SCOPE' }))
    reads.consume(plan.readToken, scope, 'plan')
    reads.revoke({ planId: 'plan' })
    expect(() => reads.consume(plan.readToken, scope, 'plan')).toThrow()
  })
})

describe('actual client connection identity', () => {
  it('does not share authority or identity merely because client names match', () => {
    const expired: string[] = [], clients = new ClientConnections(factory(), id => expired.push(id))
    const a = clients.open('Hermes'), b = clients.open('Hermes')
    const identity = clients.require(a.connectionToken)
    expect(identity.id).not.toBe(clients.require(b.connectionToken).id)
    expect(() => clients.verify({ ...identity })).toThrow(expect.objectContaining({ code: 'CLIENT_CONNECTION_REQUIRED' }))
    clients.close(a.connectionToken)
    expect(expired).toEqual([identity.id])
    expect(() => clients.require(a.connectionToken)).toThrow()
  })
  it('bounds idle connections and releases their source state on expiry', () => {
    let now = 0
    const expired: string[] = [], clients = new ClientConnections(factory(), id => expired.push(id), () => now, 1)
    const a = clients.open('a')
    expect(() => clients.open('b')).toThrow(expect.objectContaining({ code: 'SOURCE_ACCESS_CAPACITY' }))
    now = 31 * 60_000
    expect(() => clients.require(a.connectionToken)).toThrow()
    expect(expired).toEqual([a.clientId])
    expect(clients.open('b').clientId).not.toBe(a.clientId)
  })
})
