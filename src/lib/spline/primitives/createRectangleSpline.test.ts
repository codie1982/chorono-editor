import { describe, expect, it } from 'vitest'
import { createRectangleSpline } from './createRectangleSpline'
import { splineToPathDefinition } from '../splineToPath'

describe('rounded rectangle spline', () => {
  it('has four straight sides and four tangent quarter-circle corners', () => {
    const data = createRectangleSpline({ width: 200, height: 120, cornerRadius: 20, cornerMode: 'rounded' })
    const contour = Object.values(data.contours)[0]
    const segments = contour.segmentIds.map(id => data.segments[id])
    expect(segments.map(s => s.type)).toEqual(['line', 'cubic', 'line', 'cubic', 'line', 'cubic', 'line', 'cubic'])
    expect(Object.values(data.handles)).toHaveLength(8)

    const path = splineToPathDefinition(data)
    const curves = path.commands.filter(c => c.type === 'C')
    expect(curves).toHaveLength(4)
    // Each curved segment stays in its corner box and starts/ends tangent to
    // the adjoining sides, including the previously broken closing corner.
    const k = 20 * 0.5522847498307936
    expect(curves).toEqual([
      { type: 'C', x1: 80 + k, y1: -60, x2: 100, y2: -40 - k, x: 100, y: -40 },
      { type: 'C', x1: 100, y1: 40 + k, x2: 80 + k, y2: 60, x: 80, y: 60 },
      { type: 'C', x1: -80 - k, y1: 60, x2: -100, y2: 40 + k, x: -100, y: 40 },
      { type: 'C', x1: -100, y1: -40 - k, x2: -80 - k, y2: -60, x: -80, y: -60 },
    ])
  })
})
