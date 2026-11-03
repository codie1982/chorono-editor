import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/mcp/route'
import { disconnect } from '../broker'

afterEach(() => vi.unstubAllEnvs())
const req = (headers: Record<string,string> = {}, body?: unknown) => new NextRequest('http://localhost:2000/api/mcp?op=status', { method: body ? 'POST' : 'GET', headers: { host:'127.0.0.1:2000', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) })
describe('local MCP HTTP boundary', () => {
  it('supports Next normalized URLs while validating the actual Host and Origin', async () => {
    vi.stubEnv('CHORONO_MCP_ENABLED','1')
    expect(await (await GET(req())).json()).toMatchObject({enabled:true,pid:process.pid,editorId:expect.stringMatching(/^[a-f0-9]{16}$/),projectId:expect.stringMatching(/^[a-f0-9]{16}$/),version:expect.any(String)})
    expect((await GET(req({host:'evil.example:2000'}))).status).toBe(403)
    expect((await GET(req({origin:'http://evil.example'}))).status).toBe(403)
    expect((await GET(req({'sec-fetch-site':'cross-site'}))).status).toBe(403)
  })
  it('requires explicit same-origin pairing and authenticates MCP calls', async () => {
    vi.stubEnv('CHORONO_MCP_ENABLED','1')
    expect((await POST(req({'Content-Type':'application/json'},{op:'pair'}))).status).toBe(400)
    expect((await POST(req({'Content-Type':'application/json'},{op:'call',name:'list_sessions'}))).status).toBe(400)
    const response = await POST(req({'Content-Type':'application/json',origin:'http://127.0.0.1:2000'},{op:'pair',label:'Route test'}))
    expect(response.status).toBe(200)
    const pair = await response.json()
    disconnect(pair.id,pair.token)
  })
  it('disables the bridge unless explicitly enabled', async () => {
    vi.stubEnv('CHORONO_MCP_ENABLED','0')
    expect((await POST(req({'Content-Type':'application/json'},{op:'call',name:'list_sessions'}))).status).toBe(404)
  })
})
