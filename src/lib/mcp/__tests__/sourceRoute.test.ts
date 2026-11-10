import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/mcp/route'
import { fakeEditor } from './support/fakeEditor'
import { MCP_VERSION } from '../protocol'

vi.mock('../storage', () => ({
  getLocalToken: async () => 'a'.repeat(64), tokenEquals: (a: string, b: string) => a === b,
  audit: async () => {}, listProjects: async () => [], writeArtifact: vi.fn(), loadProject: vi.fn(),
}))
afterEach(() => vi.unstubAllEnvs())
const post = (body: unknown, connection?: string) => POST(new NextRequest('http://localhost:2000/api/mcp', {
  method: 'POST', headers: { host: '127.0.0.1:2000', 'Content-Type': 'application/json',
    Authorization: `Bearer ${'a'.repeat(64)}`, ...(connection ? { 'X-Chorono-MCP-Connection': connection } : {}) },
  body: JSON.stringify(body),
}))

describe('source access at the authenticated HTTP boundary', () => {
  it('keeps credentials in the connection header and rejects display-name impersonation', async () => {
    vi.stubEnv('CHORONO_MCP_ENABLED', '1')
    const editor = fakeEditor(), connections: string[] = []
    try {
      const a = await (await post({ op: 'connect_client', clientName: 'Hermes', protocolVersion: MCP_VERSION })).json()
      const b = await (await post({ op: 'connect_client', clientName: 'Hermes', protocolVersion: MCP_VERSION })).json()
      connections.push(a.connectionToken, b.connectionToken)
      expect(a.clientId).not.toBe(b.clientId)
      const read = (await (await post({ op: 'call', name: 'get_scene', arguments: { sessionId: editor.paired.id } }, a.connectionToken)).json()).result
      const body = { op: 'call', name: 'create_layer', clientName: 'Hermes', arguments: {
        sessionId: editor.paired.id, kind: 'rect', expectedRevision: read.revision, readToken: read.readToken, requestId: 'once',
      } }
      const foreign = await post(body, b.connectionToken)
      expect(foreign.status).toBe(409)
      expect((await foreign.json()).error).toMatchObject({ code: 'SOURCE_READ_SCOPE', recovery: 'get_scene' })
      const unregistered = await post(body)
      expect((await unregistered.json()).error.code).toBe('CLIENT_CONNECTION_REQUIRED')
      const created = await post(body, a.connectionToken)
      expect(created.status).toBe(200)
      expect((await created.json()).result.revision).toBe(1)
      const replayedByOther = await post(body, b.connectionToken)
      expect(replayedByOther.status).toBe(409)
      // B recovers its own earlier failed request, never A's successful result.
      expect((await replayedByOther.json()).error.code).toBe('SOURCE_READ_SCOPE')
      expect(editor.historyLength()).toBe(1)
    } finally {
      for (const connection of connections) await post({ op: 'close_client' }, connection)
      await editor.close()
    }
  })
})
