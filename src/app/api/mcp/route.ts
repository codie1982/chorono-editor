import { NextRequest, NextResponse } from 'next/server'
import { pairEditor, pollEditor, answerEditor, disconnect, callEditorTool } from '@/lib/mcp/broker'
import { getLocalToken, tokenEquals } from '@/lib/mcp/storage'
import { LIMITS, MCP_VERSION } from '@/lib/mcp/protocol'
import { createHash } from 'node:crypto'
import path from 'node:path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

function enabled() { return process.env.CHORONO_MCP_ENABLED === '1' }
function localRequest(request: NextRequest) {
  const host = request.headers.get('host') ?? ''
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(host)) throw new Error('MCP is available only on loopback hosts')
  // Next may normalize request.url to localhost even for a 127.0.0.1 Host.
  const expectedOrigin = new URL(`http://${host}`).origin
  const origin = request.headers.get('origin')
  if (origin && origin !== expectedOrigin) throw new Error('Cross-origin MCP access denied')
  const site = request.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') throw new Error('Cross-site MCP access denied')
  return expectedOrigin
}
function bearer(request: NextRequest) { return request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '' }

export async function GET(request: NextRequest) {
  try {
    localRequest(request)
    if (request.nextUrl.searchParams.get('op') === 'status') return NextResponse.json({ enabled: enabled(), version: MCP_VERSION, editorId: createHash('sha256').update(process.cwd()).digest('hex').slice(0, 16), projectId: createHash('sha256').update(path.resolve(process.env.CHORONO_MCP_PROJECT_DIR ?? path.join(process.cwd(), 'projects'))).digest('hex').slice(0, 16), pid: process.pid }, { headers: { 'Cache-Control': 'no-store' } })
    if (!enabled()) return NextResponse.json({ error: 'MCP disabled; start npm run dev:mcp' }, { status: 404 })
    const sessionId = request.nextUrl.searchParams.get('sessionId')
    if (!sessionId) throw new Error('Missing editor session id')
    return NextResponse.json({ job: await pollEditor(sessionId, bearer(request), request.signal) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 403 }) }
}

async function boundedBody(request: NextRequest) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error('application/json required')
  const reader = request.body?.getReader()
  if (!reader) throw new Error('Request body required')
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if ((size += value.length) > LIMITS.requestBytes) { await reader.cancel(); throw new Error('MCP payload limit exceeded') }
    chunks.push(value)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export async function POST(request: NextRequest) {
  try {
    const expectedOrigin = localRequest(request)
    if (!enabled()) return NextResponse.json({ error: 'MCP disabled; start npm run dev:mcp' }, { status: 404 })
    const body = await boundedBody(request)
    if (body.op === 'pair') {
      if (request.headers.get('origin') !== expectedOrigin) throw new Error('Pairing requires an explicit same-origin editor action')
      await getLocalToken()
      return NextResponse.json(pairEditor(String(body.label ?? 'Chorono editor')))
    }
    if (body.op === 'reply') { answerEditor(body.sessionId, bearer(request), body.jobId, body.result, body.error); return NextResponse.json({ ok: true }) }
    if (body.op === 'disconnect') { disconnect(body.sessionId, bearer(request)); return NextResponse.json({ ok: true }) }
    if (!tokenEquals(bearer(request), await getLocalToken())) throw new Error('MCP client not authorized')
    if (body.op !== 'call') throw new Error('Unknown MCP operation')
    return NextResponse.json({ result: await callEditorTool(body.name, body.arguments ?? {}, body.clientName) })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
