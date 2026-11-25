import { describe, expect, it } from 'vitest'
import { modelDefaults, validateModel } from '../source/modelDefaults'
import { cameraScreenAxes, panCamera, rollCamera, zoomCamera } from './cameraNavigation'
import type { ModelViewCamera } from './types'

const camera = (): ModelViewCamera => ({ ...modelDefaults().camera, projection: 'perspective', orthoHeight: 2.8 })

describe('desktop 3D camera navigation', () => {
  it('pans along the rolled camera screen axes in either projection', () => {
    for (const projection of ['perspective', 'orthographic'] as const) {
      const start = { ...camera(), yaw: 0, pitch: 0, roll: 90, projection }
      expect(cameraScreenAxes(start).right.y).toBeCloseTo(1)
      const moved = panCamera(start, 10, 0, 400)
      expect(moved.targetY).toBeLessThan(0)
      expect(moved.targetX).toBeCloseTo(0)
      expect(start.targetY).toBe(0)
    }
  })

  it('bounds pinch/wheel zoom and normalizes clockwise roll without changing source', () => {
    const start = camera(), before = structuredClone(start)
    expect(zoomCamera(start, 2)).toMatchObject({ distance: 1.75, orthoHeight: 1.4 })
    expect(zoomCamera(start, 1e20).distance).toBe(.1)
    expect(zoomCamera(start, 1e-20).distance).toBe(1000)
    expect(rollCamera({ ...start, roll: 90 }, 135).roll).toBe(-135)
    expect(start).toEqual(before)
    expect(() => validateModel({ ...modelDefaults(), camera: { ...modelDefaults().camera, roll: 180 } })).not.toThrow()
    expect(() => validateModel({ ...modelDefaults(), camera: { ...modelDefaults().camera, roll: 181 } })).toThrow()
  })
})
