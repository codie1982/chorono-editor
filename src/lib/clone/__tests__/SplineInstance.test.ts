import { describe, expect, it } from 'vitest'
import { newSplineLayerFromPrimitive } from '@/lib/defaults'
import { moveSplineHandle, moveSplinePoint } from '@/lib/spline/edit/mutations'
import { cloneSingleLayer } from '../CloneSingleLayer'
import { resolveInstanceLayer } from '../InstanceResolver'

describe('live spline instances', () => {
  it('follows source point and control edits while keeping its own transform', () => {
    const source = newSplineLayerFromPrimitive('circle', { radius: 40 })!
    const { clonedLayer: instance } = cloneSingleLayer(source, {
      mode: 'instance', offsetX: 120, offsetY: -30,
    })
    instance.transform = { ...instance.transform, rotationDeg: 45, scaleX: 2, scaleY: 0.5 }
    instance.opacity = 0.6
    expect(instance.spline).toBeUndefined()
    expect(resolveInstanceLayer(instance, [source, instance])!.spline).toBe(source.spline)

    const point = Object.values(source.spline!.points)[0]
    const handle = Object.values(source.spline!.handles).find(h => h.pointId === point.id && h.kind === 'out')!
    const movedPoint = moveSplinePoint(source.spline!, point.id, point.x + 12, point.y - 8)
    const editedSpline = moveSplineHandle(movedPoint, point.id, 'out', handle.x + 25, handle.y + 5)
    const editedSource = { ...source, spline: editedSpline }
    const resolved = resolveInstanceLayer(instance, [editedSource, instance])!

    expect(resolved.spline).toBe(editedSpline)
    expect(resolved.spline!.points[point.id]).toMatchObject({ x: point.x + 12, y: point.y - 8 })
    expect(resolved.spline!.handles[handle.id]).toMatchObject({ x: handle.x + 25, y: handle.y + 5 })
    expect(resolved.id).toBe(instance.id)
    expect(resolved.transform).toBe(instance.transform)
    expect(resolved.opacity).toBe(0.6)
    expect(source.spline!.points[point.id]).toEqual(point)
    expect(instance.spline).toBeUndefined()
  })
})
