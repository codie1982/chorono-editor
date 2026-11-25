export type ChoronoRenderIntent = 'still' | 'mp4'

export interface ChoronoRenderStatus {
  available: boolean
  message: string
}

export interface ChoronoRenderTransferResult {
  id: string
  title: string
  frameCount: number
  width: number
  height: number
  fps: number
  intent: ChoronoRenderIntent
}

/**
 * Probe the editor's same-origin server bridge. The private loopback discovery
 * record and bearer token stay server-side; callers receive only availability
 * and recovery text suitable for the Render Settings UI.
 */
export async function probeChoronoRender(signal?: AbortSignal): Promise<ChoronoRenderStatus> {
  try {
    const response = await fetch('/api/render/2d-sequence', { cache: 'no-store', signal })
    const body = await response.json() as { available?: boolean; error?: string }
    if (!response.ok || !body.available) {
      return { available: false, message: body.error ?? 'Start Chorono Render and try again.' }
    }
    return { available: true, message: 'Chorono Render is connected.' }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    return { available: false, message: 'Start Chorono Render and try again.' }
  }
}

/**
 * Transfer a freshly generated PNG ZIP through the local server bridge.
 * The imported asset opens in Chorono Render's 2D Video Studio, which owns the
 * final PNG or MP4 encoding, destination picker, cancellation and publication.
 */
export async function transferToChoronoRender(
  archive: Blob,
  options: { title: string; fps: number; intent: ChoronoRenderIntent },
  signal?: AbortSignal,
): Promise<ChoronoRenderTransferResult> {
  const response = await fetch('/api/render/2d-sequence', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/zip',
      'X-Chorono-Fps': String(options.fps),
      'X-Chorono-Intent': options.intent,
      'X-Chorono-Title': encodeURIComponent(options.title.slice(0, 160)),
    },
    body: archive,
    signal,
  })
  const body = await response.json() as Partial<ChoronoRenderTransferResult> & { error?: string }
  if (!response.ok) throw new Error(body.error ?? 'Chorono Render could not import the rendered frames.')
  return body as ChoronoRenderTransferResult
}
