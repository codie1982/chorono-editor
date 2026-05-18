import { describe, it, expect } from 'vitest'
import { resolveInstanceLayer, isInstanceLayer } from '../InstanceResolver'
import { cloneSingleLayer } from '../CloneSingleLayer'
import type { Layer } from '../../types'

function makeRect(
  id: string,
  overrides: Partial<Layer> = {},
): Layer {
  return {
    id,
    name: id,
    type: 'shape',
    shape: 'rect',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 },
    opacity: 1,
    size: { width: 50, height: 30 },
    style: { fill: { type: 'solid', color: '#f00' } } as any,
    ...overrides,
  }
}

describe('resolveInstanceLayer', () => {
  it('returns the layer unchanged when not an instance', () => {
    const src = makeRect('rect')
    const out = resolveInstanceLayer(src, [src])
    expect(out).toBe(src)
  })

  it('returns null when source is missing', () => {
    const ghost = makeRect('ghost', { instanceOf: 'gone' })
    expect(resolveInstanceLayer(ghost, [ghost])).toBeNull()
  })

  it('composes source visual fields onto instance transform', () => {
    const source = makeRect('src', { size: { width: 100, height: 60 } })
    const instance = makeRect('inst', {
      instanceOf: 'src',
      transform: { x: 200, y: 300, scaleX: 2, scaleY: 1, rotationDeg: 45, anchorX: 0, anchorY: 0 },
      size: undefined,
      style: undefined,
    })
    const out = resolveInstanceLayer(instance, [source, instance])
    expect(out).not.toBeNull()
    // Visual fields from source
    expect(out!.size).toEqual({ width: 100, height: 60 })
    // Transform / opacity / id from instance
    expect(out!.id).toBe('inst')
    expect(out!.transform.x).toBe(200)
    expect(out!.transform.rotationDeg).toBe(45)
  })

  it('keeps the instance id (not source id) so hit-test maps back to it', () => {
    const source = makeRect('src')
    const instance = makeRect('inst', { instanceOf: 'src', size: undefined })
    const out = resolveInstanceLayer(instance, [source, instance])
    expect(out?.id).toBe('inst')
  })

  it('inherits the source type (text source → text resolved)', () => {
    const source: Layer = {
      id: 'txt',
      name: 'Text',
      type: 'text',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 },
      opacity: 1,
      text: { content: 'Hi' } as any,
    }
    const instance = makeRect('inst', { instanceOf: 'txt', size: undefined, style: undefined })
    const out = resolveInstanceLayer(instance, [source, instance])
    expect(out?.type).toBe('text')
    expect(out?.text).toEqual({ content: 'Hi' })
  })

  it('handles transitive instances (1 hop chain)', () => {
    const base = makeRect('a', { size: { width: 80, height: 80 } })
    const mid  = makeRect('b', { instanceOf: 'a', size: undefined, style: undefined })
    const tip  = makeRect('c', { instanceOf: 'b', size: undefined, style: undefined })
    const out  = resolveInstanceLayer(tip, [base, mid, tip])
    expect(out?.size).toEqual({ width: 80, height: 80 })
    expect(out?.id).toBe('c')
  })

  it('bails on deep cycles (returns null)', () => {
    const a = makeRect('a', { instanceOf: 'b', size: undefined })
    const b = makeRect('b', { instanceOf: 'a', size: undefined })
    expect(resolveInstanceLayer(a, [a, b])).toBeNull()
  })

  it('isInstanceLayer predicate matches the instanceOf field', () => {
    expect(isInstanceLayer(makeRect('a'))).toBe(false)
    expect(isInstanceLayer(makeRect('a', { instanceOf: 'b' }))).toBe(true)
  })
})

describe('CloneSingleLayer + instance mode', () => {
  it('strips visual fields and sets instanceOf when mode=instance', () => {
    const source = makeRect('src')
    const { clonedLayer, metadata } = cloneSingleLayer(source, { mode: 'instance' })
    expect(clonedLayer.instanceOf).toBe(source.id)
    expect(clonedLayer.size).toBeUndefined()
    expect(clonedLayer.shape).toBeUndefined()
    expect(clonedLayer.style).toBeUndefined()
    expect(metadata.mode).toBe('instance')
  })

  it('instance keeps its OWN transform / opacity / id / name', () => {
    const source = makeRect('src', { opacity: 0.7 })
    const { clonedLayer } = cloneSingleLayer(source, { mode: 'instance', offsetX: 30 })
    expect(clonedLayer.id).not.toBe(source.id)
    expect(clonedLayer.opacity).toBe(0.7) // inherited at clone time, but EDITABLE
    expect(clonedLayer.transform.x).toBe(30) // offset applied
  })

  it('end-to-end: editing source resolves new visuals through the instance', () => {
    const source = makeRect('src', { size: { width: 40, height: 40 } })
    const { clonedLayer } = cloneSingleLayer(source, { mode: 'instance' })
    const all = [source, clonedLayer]

    const beforeEdit = resolveInstanceLayer(clonedLayer, all)
    expect(beforeEdit?.size).toEqual({ width: 40, height: 40 })

    // Simulate source mutation (e.g. user dragged the resize handle).
    const editedSource = { ...source, size: { width: 200, height: 200 } }
    const afterEdit = resolveInstanceLayer(clonedLayer, [editedSource, clonedLayer])
    expect(afterEdit?.size).toEqual({ width: 200, height: 200 })
  })
})
