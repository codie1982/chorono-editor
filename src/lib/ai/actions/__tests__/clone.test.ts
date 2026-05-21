// ── Clone & Array AI action tests ─────────────────────────────────────────────
import { describe, it, expect, beforeEach } from 'vitest'
import { ActionRegistry } from '../../ActionRegistry'
import { registerCloneActions } from '../clone'
import { emptyScene } from '@/lib/defaults'
import type { ChronoScene, Layer } from '@/lib/types'

function run(reg: ActionRegistry, scene: ChronoScene, tool: string, params: Record<string, unknown>): ChronoScene {
  const def = reg.get(tool)!
  const cmd = def.toCommand!(params, scene)!
  if (cmd.label.startsWith('AI ERROR')) throw new Error(cmd.label)
  return cmd.execute(scene)
}

function shape(id: string): Layer {
  return {
    id, name: id, type: 'shape', shapeKind: 'rect',
    transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 50, anchorY: 50 },
    opacity: 1, size: { width: 100, height: 100 },
    style: { fill: { type: 'solid', color: '#3B82F6' } },
  } as Layer
}

describe('AI clone & array actions', () => {
  let reg: ActionRegistry
  let scene: ChronoScene
  beforeEach(() => {
    reg = new ActionRegistry()
    registerCloneActions(reg)
    scene = emptyScene()
    scene.layers = [shape('box')]
  })

  it('clone_layer adds N copies', () => {
    const next = run(reg, scene, 'clone_layer', { layerId: 'box', count: 3 })
    expect(next.layers).toHaveLength(4) // source + 3 copies
  })

  it('clone_layer instance mode tags instanceOf', () => {
    const next = run(reg, scene, 'clone_layer', { layerId: 'box', count: 1, mode: 'instance' })
    const clone = next.layers.find((l) => l.id !== 'box')!
    expect(clone.instanceOf).toBe('box')
  })

  it('array_layer linear creates a row', () => {
    const next = run(reg, scene, 'array_layer', { layerId: 'box', pattern: 'linear', count: 5, moveX: 120 })
    expect(next.layers.length).toBe(5) // include-source: source + 4 new
  })

  it('array_layer radial distributes around a circle', () => {
    const next = run(reg, scene, 'array_layer', { layerId: 'box', pattern: 'radial', count: 8, radius: 150 })
    expect(next.layers.length).toBe(8)
  })

  it('array_layer grid creates columns×rows', () => {
    const next = run(reg, scene, 'array_layer', { layerId: 'box', pattern: 'grid', columns: 3, rows: 2 })
    expect(next.layers.length).toBe(6)
  })

  it('errors on missing source layer', () => {
    expect(() => run(reg, scene, 'clone_layer', { layerId: 'ghost' })).toThrow(/not found/)
  })

  it('errors on path pattern without pathLayerId', () => {
    expect(() => run(reg, scene, 'array_layer', { layerId: 'box', pattern: 'path' })).toThrow(/requires pathLayerId/)
  })
})
