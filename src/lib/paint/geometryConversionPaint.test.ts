import { describe, expect, it } from 'vitest'
import { geometryConversionPaint } from './geometryConversionPaint'
import { withFillType } from './paintSource'
import type { ShapeFill, ShapeStyle } from '../types/style'

describe('representation-entry paint', () => {
  it.each(['solid', 'gradient', 'image'] as const)('restores exact %s mode without guessing from inactive payloads', type => {
    const fill: ShapeFill = { type, color: '#123456', opacity: 63,
      gradient: { type: 'linear', stops: [{ offset: 0, color: '#123456' }, { offset: 1, color: '#fedcba' }] },
      image: { version: 1, assetId: 'paint-image', fit: 'contain' } }
    const source: ShapeStyle = { fill, stroke: { width: 0, color: '#ffffff' } }, saved = structuredClone(source)
    const spline = geometryConversionPaint(source, 'shape', 'spline')!
    expect(spline.fill).toEqual({ ...fill, type: 'none', disabledType: type })
    expect(spline.stroke).toMatchObject({ width: 2, color: '#123456', type: 'solid' })
    expect(geometryConversionPaint(spline, 'spline', 'mesh2d')!.fill).toEqual(fill)
    expect(source).toEqual(saved)
  })
  it('keeps visible authored stroke and restores disabled contours when required', () => {
    const style: ShapeStyle = { stroke: { type: 'gradient', color: '#654321', width: 4, opacity: 50 } }
    expect(geometryConversionPaint(style, 'shape', 'spline')!.stroke).toBe(style.stroke)
    const invisible = { stroke: { ...style.stroke!, type: 'none' as const, opacity: 0 } }
    expect(geometryConversionPaint(invisible, 'shape', 'spline')!.stroke).toMatchObject({ type: 'solid', width: 4, opacity: 100 })
  })
  it('creates a Mesh surface from stroke-only geometry and preserves later explicit None', () => {
    const spline: ShapeStyle = { stroke: { color: '#f97316', width: 3 } }
    const mesh = geometryConversionPaint(spline, 'spline', 'mesh2d')!
    expect(mesh.fill).toEqual({ type: 'solid', color: '#f97316' })
    const hidden = { ...mesh, fill: withFillType(mesh.fill, 'none') }
    expect(geometryConversionPaint(hidden, 'mesh2d', 'mesh2d')).toBe(hidden)
  })
  it('tracks newly chosen paint modes through None and removes the inactive marker on enable', () => {
    const solid = { type: 'solid' as const, color: '#abc123' }
    const none = withFillType(solid, 'none')
    expect(withFillType(none, 'none')).toEqual(none)
    expect(withFillType(none, 'solid')).toEqual(solid)
    const gradient = withFillType(none, 'gradient')
    expect(withFillType(gradient, 'none').disabledType).toBe('gradient')
  })
})
