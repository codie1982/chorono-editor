import { describe, expect, it, vi } from 'vitest'
import { emptyScene, newRectLayer } from '../../defaults'
import { makeAddLayerCmd } from '../commands-layer'
import { availableShapeTemplate, placeShapeInGesture } from './index'

/** A process-counter factory independent of imported project IDs. */
function counterFactory() {
  const style = newRectLayer()
  let counter = 0
  return () => ({ ...style, id: `rect_${++counter}`, name: `Rect ${counter}` })
}

describe('native shape template allocation against loaded source', () => {
  it('preserves a free factory candidate and never calls its next factory', () => {
    const template = newRectLayer(), factory = vi.fn()
    expect(availableShapeTemplate(template, factory, [{ id: 'unrelated' }])).toBe(template)
    expect(factory).not.toHaveBeenCalled()
  })

  it('repeats drawing across saved counter IDs without duplicates or source changes', () => {
    const create = counterFactory(), loadedIds = [2, 3, 4, 5, 6, 9, 10, 11]
    const loadedLayers = loadedIds.map(value => ({ ...newRectLayer(), id: `rect_${value}`, name: `Loaded ${value}` }))
    const original = { ...emptyScene(), layers: loadedLayers }, snapshot = structuredClone(original)
    let scene = original, template = availableShapeTemplate(create(), create, scene.layers)
    const createdIds: string[] = [], before: typeof scene[] = []
    for (let occurrence = 0; occurrence < 5; occurrence++) {
      const layer = placeShapeInGesture(template, { x: occurrence * 20, y: 10 }, { x: occurrence * 20 + 15, y: 30 })
      before.push(scene)
      scene = makeAddLayerCmd(layer).execute(scene)
      createdIds.push(layer.id)
      template = availableShapeTemplate(create(), create, scene.layers)
      expect(scene.layers.some(item => item.id === template.id)).toBe(false)
    }
    expect(createdIds).toEqual(['rect_1', 'rect_7', 'rect_8', 'rect_12', 'rect_13'])
    expect(template.id).toBe('rect_14'); expect(template.name).toBe('Rect 14')
    expect(new Set(scene.layers.map(layer => layer.id)).size).toBe(scene.layers.length)
    expect(scene.layers.slice(0, loadedLayers.length)).toEqual(snapshot.layers)
    expect(original).toEqual(snapshot)
    expect(before.map(value => value.layers.length)).toEqual([8, 9, 10, 11, 12])
  })

  it('skips a colliding first selection as well as repeated allocations', () => {
    const create = counterFactory(), loaded = [{ id: 'rect_1' }, { id: 'rect_2' }]
    const template = availableShapeTemplate(create(), create, loaded)
    expect(template.id).toBe('rect_3'); expect(template.name).toBe('Rect 3')
  })

  it('rejects a repeating or incompatible factory instead of looping or returning a duplicate', () => {
    const template = { ...newRectLayer(), id: 'occupied' }
    expect(() => availableShapeTemplate(template, () => template, [{ id: 'occupied' }])).toThrow(/occupied layer ID|unused layer ID/)
    expect(() => availableShapeTemplate(template, () => ({ ...template, type: 'group' }), [{ id: 'occupied' }])).toThrow(/unsupported/)
  })
})
