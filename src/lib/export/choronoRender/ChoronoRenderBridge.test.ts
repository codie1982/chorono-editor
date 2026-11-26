import { afterEach, describe, expect, it, vi } from 'vitest'
import { probeChoronoRender, transferToChoronoRender } from './ChoronoRenderBridge'

afterEach(() => vi.unstubAllGlobals())

describe('Chorono Render browser bridge', () => {
  it('reports an unavailable local service as recoverable UI state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Start Chorono Render.' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    })))
    await expect(probeChoronoRender()).resolves.toEqual({ available: false, message: 'Start Chorono Render.' })
  })

  it('sends a bounded output intent without exposing service credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'asset-1', title: 'Scene', frameCount: 1, width: 100, height: 100, fps: 30, intent: 'still',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    await transferToChoronoRender(new Blob(['archive']), { title: 'Scene', fps: 30, intent: 'still' })
    const [, request] = fetchMock.mock.calls[0]
    expect(request.headers).toMatchObject({
      'Content-Type': 'application/zip', 'X-Chorono-Fps': '30', 'X-Chorono-Intent': 'still',
    })
    expect(request.headers.Authorization).toBeUndefined()
  })
})
