import type { ChoronoRenderIntent } from '../choronoRender/ChoronoRenderBridge'

export type RenderBackendId = 'chorono' | 'builtin'
export type RenderIntent = 'still' | 'video'
export type RenderArtifact = 'png' | 'mp4' | 'png-sequence'

export interface RenderCompletion {
  readonly backend: RenderBackendId
  readonly intent: RenderIntent
  readonly artifact: RenderArtifact
  readonly frameCount: number
  readonly filename?: string
}

/** Select Chorono Render whenever its authenticated local service is available.
 * The built-in renderer is the deterministic fallback and never depends on an
 * installation or external process. */
export function preferredRenderBackend(choronoAvailable: boolean): RenderBackendId {
  return choronoAvailable ? 'chorono' : 'builtin'
}

/** Describe the artifact a backend can truthfully publish for an intent. The
 * built-in renderer has no MP4 encoder, so video delivery is a PNG sequence. */
export function renderArtifact(backend: RenderBackendId, intent: RenderIntent): RenderArtifact {
  if (intent === 'still') return 'png'
  return backend === 'chorono' ? 'mp4' : 'png-sequence'
}

/** Convert the editor-neutral intent to the current Chorono bridge contract. */
export function toChoronoRenderIntent(intent: RenderIntent): ChoronoRenderIntent {
  return intent === 'still' ? 'still' : 'mp4'
}
