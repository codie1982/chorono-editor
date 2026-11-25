import { describe, expect, it } from 'vitest'
import { POST } from './route'

/** Next may expose localhost in Request.url while the browser and Host use
 * 127.0.0.1. These requests must reach payload validation, while a different
 * browser origin must be rejected before the renderer is invoked. */
describe('model render request origin', () => {
  it('accepts the actual Host when Next normalizes Request.url', async () => {
    const request = new Request('http://localhost:2012/api/model3d/render', {
      method: 'POST',
      headers: { Host: '127.0.0.1:2012', Origin: 'http://127.0.0.1:2012' },
    })
    expect((await POST(request)).status).toBe(422)
  })

  it('rejects requests from another host or without an Origin', async () => {
    for (const origin of ['http://example.com', null]) {
      const headers: Record<string, string> = { Host: '127.0.0.1:2012' }
      if (origin) headers.Origin = origin
      const request = new Request('http://localhost:2012/api/model3d/render', { method: 'POST', headers })
      expect((await POST(request)).status).toBe(403)
    }
  })
})
