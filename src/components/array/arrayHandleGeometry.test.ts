import { describe, expect, it } from 'vitest'
import { Matrix2D } from '@/lib/geometry/Matrix2D'
import { defaultLinearArraySettings, defaultGridArraySettings, defaultRadialArraySettings } from '@/lib/array/ArrayTypes'
import { arrayHandlePoints, arraySettingsFromHandle } from './arrayHandleGeometry'

const spaceToWorld = Matrix2D.translation(300, 140).rotate(37).scale(-2, 0.7)
const reference = { pivotWorld: { x: 80, y: 240 }, spaceToWorld, worldToSpace: spaceToWorld.invert() }

describe('Array viewport handle coordinate adapter', () => {
  it('round trips a vector through a translated/reflected/nonuniform frame without treating it as a point', () => {
    const source = { ...defaultLinearArraySettings(), move: { x: 32, y: -14 }, transformMode: 'total' as const }
    const handle = arrayHandlePoints(source, reference)[0]
    const changed = arraySettingsFromHandle(source, reference, handle.kind, handle.world)
    expect(changed.pattern).toBe('linear')
    if (changed.pattern !== 'linear') throw new Error('Wrong pattern')
    expect(changed.move.x).toBeCloseTo(32); expect(changed.move.y).toBeCloseTo(-14)
    expect(changed.count).toBe(source.count); expect(changed.transformMode).toBe('total')
    expect(source.move).toEqual({ x: 32, y: -14 })
  })

  it('edits grid column spacing without moving row spacing or source settings', () => {
    const source = defaultGridArraySettings(), worldVector = spaceToWorld.applyToVector({ x: 20, y: 60 })
    const changed = arraySettingsFromHandle(source, reference, 'column',
      { x: reference.pivotWorld.x + worldVector.x, y: reference.pivotWorld.y + worldVector.y })
    if (changed.pattern !== 'grid') throw new Error('Wrong pattern')
    expect(changed.columnMove.x).toBeCloseTo(20); expect(changed.columnMove.y).toBeCloseTo(60)
    expect(changed.rowMove).toBe(source.rowMove); expect(source.columnMove).toEqual({ x: 100, y: 0 })
  })

  it('maps a radial center as an absolute selected-space point', () => {
    const source = { ...defaultRadialArraySettings(), center: { x: 12, y: 25 } }
    const handle = arrayHandlePoints(source, reference)[0]
    expect(handle.world).toEqual(spaceToWorld.applyToPoint(source.center))
    const changed = arraySettingsFromHandle(source, reference, 'center', spaceToWorld.applyToPoint({ x: -30, y: 70 }))
    if (changed.pattern !== 'radial') throw new Error('Wrong pattern')
    expect(changed.center.x).toBeCloseTo(-30); expect(changed.center.y).toBeCloseTo(70)
    expect(changed.radius).toBe(source.radius)
  })

  it('refuses nonfinite movement instead of corrupting the numeric draft', () => {
    expect(() => arraySettingsFromHandle(defaultLinearArraySettings(), reference, 'step', { x: Infinity, y: 0 })).toThrow('finite')
  })
})
