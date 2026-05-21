// ── Spline AI action tests ────────────────────────────────────────────────────
import { describe, it, expect, beforeEach } from 'vitest'
import { ActionRegistry } from '../../ActionRegistry'
import { registerSplineActions } from '../spline'
import { emptyScene } from '@/lib/defaults'
import type { ChronoScene } from '@/lib/types'

function run(reg: ActionRegistry, scene: ChronoScene, params: Record<string, unknown>): ChronoScene {
  const cmd = reg.get('add_spline')!.toCommand!(params, scene)!
  if (cmd.label.startsWith('AI ERROR')) throw new Error(cmd.label)
  return cmd.execute(scene)
}

describe('AI add_spline', () => {
  let reg: ActionRegistry
  beforeEach(() => {
    reg = new ActionRegistry()
    registerSplineActions(reg)
  })

  it('creates a star spline with editable point model', () => {
    const next = run(reg, emptyScene(), { id: 's1', kind: 'star', points: 5, outerRadius: 80, innerRadius: 30 })
    const layer = next.layers[0]
    expect(layer.type).toBe('spline')
    expect(layer.spline).toBeDefined()
    expect(Object.keys(layer.spline!.points).length).toBeGreaterThan(0)
  })

  it('creates a circle spline at a given position', () => {
    const next = run(reg, emptyScene(), { id: 'c1', kind: 'circle', radius: 60, x: 200, y: 150 })
    const layer = next.layers[0]
    expect(layer.type).toBe('spline')
    expect(layer.transform.x).toBe(200)
    expect(layer.transform.y).toBe(150)
  })

  it('creates an ngon with the requested side count', () => {
    const next = run(reg, emptyScene(), { id: 'hex', kind: 'ngon', sides: 6, radius: 50 })
    const layer = next.layers[0]
    // hexagon → 6 on-curve points
    expect(Object.keys(layer.spline!.points).length).toBe(6)
  })

  it('applies fill color override', () => {
    const next = run(reg, emptyScene(), { id: 'c2', kind: 'circle', radius: 40, fillColor: '#FF0000' })
    expect(next.layers[0].style?.fill?.color).toBe('#FF0000')
  })

  it('rejects a duplicate id', () => {
    let scene = run(reg, emptyScene(), { id: 'dup', kind: 'circle' })
    expect(() => run(reg, scene, { id: 'dup', kind: 'circle' })).toThrow(/already exists/)
  })
})
