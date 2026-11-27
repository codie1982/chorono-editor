import { describe, expect, it, vi } from 'vitest'
import { emptyScene, newSplineLayerFromData } from '@/lib/defaults'
import { createRectangleSpline } from '@/lib/spline'
import { geometryModifierRegistry } from '@/lib/modifiers'
import { splineEditTools, splinePointTypes } from './splineEditTools'
const preview = (reason?: string) => ({ active: false, disabled: false, eligible: !reason, selectionReason: reason, open: vi.fn() })
function fixture() {
  const layer = newSplineLayerFromData(createRectangleSpline({ width: 80, height: 50 }))
  return { layer, scene: { ...emptyScene(), layers: [layer] }, controllers: { chamfer: preview(), fillet: preview(), offset: preview() }, active: true }
}
describe('shared spline tool menu/panel policy', () => {
  it('offers mode-specific native actions, with one opening callback and no source write', () => {
    const f = fixture(), saved = structuredClone(f.scene), onOpen = vi.fn()
    const point = splineEditTools({ ...f, mode: 'point', onOpen })
    expect(point.map(tool => tool.id)).toEqual(['chamfer', 'fillet'])
    point[0].run(); expect(f.controllers.chamfer.open).toHaveBeenCalledOnce(); expect(onOpen).toHaveBeenCalledOnce()
    expect(splineEditTools({ ...f, mode: 'edge' }).map(tool => tool.id)).toEqual(['offset'])
    expect(splineEditTools({ ...f, mode: 'object' }).map(tool => tool.id)).toEqual(['offset'])
    expect(f.scene).toEqual(saved)
  })
  it('keeps unsuitable selections disabled with their reason and refuses source/gesture ownership conflicts', () => {
    const f = fixture(); f.controllers.offset = preview('Select every edge of the contour.')
    const partial = splineEditTools({ ...f, mode: 'edge' })[0]
    expect(partial.disabled).toBe(true); expect(partial.reason).toContain('every edge')
    partial.run(); expect(f.controllers.offset.open).not.toHaveBeenCalled()
    f.layer.locked = true
    expect(splineEditTools({ ...f, mode: 'point' }).every(tool => tool.disabled && tool.reason?.includes('unlock'))).toBe(true)
    f.layer.locked = false; f.controllers.fillet.active = true
    expect(splineEditTools({ ...f, mode: 'point' }).map(tool => tool.disabled)).toEqual([true, false])
    expect(splineEditTools({ ...f, mode: 'point', busy: true }).every(tool => tool.disabled)).toBe(true)
  })
  it('keeps native point enum meanings and old modifier registrations without offering new UI instances', () => {
    expect(splinePointTypes.map(type => type.value)).toEqual(['corner', 'smooth', 'bezier', 'bezierCorner'])
    for (const id of ['offset', 'outline', 'chamfer', 'fillet']) {
      const definition = geometryModifierRegistry.get(id)
      expect(definition.descriptor.legacySplineTool).toBe(true)
      expect(definition.descriptor.addable).toBe(true)
    }
    expect(geometryModifierRegistry.get('meshSmooth').descriptor.legacySplineTool).toBeUndefined()
  })
})
