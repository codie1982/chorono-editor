import { describe, expect, it, vi } from 'vitest'
import { WebGLDrawProbe } from './WebGLDrawProbe'

/** Deterministic async-query host; unavailable query results must never be read synchronously. */
function host() {
  let available = false, disjoint = false
  const ext = { TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2 }
  const gl = { QUERY_RESULT_AVAILABLE: 3, QUERY_RESULT: 4,
    getExtension: () => ext, createQuery: vi.fn(() => ({})), beginQuery: vi.fn(), endQuery: vi.fn(), deleteQuery: vi.fn(),
    getParameter: () => disjoint,
    getQueryParameter: vi.fn((_query: unknown, key: number) => key === 3 ? available : 2_500_000),
  }
  return { gl, probe: new WebGLDrawProbe(gl as unknown as WebGL2RenderingContext),
    ready: () => { available = true }, disjoint: () => { disjoint = true } }
}

describe('optional asynchronous WebGL draw timing', () => {
  it('keeps queries disabled without an observer, bounds pending work, and deletes on pause', () => {
    const { gl, probe } = host()
    expect(probe.begin()).toBeNull()
    probe.setSampling(true)
    for (let i = 0; i < 20; i++) { const q = probe.begin(); probe.end(q) }
    expect(gl.createQuery).toHaveBeenCalledTimes(3)
    probe.getSnapshot()
    expect(gl.getQueryParameter.mock.calls.every(([, key]) => key === 3)).toBe(true)
    probe.setSampling(false)
    expect(gl.deleteQuery).toHaveBeenCalledTimes(3)
  })
  it('converts only valid GPU ns to ms and discards disjoint/context-loss timing', () => {
    const { probe, ready, disjoint, gl } = host()
    probe.setSampling(true)
    const q = probe.begin(); probe.end(q); probe.recordDraw(25)
    expect(probe.getSnapshot()).toMatchObject({ gpuMs: null, drawCalls: 1, lastInstances: 25 })
    ready()
    expect(probe.getSnapshot().gpuMs).toBe(2.5)
    const next = probe.begin(); probe.end(next)
    disjoint()
    expect(probe.getSnapshot().gpuMs).toBeNull()
    expect(gl.deleteQuery).toHaveBeenCalledTimes(2)
    probe.invalidate()
    expect(probe.getSnapshot().gpuSampleAt).toBeNull()
  })
  it('retains workload counts with unsupported timing instead of inventing GPU duration', () => {
    const probe = new WebGLDrawProbe(null)
    probe.setSampling(true); probe.recordDraw(7)
    expect(probe.begin()).toBeNull()
    expect(probe.getSnapshot()).toMatchObject({ timerSupported: false, gpuMs: null, lastInstances: 7 })
  })
})
