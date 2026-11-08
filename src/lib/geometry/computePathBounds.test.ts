import { expect, it } from 'vitest'
import { computePathBounds } from './computePathBounds'
import { Matrix2D } from './Matrix2D'
import { M, C, Q } from './PathCommand'

it('keeps tight editable bounds by default and offers a conservative control hull for culling', () => {
  const path = { commands: [M(0, 0), C(0, 100, 100, 100, 100, 0)], closed: false }
  expect(computePathBounds(path)).toEqual({ x: 0, y: 0, width: 100, height: 75 })
  expect(computePathBounds(path, undefined, 'control-hull')).toEqual({ x: 0, y: 0, width: 100, height: 100 })
  expect(computePathBounds(path, undefined, 'tight')).toEqual(computePathBounds(path))
})

it('encloses tight cubic and quadratic bounds after rotation, reflection and nonuniform scaling', () => {
  const path = { commands: [M(-10, 20), C(130, -200, -80, 310, 40, 20), Q(300, -100, 0, 0)], closed: false }
  for (const matrix of [Matrix2D.identity(), Matrix2D.rotation(37).scale(-2, 0.3).translate(20, -10)]) {
    const exact = computePathBounds(path, matrix), hull = computePathBounds(path, matrix, 'control-hull')
    expect(hull.x).toBeLessThanOrEqual(exact.x)
    expect(hull.y).toBeLessThanOrEqual(exact.y)
    expect(hull.x + hull.width + 1e-10).toBeGreaterThanOrEqual(exact.x + exact.width)
    expect(hull.y + hull.height + 1e-10).toBeGreaterThanOrEqual(exact.y + exact.height)
  }
})
