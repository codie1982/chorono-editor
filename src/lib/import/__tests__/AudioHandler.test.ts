import { afterEach, describe, expect, it, vi } from 'vitest'
import { AudioHandler } from '../handlers/asset/AudioHandler'
import { releaseImportSources } from '../resources/importSources'

function mockAudio(duration: number, mode: 'metadata' | 'error' | 'hang' = 'metadata') {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:audio')
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.stubGlobal('document', { createElement: () => {
    const audio = { duration, preload: '', onloadedmetadata: null as null | (() => void), onerror: null as null | (() => void),
      removeAttribute: vi.fn(), load: vi.fn(), set src(_value: string) {
        queueMicrotask(() => { if (mode === 'metadata') audio.onloadedmetadata?.(); else if (mode === 'error') audio.onerror?.() })
      } }
    return audio
  } })
  return revoke
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('AudioHandler metadata', () => {
  it('preserves a legitimate 50ms sound effect and names the clip after its source', async () => {
    const revoke = mockAudio(0.05)
    const result = await new AudioHandler().handle(new File(['sound'], 'Click.wav', { type: 'audio/wav' }))
    expect(result.assets[0].durationMs).toBe(50)
    expect(result.layers[0]).toMatchObject({ name: 'Click.wav', endMs: 50 })
    expect(result.warnings).toEqual([])
    expect(revoke).toHaveBeenCalled()
    releaseImportSources(result)
  })

  it('reports unknown duration rather than silently claiming a fully probed import', async () => {
    mockAudio(NaN, 'error')
    const result = await new AudioHandler().handle(new File(['sound'], 'Broken.mp3', { type: 'audio/mpeg' }))
    expect(result.assets[0].durationMs).toBeUndefined()
    expect(result.warnings[0]).toMatchObject({ severity: 'warning', code: 'parse_error' })
    releaseImportSources(result)
  })

  it('times out an unresponsive metadata probe and releases the temporary URL', async () => {
    vi.useFakeTimers()
    const revoke = mockAudio(Infinity, 'hang')
    const pending = new AudioHandler().preflight(new File(['sound'], 'Stalled.mp3', { type: 'audio/mpeg' }))
    await vi.advanceTimersByTimeAsync(10000)
    const result = await pending
    expect(result.warnings).toHaveLength(1)
    expect(revoke).toHaveBeenCalledWith('blob:audio')
  })
})
