import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import http from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { choronoRenderCapabilities, LocalRenderServiceError, renderModelGlb } from './ChoronoRenderServiceClient'
import { defaultModelRenderSettings } from '../../../lib/model3d/renderSettings/modelRenderSettings'

let server: http.Server, root = '', port = 0
const token = 'a'.repeat(64), instanceId = 'test-instance'
beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'chorono-render-client-test-'))
  server = http.createServer(async (req, res) => {
    if (req.url === '/v1/editor/health') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ service: 'chorono-render', contractVersion: 1, instanceId, state: 'ready' })); return }
    if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401); res.end(); return }
    if (req.url === '/v1/editor/capabilities') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ contractVersion: 1, instanceId, capabilities: { devices: { cpu: {}, gpu: {} } } })); return }
    for await (const _chunk of req) { /* Consume the test GLB. */ }
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': '8' }); res.end(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); port = typeof address === 'object' && address ? address.port : 0
  const file = path.join(root, 'service.json')
  await writeFile(file, JSON.stringify({ contractVersion: 1, instanceId, port, token }))
  vi.stubEnv('CHORONO_RENDER_SERVICE_FILE', file)
})
afterAll(async () => { vi.unstubAllEnvs(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }) })

describe('renderer-owned loopback client', () => {
  it('reads capabilities and returns a frame without launching a local executable', async () => {
    expect((await choronoRenderCapabilities()).state).toBe('ready')
    const glb = new Uint8Array(20); new DataView(glb.buffer).setUint32(0, 0x46546c67, true)
    const result = await renderModelGlb(glb, { ...defaultModelRenderSettings(), width: 64, height: 64 })
    expect(result.mime).toBe('image/png')
    expect(result.bytes.length).toBe(8)
  })
  it('reports missing discovery as a recoverable not-running state', async () => {
    vi.stubEnv('CHORONO_RENDER_SERVICE_FILE', path.join(root, 'absent.json'))
    await expect(choronoRenderCapabilities()).rejects.toMatchObject({ state: 'not-running' } satisfies Partial<LocalRenderServiceError>)
  })
})
