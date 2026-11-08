import { describe, expect, it, vi } from 'vitest'
import { CanvasSurfaceScope, withCanvasSurfaceResult } from './CanvasSurfaceScope'
import { CanvasSurfacePool } from './CanvasSurfacePool'

/** Pixel-free provider; real canvas resets are exercised by pool/browser tests. */
function pool(maxBytes = 64) {
  return new CanvasSurfacePool({ maxBytes, maxIdleMs: 0,
    createCanvas: (width, height) => ({ width, height, getContext: () => ({}) }) as unknown as HTMLCanvasElement })
}

describe('CanvasSurfaceScope ownership', () => {
  it('does not release foreign inputs and disposes only its own leases idempotently', () => {
    const provider = pool(), parent = new CanvasSurfaceScope(provider), child = new CanvasSurfaceScope(provider)
    const a = parent.create(2, 2), b = child.create(2, 2)
    expect(a).not.toBe(b)
    child.release(a); child.dispose(); child.dispose()
    expect([a.width, b.width]).toEqual([2, 0])
    expect(parent.owns(a)).toBe(true)
    expect(child.owns(b)).toBe(false)
    expect(() => child.create(2, 2)).toThrow(/disposed/)
    parent.dispose()
    expect(provider.getSnapshot().activeSurfaces).toBe(0)
  })

  it('returns scratch immediately while keeping the result valid until its owner releases it', () => {
    const provider = pool(), scope = new CanvasSurfaceScope(provider)
    const result = withCanvasSurfaceResult(scope, local => {
      local.create(2, 2); return local.create(2, 2)
    })
    expect(result.width).toBe(2)
    expect(provider.getSnapshot()).toMatchObject({ activeSurfaces: 1, activeBytes: 16 })
    scope.dispose()
    expect(result.width).toBe(0)
  })

  it.each(['draw', 'admission'])('cleans partially created outputs on %s failure', stage => {
    const provider = pool(16), scope = new CanvasSurfaceScope(provider)
    expect(() => withCanvasSurfaceResult(scope, local => {
      const output = local.create(2, 2)
      if (stage === 'admission') local.create(2, 2)
      else throw new Error('draw failed')
      return output
    })).toThrow()
    expect(provider.getSnapshot().activeBytes).toBe(0)
    scope.dispose()
  })

  it('returns legacy results without disposing the borrowed input or result', () => {
    const input = { width: 2, height: 2 } as HTMLCanvasElement
    expect(withCanvasSurfaceResult(undefined, () => input)).toBe(input)
    let temporary: HTMLCanvasElement
    const output = withCanvasSurfaceResult(undefined, local => {
      temporary = local.create(2, 2)
      return local.create(2, 2)
    })
    expect([input.width, output.width, temporary!.width]).toEqual([2, 2, 0])
    output.width = output.height = 0
  })

  it('attempts all releases even if a provider cleanup throws', () => {
    const releases: ReturnType<typeof vi.fn>[] = []
    const scope = new CanvasSurfaceScope({ acquire(width, height) {
      const release = vi.fn(() => { if (releases[0] === release) throw new Error('release failed') })
      releases.push(release)
      return { canvas: { width, height } as HTMLCanvasElement, context: {} as CanvasRenderingContext2D, release }
    } })
    scope.create(2, 2); scope.create(2, 2)
    expect(() => scope.dispose()).toThrow('release failed')
    expect(releases.map(release => release.mock.calls.length)).toEqual([1, 1])
    scope.dispose()
  })
})
