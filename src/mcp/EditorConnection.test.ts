import { describe, expect, it, vi } from 'vitest'
import { EditorConnection } from './EditorConnection'
import { MCP_VERSION } from '../lib/mcp/protocol'

vi.mock('../lib/mcp/storage', () => ({ getLocalToken: async () => 'a'.repeat(64) }))
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })

describe('STDIO connection ownership', () => {
  it('coalesces concurrent registration and keeps private credentials out of tool arguments', async () => {
    const requests: { body: any; headers: Headers }[] = []
    const fetcher = vi.fn(async (_url: unknown, options: any) => {
      const body = JSON.parse(options.body); requests.push({ body, headers: new Headers(options.headers) })
      if (body.op === 'connect_client') return reply({ connectionToken: 'b'.repeat(64), clientId: 'c'.repeat(64), protocolVersion: MCP_VERSION })
      return reply({ result: { revision: 0 } })
    }) as unknown as typeof fetch
    const connection = new EditorConnection(new URL('http://127.0.0.1:2002/api/mcp'), () => 'Hermes', fetcher)
    await Promise.all([connection.call('get_scene', {}), connection.call('get_scene', {})])
    expect(requests.filter(request => request.body.op === 'connect_client')).toHaveLength(1)
    for (const request of requests.filter(request => request.body.op === 'call')) {
      expect(request.headers.get('x-chorono-mcp-connection')).toBe('b'.repeat(64))
      expect(JSON.stringify(request.body)).not.toContain('b'.repeat(64))
      expect(request.body.clientName).toBeUndefined()
    }
    await connection.close()
    expect(requests.at(-1)?.body.op).toBe('close_client')
    await expect(connection.call('get_scene', {})).rejects.toMatchObject({ code: 'CLIENT_CONNECTION_REQUIRED' })
  })

  it('never retries a source operation when a connection expires; only a new deliberate call reconnects', async () => {
    let opens = 0, writes = 0
    const fetcher = vi.fn(async (_url: unknown, options: any) => {
      const body = JSON.parse(options.body)
      if (body.op === 'connect_client') { opens++; return reply({ connectionToken: String(opens).repeat(64), protocolVersion: MCP_VERSION }) }
      if (body.name === 'create_layer') { writes++; return reply({ error: { code: 'CLIENT_CONNECTION_REQUIRED' } }, 409) }
      return reply({ result: { revision: 0 } })
    }) as unknown as typeof fetch
    const connection = new EditorConnection(new URL('http://127.0.0.1:2002/api/mcp'), () => 'Hermes', fetcher)
    await expect(connection.call('create_layer', { kind: 'rect' })).rejects.toMatchObject({ code: 'CLIENT_CONNECTION_REQUIRED' })
    expect(opens).toBe(1); expect(writes).toBe(1)
    await connection.call('get_scene', {})
    expect(opens).toBe(2); expect(writes).toBe(1)
    await connection.close()
  })
})
