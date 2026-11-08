import { describe, expect, it } from 'vitest'
import { emptyScene, newTextLayer } from '@/lib/defaults'
import type { AnimatableValue, ChronoScene, Layer } from '@/lib/types'
import { materializeRenderScene } from './materializeOverrides'

/** Dense authored layers exercise prefix/suffix identity at realistic scale. */
function sceneWithLayers(): ChronoScene {
  const template = newTextLayer()
  return { ...emptyScene(), layers: Array.from({ length: 3000 }, (_,i) => ({
    ...template, id: `layer-${i}`, name: `Layer ${i}`,
  })) }
}

describe('render scene projection identity and ordering', () => {
  it('returns the authored snapshot for empty, unchanged and rejected overrides', () => {
    const scene = sceneWithLayers()
    for (const overrides of [new Map(), new Map<string, AnimatableValue>([
      ['layers.layer-1500.opacity', scene.layers[1500].opacity],
      ['layers.layer-0.transform.x', 'invalid'],
      ['layers.layer-2999.id', 'replacement'],
      ['layers.absent.opacity', 0.4],
    ])]) {
      expect(materializeRenderScene(scene, overrides)).toBe(scene)
    }
  })

  it.each([0,1500,2999])('preserves stacking order and untouched identities when layer %i changes', position => {
    const scene = sceneWithLayers(), original = structuredClone(scene)
    const frame = materializeRenderScene(scene, new Map([[`layers.layer-${position}.opacity`, 0.25]]))
    expect(frame).not.toBe(scene)
    expect(frame.layers).not.toBe(scene.layers)
    expect(frame.layers.map(layer => layer.id)).toEqual(scene.layers.map(layer => layer.id))
    frame.layers.forEach((layer,i) => {
      if (i === position) {
        expect(layer.opacity).toBe(0.25)
        expect(layer.transform).toBe(scene.layers[i].transform)
        expect(layer.text).toBe(scene.layers[i].text)
      } else expect(layer).toBe(scene.layers[i])
    })
    expect(scene).toEqual(original)
  })

  it.each([0,1500,2999])('omits an unresolved instance at %i without dropping its neighbours', position => {
    const scene = sceneWithLayers()
    scene.layers[position] = { ...scene.layers[position], instanceOf: 'missing' }
    const original = scene.layers.slice()
    const frame = materializeRenderScene(scene, new Map())
    expect(frame.layers).toHaveLength(2999)
    expect(frame.layers).toEqual(original.filter((_,i) => i !== position))
    frame.layers.forEach((layer,i) => expect(layer).toBe(original[i < position ? i : i+1]))
    expect(scene.layers).toEqual(original)
  })

  it('does not retain a previous frame after in-place edits by an external caller', () => {
    const scene = sceneWithLayers(), first = scene.layers[0]
    const frame = materializeRenderScene(scene, new Map([['layers.layer-1500.opacity', 0.25]]))
    const replacement: Layer = { ...first, opacity: 0.8 }
    scene.layers.splice(0,1)
    scene.layers.push(replacement)
    const next = materializeRenderScene(scene, new Map())
    expect(next).toBe(scene)
    expect(next.layers.at(-1)).toBe(replacement)
    expect(frame.layers[0]).toBe(first)
    expect(frame.layers[1500].opacity).toBe(0.25)
    expect(next.layers[1499].opacity).toBe(scene.layers[1499].opacity)
  })
})
