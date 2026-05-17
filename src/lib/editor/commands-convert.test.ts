import { describe, it, expect } from 'vitest'
import { makeConvertToSplineCmd } from './commands-convert'
import type { ChronoScene, Layer } from '../types'

// Minimal scene shell — only the layers slot matters here.
function sceneOf(layer: Layer): ChronoScene {
  return {
    formatVersion: '1.0.0',
    composition: { id: 'c', width: 800, height: 600, durationMs: 1000, frameRate: 60, backgroundColor: '#000' },
    assets: [], layers: [layer], timelines: [],
    parameters: [], triggers: [], bindings: [],
    initialState: {},
  } as any
}

// Reusable factory — a shape layer with everything an author might set.
function fancyRect(): Layer {
  return {
    id:    'r1',
    name:  'Card',
    type:  'shape',
    shape: 'rect',
    transform: { x: 100, y: 50, scaleX: 1.5, scaleY: 1, rotationDeg: 30, anchorX: 60, anchorY: 40 },
    opacity: 0.8,
    blendMode: 'multiply',
    size: { width: 120, height: 80 },
    style: {
      fill:   { type: 'solid', color: '#3B82F6', opacity: 90 },
      stroke: { color: '#fff', width: 2 },
      cornerRadius: 12,
    },
    effects: { blur: 4 },
    locked: false,
    hidden: false,
    colorLabel: 'blue',
    startMs: 0, endMs: 2000,
  } as any
}

describe('makeConvertToSplineCmd', () => {
  it('converts a rect shape layer to a path layer', () => {
    const layer = fancyRect()
    const cmd = makeConvertToSplineCmd(layer)
    const next = cmd.execute(sceneOf(layer))
    const out = next.layers[0]!
    expect(out.type).toBe('path')
    expect(out.path).toBeDefined()
    expect(out.path!.anchors.length).toBeGreaterThan(0)
    expect(out.path!.closed).toBe(true)
  })

  it('preserves transform exactly (no float drift)', () => {
    const layer = fancyRect()
    const next  = makeConvertToSplineCmd(layer).execute(sceneOf(layer))
    expect(next.layers[0].transform).toEqual(layer.transform)
  })

  it('preserves style (except cornerRadius — baked into geometry)', () => {
    const layer = fancyRect()
    const out   = makeConvertToSplineCmd(layer).execute(sceneOf(layer)).layers[0]
    expect(out.style?.fill).toEqual(layer.style!.fill)
    expect(out.style?.stroke).toEqual(layer.style!.stroke)
    // cornerRadius MUST be cleared — otherwise the path renderer would round
    // the bounding box again on top of already-rounded vertices.
    expect(out.style?.cornerRadius).toBeUndefined()
  })

  it('preserves opacity, blendMode, effects, label, timing, name', () => {
    const layer = fancyRect()
    const out   = makeConvertToSplineCmd(layer).execute(sceneOf(layer)).layers[0]
    expect(out.opacity).toBe(0.8)
    expect(out.blendMode).toBe('multiply')
    expect(out.effects).toEqual(layer.effects)
    expect(out.colorLabel).toBe('blue')
    expect(out.startMs).toBe(0)
    expect(out.endMs).toBe(2000)
    expect(out.name).toBe('Card')
    expect(out.id).toBe('r1')
  })

  it('strips shape-only fields on the converted layer', () => {
    const layer = fancyRect()
    const out   = makeConvertToSplineCmd(layer).execute(sceneOf(layer)).layers[0]
    expect(out.shape).toBeUndefined()
    expect(out.shapeKind).toBeUndefined()
    expect(out.shapeParams).toBeUndefined()
  })

  it('round-trips via undo — execute then undo restores the exact original', () => {
    const layer = fancyRect()
    const cmd   = makeConvertToSplineCmd(layer)
    const scene = sceneOf(layer)
    const after = cmd.execute(scene)
    const back  = cmd.undo(after)
    // Identity-preserving undo: same object reference, not a deep copy.
    expect(back.layers[0]).toBe(layer)
  })

  it('handles a star shape (curved + rounded primitive)', () => {
    const star: Layer = {
      id: 's1', name: 'Star', type: 'shape',
      shapeKind: 'star',
      shapeParams: { kind: 'star', sides: 5, innerRadius: 30, outerRadius: 60 },
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 60, anchorY: 60 },
      opacity: 1,
      size: { width: 120, height: 120 },
      style: { fill: { type: 'solid', color: '#fff' } },
    } as any
    const out = makeConvertToSplineCmd(star).execute(sceneOf(star)).layers[0]
    expect(out.type).toBe('path')
    expect(out.path!.anchors.length).toBeGreaterThanOrEqual(10)  // 5 outer + 5 inner
    expect(out.path!.closed).toBe(true)
  })

  it('throws for non-shape layers (group / text / image)', () => {
    const text: Layer = { id: 't', name: 'T', type: 'text', transform: { x:0, y:0, scaleX:1, scaleY:1, rotationDeg:0, anchorX:0, anchorY:0 }, opacity: 1, text: { value: 'hi' } } as any
    expect(() => makeConvertToSplineCmd(text)).toThrow()
  })
})
