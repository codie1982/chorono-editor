import { describe, expect, it } from 'vitest'
import { MCPBakeJobOwnership } from './MCPBakeJobOwnership'

describe('MCP bake job ownership', () => {
  it('binds opaque job ids to one client and editor session', () => {
    let now = 10
    const ownership = new MCPBakeJobOwnership(() => now)
    ownership.register('bake-ownership01', 'client-a', 'session-a')
    now = 20
    expect(ownership.require('bake-ownership01', 'client-a', 'session-a').seenAtMs).toBe(20)
    expect(() => ownership.require('bake-ownership01', 'client-b', 'session-a')).toThrow(/not found/)
    expect(() => ownership.require('bake-ownership01', 'client-a', 'session-b')).toThrow(/not found/)
    expect(ownership.remove('bake-ownership01')?.clientId).toBe('client-a')
  })

  it('releases jobs on client/session close and prunes abandoned ownership', () => {
    let now = 0
    const ownership = new MCPBakeJobOwnership(() => now)
    ownership.register('bake-clientjob1', 'client-a', 'session-a')
    ownership.register('bake-sessionjb1', 'client-b', 'session-a')
    expect(ownership.releaseClient('client-a').map(owner => owner.jobId)).toEqual(['bake-clientjob1'])
    expect(ownership.releaseSession('session-a').map(owner => owner.jobId)).toEqual(['bake-sessionjb1'])

    ownership.register('bake-expiredjob', 'client-c', 'session-c')
    now = 31 * 60 * 1000
    expect(ownership.prune().map(owner => owner.jobId)).toEqual(['bake-expiredjob'])
  })
})
