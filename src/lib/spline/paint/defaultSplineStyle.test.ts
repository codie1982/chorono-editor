import { describe, expect, it } from 'vitest'
import { newSplineLayerFromPrimitive, newSplineLayerFromData, emptyScene } from '../../defaults'
import { createRectangleSpline } from '../primitives/createRectangleSpline'
import { withFillType } from '../../paint/paintSource'
import { makeUpdateLayerCmd } from '../../editor/commands-layer'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'

describe('new Spline paint defaults', () => {
  it.each([
    ['circle', { radius: 20 }], ['rectangle', { width: 100, height: 60 }],
    ['donut', { outerRadius: 40, innerRadius: 20 }], ['line', { x1: 0, y1: 0, x2: 40, y2: 20 }],
  ] as const)('creates %s without fill and with a visible contour', (kind, params) => {
    const layer = newSplineLayerFromPrimitive(kind, params)!
    expect(layer.style?.fill?.type).toBe('none')
    expect(layer.style?.stroke).toMatchObject({ type: 'solid', width: 3 })
  })
  it('keeps closed-data defaults independent, and permits explicit Fill with native Undo/save', () => {
    const data = createRectangleSpline({ width: 100, height: 60 })
    const a = newSplineLayerFromData(data), b = newSplineLayerFromData(data)
    expect(a.style?.fill?.type).toBe('none'); expect(b.style).not.toBe(a.style)
    const before = { ...emptyScene(), layers: [a] }
    const command = makeUpdateLayerCmd(a.id, { style: { ...a.style, fill: withFillType(a.style?.fill, 'solid') } }, a)
    const filled = command.execute(before)
    expect(filled.layers[0].style?.fill?.type).toBe('solid')
    expect(parseSceneJson(JSON.stringify(filled), true).layers[0].style).toEqual(filled.layers[0].style)
    expect(command.undo(filled)).toEqual(before)
    expect(b.style?.fill?.type).toBe('none')
  })
})
