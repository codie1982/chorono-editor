import { choronoRenderCapabilities, LocalRenderServiceError, renderModelGlb } from '../../../../server/model3d/render/ChoronoRenderServiceClient'
import { assertModelRenderSettings, type ModelRenderSettings } from '../../../../lib/model3d/renderSettings/modelRenderSettings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Compare the browser Origin with the Host that actually reached Next. Next
 * can normalize request.url to localhost behind its server adapter even when
 * the user opened 127.0.0.1, so request.url is not the CSRF comparison value. */
function isEditorOrigin(origin: string | null, host: string | null): boolean {
  if (!origin || !host) return false
  try {
    const parsed = new URL(origin)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      && parsed.origin === origin && parsed.host.toLowerCase() === host.toLowerCase()
  } catch { return false }
}

/** The renderer owns the local process. A missing service returns a recovery
 * state instead of silently falling back to the realtime viewport renderer. */
export async function GET(): Promise<Response> {
  try { const status = await choronoRenderCapabilities(); return Response.json({ available: status.state === 'ready', ...status }, { headers: { 'Cache-Control': 'no-store' } }) }
  catch (error) { return Response.json({ available: false, state: error instanceof LocalRenderServiceError ? error.state : 'error',
    reason: error instanceof Error ? error.message : 'Renderer unavailable.' }, { headers: { 'Cache-Control': 'no-store' } }) }
}

/** Same-origin, bounded GLB submission. The renderer process only receives
 * validated fixed options; no uploaded path, executable or CLI flag is trusted. */
export async function POST(request: Request): Promise<Response> {
  if (!isEditorOrigin(request.headers.get('origin'), request.headers.get('host')))
    return Response.json({ error: 'Origin is not this editor.' }, { status: 403 })
  if (Number(request.headers.get('content-length') || 0) > 18 * 1024 * 1024) return Response.json({ error: 'Scene upload exceeds 18 MiB.' }, { status: 413 })
  try {
    const form = await request.formData(), scene = form.get('scene'), raw = form.get('settings')
    if (!(scene instanceof File) || scene.size > 16 * 1024 * 1024 || typeof raw !== 'string' || raw.length > 4096)
      return Response.json({ error: 'Invalid scene or settings payload.' }, { status: 400 })
    const settings = JSON.parse(raw) as ModelRenderSettings
    assertModelRenderSettings(settings)
    const result = await renderModelGlb(new Uint8Array(await scene.arrayBuffer()), settings, request.signal)
    return new Response(new Uint8Array(result.bytes), { headers: { 'Content-Type': result.mime,
      'Content-Disposition': `inline; filename="${result.filename}"`, 'Cache-Control': 'no-store',
      'X-Chorono-Render-Warnings': encodeURIComponent(result.warnings) } })
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Render failed.' },
    { status: error instanceof LocalRenderServiceError ? 503 : 422 }) }
}
