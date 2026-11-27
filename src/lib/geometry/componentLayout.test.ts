import { describe, it, expect } from 'vitest'
import { componentLayout } from './componentLayout'
import { Matrix2D } from './Matrix2D'
describe('component alignment and distribution', () => {
  const points = new Map([
    ['a', { x: 0, y: 0 }],
    ['b', { x: 2, y: 5 }],
    ['c', { x: 10, y: 15 }],
  ])
  it('uses the chosen frame while preserving the two outer centers', () => {
    const groups = [['a'], ['b'], ['c']]
    expect(componentLayout(groups, points, Matrix2D.identity(), 'distributeX').get('b')).toEqual({ x: 3, y: 0 })
    const moved = componentLayout(groups, points, Matrix2D.rotation(90), 'distributeX').get('b')!
    expect(moved.y).toBeCloseTo(2.5)
    expect(moved.x).toBeCloseTo(0)
  })
  it('rejects conflicting displacements at shared endpoints', () => {
    expect(() =>
      componentLayout(
        [
          ['a', 'b'],
          ['b', 'c'],
        ],
        points,
        Matrix2D.identity(),
        'alignX',
      ),
    ).toThrow(/Shared/)
  })
})
