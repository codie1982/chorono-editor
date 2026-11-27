import { describe, expect, it } from 'vitest'
import { preferredRenderBackend, renderArtifact, toChoronoRenderIntent } from './RenderBackendSelection'

describe('render backend selection', () => {
  it('prefers an available Chorono Render service and otherwise falls back', () => {
    expect(preferredRenderBackend(true)).toBe('chorono')
    expect(preferredRenderBackend(false)).toBe('builtin')
  })

  it('reports the actual artifact supported by each backend', () => {
    expect(renderArtifact('chorono', 'video')).toBe('mp4')
    expect(renderArtifact('builtin', 'video')).toBe('png-sequence')
    expect(renderArtifact('builtin', 'still')).toBe('png')
  })

  it('maps neutral video intent onto the Chorono bridge contract', () => {
    expect(toChoronoRenderIntent('still')).toBe('still')
    expect(toChoronoRenderIntent('video')).toBe('mp4')
  })
})
