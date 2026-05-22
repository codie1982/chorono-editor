import { describe, it, expect, vi } from 'vitest'
import { ChronoPlayer } from './ChronoPlayer'
import { evaluateTimelines } from '@/lib/evaluator'
import type { ChronoScene, Layer } from '@/lib/types'

// ── Scene helpers ──────────────────────────────────────────────────────────────
function layer(partial: Partial<Layer>): Layer {
  return {
    id: 'l1', name: 'Layer', type: 'shape',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 },
    opacity: 1,
    ...partial,
  } as Layer
}
function kf(timeMs: number, value: number) {
  return { id: `k${timeMs}`, timeMs, value, easing: { type: 'linear' } }
}
function track(target: string, keyframes: ReturnType<typeof kf>[]) {
  return { target, keyframes }
}
function timeline(tracks: ReturnType<typeof track>[], durationMs = 1000) {
  return { id: 'tl', durationMs, tracks }
}
function scene(opts: { layers?: Layer[]; timelines?: unknown[]; parameters?: unknown[]; triggers?: unknown[] } = {}): ChronoScene {
  return {
    formatVersion: '1.0.0',
    composition: { id: 'test', width: 100, height: 100, durationMs: 1000, frameRate: 60, backgroundColor: '#000' },
    assets: [],
    layers: opts.layers ?? [],
    timelines: opts.timelines ?? [],
    parameters: opts.parameters ?? [],
    triggers: opts.triggers ?? [],
    bindings: [],
    initialState: {},
  } as unknown as ChronoScene
}

describe('ChronoPlayer — timeline evaluation parity', () => {
  it('evaluates tracks identically to evaluateTimelines (shared engine)', () => {
    const tl = timeline([track('layers.l1.opacity', [kf(0, 1), kf(1000, 0)])])
    const s = scene({ layers: [layer({ id: 'l1' })], timelines: [tl] })
    const player = new ChronoPlayer(s)

    for (const t of [0, 250, 500, 1000]) {
      const fromPlayer = player.tick(t).overrides.get('layers.l1.opacity')
      const fromEngine = evaluateTimelines(s.timelines, t).get('layers.l1.opacity')
      expect(fromPlayer).toBeCloseTo(fromEngine as number, 6)
    }
  })

  it('reports interpolated endpoints', () => {
    const tl = timeline([track('layers.l1.opacity', [kf(0, 1), kf(1000, 0)])])
    const player = new ChronoPlayer(scene({ layers: [layer({ id: 'l1' })], timelines: [tl] }))
    expect(player.tick(0).overrides.get('layers.l1.opacity')).toBe(1)
    expect(player.tick(1000).overrides.get('layers.l1.opacity')).toBe(0)
  })
})

describe('ChronoPlayer — playback control', () => {
  it('seek updates currentTimeMs', () => {
    const player = new ChronoPlayer(scene())
    player.seek(500)
    expect(player.currentTimeMs).toBe(500)
  })

  it('starts not playing', () => {
    expect(new ChronoPlayer(scene()).isPlaying).toBe(false)
  })
})

describe('ChronoPlayer — events (on / onAny / fireEvent)', () => {
  it('delivers fired events to onAny listeners on the next tick', () => {
    const player = new ChronoPlayer(scene())
    const seen = vi.fn()
    player.onAny(seen)
    player.fireEvent({ type: 'customEvent', refId: 'ping' })
    player.tick(0)
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ type: 'customEvent', refId: 'ping' }))
  })

  it('filters by event type with on(type, cb)', () => {
    const player = new ChronoPlayer(scene())
    const onCustom = vi.fn()
    const onClick = vi.fn()
    player.on('customEvent', onCustom)
    player.on('click', onClick)
    player.fireEvent({ type: 'customEvent', refId: 'x' })
    player.tick(0)
    expect(onCustom).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('unsubscribe stops delivery', () => {
    const player = new ChronoPlayer(scene())
    const cb = vi.fn()
    const off = player.onAny(cb)
    off()
    player.fireEvent({ type: 'customEvent', refId: 'x' })
    player.tick(0)
    expect(cb).not.toHaveBeenCalled()
  })
})

describe('ChronoPlayer — state machines', () => {
  it('builds a runtime per state-machine definition', () => {
    const machine = {
      id: 'sm1', name: 'Btn', initialStateId: 'idle',
      states: [
        { id: 'idle', name: 'idle', timelineId: 'tlA', x: 0, y: 0 },
        { id: 'hover', name: 'hover', timelineId: 'tlB', x: 0, y: 0 },
      ],
      transitions: [{ id: 't1', from: 'idle', to: 'hover', trigger: 'hover' }],
    }
    const s = scene({ timelines: [timeline([], 1000)] })
    ;(s as unknown as { stateMachines: unknown[] }).stateMachines = [machine]
    const player = new ChronoPlayer(s)
    expect(player.smRuntimes.size).toBe(1)
    expect(player.smRuntimes.has('sm1')).toBe(true)
  })

  it('is inert (no SM runtimes) when the scene has none', () => {
    expect(new ChronoPlayer(scene()).smRuntimes.size).toBe(0)
  })
})

describe('ChronoPlayer — render adapter', () => {
  it('forwards the evaluated frame to the adapter', () => {
    const tl = timeline([track('layers.l1.opacity', [kf(0, 1), kf(1000, 0)])])
    const s = scene({ layers: [layer({ id: 'l1' })], timelines: [tl] })
    const render = vi.fn()
    const player = new ChronoPlayer(s, { render })
    player.tick(500)
    expect(render).toHaveBeenCalledWith(expect.objectContaining({
      scene: s,
      timeMs: 500,
    }))
  })

  it('does not throw without an adapter', () => {
    const player = new ChronoPlayer(scene())
    expect(() => player.tick(0)).not.toThrow()
  })
})
