import { describe, it, expect } from 'vitest'
import { resolveCloneAlignSpecs, defaultCloneAlignOptions } from '../CloneAlign'
import type { Layer } from '../../types'

function makeLayer(id: string, x: number, y: number, opts: Partial<Layer> = {}): Layer {
  return {
    id,
    name: id,
    type: 'shape',
    shape: 'rect',
    transform: { x, y, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 },
    opacity: 1,
    ...opts,
  }
}

describe('resolveCloneAlignSpecs', () => {
  it('produces one spec per target with target position', () => {
    const src = makeLayer('src', 0, 0)
    const t1 = makeLayer('t1', 100, 50)
    const t2 = makeLayer('t2', 200, 150)
    const specs = resolveCloneAlignSpecs(src, [t1, t2], defaultCloneAlignOptions())
    expect(specs).toHaveLength(2)
    expect(specs[0].position).toEqual({ x: 100, y: 50 })
    expect(specs[1].position).toEqual({ x: 200, y: 150 })
  })

  it('skips a target that IS the source layer', () => {
    const src = makeLayer('src', 0, 0)
    const t = makeLayer('t', 50, 50)
    const specs = resolveCloneAlignSpecs(src, [src, t], defaultCloneAlignOptions())
    expect(specs).toHaveLength(1)
    expect(specs[0].target.id).toBe('t')
  })

  it('matchRotation/matchScale copy target transform when enabled', () => {
    const src = makeLayer('src', 0, 0)
    const t = makeLayer('t', 100, 0, {
      transform: { x: 100, y: 0, scaleX: 2, scaleY: 3, rotationDeg: 45, anchorX: 0, anchorY: 0 },
    })
    const options = {
      ...defaultCloneAlignOptions(),
      matchRotation: true,
      matchScale: true,
    }
    const [spec] = resolveCloneAlignSpecs(src, [t], options)
    expect(spec.rotation).toBe(45)
    expect(spec.scaleX).toBe(2)
    expect(spec.scaleY).toBe(3)
  })

  it('offsetX / offsetY shifts the aligned position', () => {
    const src = makeLayer('src', 0, 0)
    const t = makeLayer('t', 100, 100)
    const options = { ...defaultCloneAlignOptions(), offsetX: 5, offsetY: -5 }
    const [spec] = resolveCloneAlignSpecs(src, [t], options)
    expect(spec.position).toEqual({ x: 105, y: 95 })
  })

  it('alignPosition=false keeps source position (offset only)', () => {
    const src = makeLayer('src', 10, 20)
    const t = makeLayer('t', 1000, 1000)
    const options = { ...defaultCloneAlignOptions(), alignPosition: false }
    const [spec] = resolveCloneAlignSpecs(src, [t], options)
    expect(spec.position).toEqual({ x: 10, y: 20 })
  })
})
