import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const MAX_ARCHIVE = 128 * 1024 * 1024

/** The editor server owns the private bearer. Browser requests stay same-origin
 * and never see the discovery file or call the render service directly. */
function assertLocalEditor(request: NextRequest, requireOrigin: boolean) {
  const host = request.headers.get('host') ?? ''
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(host)) throw new Error('Local Chorono editor required')
  if (requireOrigin) {
    const origin = new URL(`http://${host}`).origin
    if (request.headers.get('origin') !== origin) throw new Error('Same-origin editor action required')
  }
  const site = request.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') throw new Error('Cross-site request denied')
}

async function service() {
  const file = process.env.CHORONO_RENDER_SERVICE_FILE ?? path.join(os.homedir(), '.chorono-render', 'editor-service.json')
  let record: { port: number; token: string; instanceId: string; contractVersion: number }
  try {
    record = JSON.parse(await readFile(file, 'utf8'))
  } catch {
    throw new Error('Chorono Render is not running. Start it and try again.')
  }
  if (!Number.isInteger(record.port) || record.port < 1 || record.port > 65535 ||
    !/^[a-f0-9]{64}$/.test(record.token) || record.contractVersion !== 1) throw new Error('Chorono Render service record is invalid')
  let health: Response
  try {
    health = await fetch(`http://127.0.0.1:${record.port}/v1/editor/health`, { cache: 'no-store', signal: AbortSignal.timeout(3000) })
  } catch {
    throw new Error('Chorono Render is unavailable. Start it and try again.')
  }
  if (!health.ok) throw new Error('Chorono Render is unavailable')
  const state = await health.json()
  if (state.instanceId !== record.instanceId || state.contractVersion !== 1) throw new Error('Chorono Render service changed; reconnect')
  return record
}

/** Report whether the local desktop bridge is ready without exposing its
 * instance id, port, discovery location or bearer token. */
export async function GET(request: NextRequest) {
  try {
    assertLocalEditor(request, false)
    await service()
    return NextResponse.json({ available: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ available: false, error: error instanceof Error ? error.message : 'Chorono Render is unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}

export async function POST(request: NextRequest) {
  try {
    assertLocalEditor(request, true)
    if (request.headers.get('content-type') !== 'application/zip') throw new Error('PNG sequence ZIP required')
    const size = Number(request.headers.get('content-length'))
    if (!Number.isSafeInteger(size) || size < 64 || size > MAX_ARCHIVE) throw new Error('Sequence ZIP must be at most 128 MiB')
    const fps = Number(request.headers.get('x-chorono-fps'))
    if (!Number.isInteger(fps) || fps < 1 || fps > 120) throw new Error('Invalid FPS')
    const intent = request.headers.get('x-chorono-intent')
    if (intent !== 'still' && intent !== 'mp4') throw new Error('Invalid render output')
    const title = decodeURIComponent(request.headers.get('x-chorono-title') ?? '')
    if (!title.trim() || title.length > 160) throw new Error('Invalid sequence title')
    const record = await service()
    const metadata = Buffer.from(JSON.stringify({ title, fps })).toString('base64url')
    const response = await fetch(`http://127.0.0.1:${record.port}/v1/editor/sequence`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${record.token}`, 'Content-Type': 'application/zip',
        'Content-Length': String(size), 'X-Chorono-Sequence': metadata },
      body: request.body, signal: request.signal, duplex: 'half',
    } as RequestInit & { duplex: 'half' })
    const result = await response.json()
    return NextResponse.json(response.ok ? { ...result, intent } : result,
      { status: response.status, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Chorono Render transfer failed' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }
}
