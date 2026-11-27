import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { assertModelRenderSettings, type ModelRenderSettings } from '../../../lib/model3d/renderSettings/modelRenderSettings'

const CONTRACT_VERSION = 1
const MAX_GLB_BYTES = 16 * 1024 * 1024

/** Distinguishes an absent local process from an incompatible or failed one so
 * the UI can offer one calm recovery action. No bearer token reaches a browser. */
export class LocalRenderServiceError extends Error {
  constructor(readonly state: 'not-running' | 'incompatible' | 'error', message: string) { super(message) }
}

interface ServiceRecord { contractVersion: number; instanceId: string; port: number; token: string }

/** Read the renderer-owned mode-0600 discovery record. The editor connects only
 * to loopback; the file cannot supply an arbitrary host or executable path. */
async function discover(): Promise<ServiceRecord> {
  const file = process.env.CHORONO_RENDER_SERVICE_FILE || path.join(os.homedir(), '.chorono-render', 'editor-service.json')
  let value: unknown
  try { value = JSON.parse(await readFile(file, 'utf8')) }
  catch { throw new LocalRenderServiceError('not-running', 'Open Chorono Render on this computer, then check the connection again.') }
  const record = value as Partial<ServiceRecord>
  if (!record || record.contractVersion !== CONTRACT_VERSION || typeof record.instanceId !== 'string'
    || !Number.isInteger(record.port) || record.port! < 1024 || record.port! > 65535
    || typeof record.token !== 'string' || !/^[a-f0-9]{64}$/.test(record.token))
    throw new LocalRenderServiceError('incompatible', 'Chorono Render needs an update to work with this editor.')
  return record as ServiceRecord
}

/** Verify that the process at the recorded port is the same renderer instance.
 * A stale file or unrelated loopback server never receives the bearer token. */
async function connect(): Promise<{ url: string; record: ServiceRecord; state: 'ready' | 'busy' }> {
  const record = await discover(), url = `http://127.0.0.1:${record.port}`
  let response: Response
  try { response = await fetch(`${url}/v1/editor/health`, { signal: AbortSignal.timeout(3000), cache: 'no-store' }) }
  catch { throw new LocalRenderServiceError('not-running', 'Open Chorono Render on this computer, then check the connection again.') }
  const health = await response.json().catch(() => null)
  if (!response.ok || health?.service !== 'chorono-render' || health?.instanceId !== record.instanceId
    || health?.contractVersion !== CONTRACT_VERSION || !['ready', 'busy'].includes(health?.state))
    throw new LocalRenderServiceError('incompatible', 'Chorono Render connection changed. Restart it and check again.')
  return { url, record, state: health.state }
}

/** Read capabilities from the renderer's own server. The browser receives only
 * supported device/shader information and a status, never local credentials. */
export async function choronoRenderCapabilities(): Promise<{ state: 'ready' | 'busy'; capabilities: Record<string, unknown> }> {
  const { url, record, state } = await connect()
  const response = await fetch(`${url}/v1/editor/capabilities`, { headers: { Authorization: `Bearer ${record.token}` }, signal: AbortSignal.timeout(10_000), cache: 'no-store' })
  const result = await response.json().catch(() => null)
  if (!response.ok || result?.instanceId !== record.instanceId || result?.contractVersion !== CONTRACT_VERSION || !result?.capabilities?.devices)
    throw new LocalRenderServiceError('error', 'Could not read Chorono Render capabilities. Try the connection again.')
  return { state, capabilities: result.capabilities }
}

/** Send one bounded self-contained GLB to the renderer-owned loopback service.
 * The editor no longer locates or starts a renderer executable. Request abort
 * cancels the remote job; the renderer owns temporary files and final pixels. */
export async function renderModelGlb(glb: Uint8Array, settings: ModelRenderSettings, signal?: AbortSignal): Promise<{ bytes: Uint8Array; mime: string; filename: string; warnings: string }> {
  assertModelRenderSettings(settings)
  if (glb.length < 20 || glb.length > MAX_GLB_BYTES || new DataView(glb.buffer, glb.byteOffset, glb.byteLength).getUint32(0, true) !== 0x46546c67)
    throw new Error('A self-contained GLB of at most 16 MiB is required.')
  const { url, record } = await connect()
  const response = await fetch(`${url}/v1/editor/render`, {
    method: 'POST', headers: { Authorization: `Bearer ${record.token}`, 'Content-Type': 'model/gltf-binary',
      'X-Chorono-Render-Settings': Buffer.from(JSON.stringify(settings)).toString('base64url') },
    body: Buffer.from(glb), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5 * 60_000)]) : AbortSignal.timeout(5 * 60_000),
  })
  if (!response.ok) { const result = await response.json().catch(() => null); throw new Error(result?.error || 'Chorono Render could not complete this frame.') }
  const contentLength = Number(response.headers.get('content-length'))
  if (!Number.isSafeInteger(contentLength) || contentLength < 1 || contentLength > 32 * 1024 * 1024)
    throw new Error('Chorono Render returned an invalid image size.')
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.length !== contentLength) throw new Error('Chorono Render returned an incomplete image.')
  const extension = settings.format === 'jpeg' ? 'jpg' : settings.format
  return { bytes, mime: settings.format === 'jpeg' ? 'image/jpeg' : `image/${settings.format}`,
    filename: `chorono-3d.${extension}`, warnings: decodeURIComponent(response.headers.get('x-chorono-render-warnings') || '') }
}
