import { expect, it } from 'vitest'
import { selectionGeometry, usesGeometryDrivenSelectionFrame } from './selectionGeometry'
import { newTextLayer, newRectLayer } from '@/lib/defaults'
import { newStructuredGridMesh2DLayer } from '@/lib/registry/definitions/mesh2d/Mesh2DDefinition'
import { measureTextLayout } from '@/lib/text/measureText'

it('projects live text layout and sized geometry without altering authored bounds or pivot', () => {
  const text = newTextLayer(), original = JSON.stringify(text)
  const frame = new Map<string, number | boolean>([['layers.' + text.id + '.text.uppercase', true], ['layers.' + text.id + '.text.fontSize', 40]])
  const visual = selectionGeometry(text, frame, [])
  expect(visual.size).toEqual(measureTextLayout({ ...text.text!, fontSize: 40, uppercase: true }))
  expect(visual.transform).toBe(text.transform); expect(JSON.stringify(text)).toBe(original)
  expect(selectionGeometry(text, new Map(), [])).toBe(text)
  const rect = newRectLayer()
  expect(selectionGeometry(rect, new Map([['layers.' + rect.id + '.size.width', 100]]), []).size?.width).toBe(100)
  expect(rect.size?.width).toBe(160)
})

it('uses actual vector and Mesh2D bounds instead of a retained size box', () => {
  expect(usesGeometryDrivenSelectionFrame(newStructuredGridMesh2DLayer())).toBe(true)
  expect(usesGeometryDrivenSelectionFrame({ ...newRectLayer(), type: 'group' })).toBe(true)
  expect(usesGeometryDrivenSelectionFrame(newRectLayer())).toBe(false)
  expect(usesGeometryDrivenSelectionFrame(null)).toBe(false)
})
