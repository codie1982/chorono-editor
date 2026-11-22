import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { emptyScene, newRectLayer, newSplineLayerFromData } from '@/lib/defaults'
import { newStructuredGridMesh2DLayer } from '@/lib/registry/definitions/mesh2d/Mesh2DDefinition'
import { createRectangleSpline } from '@/lib/spline/primitives/createRectangleSpline'
import type { Layer } from '@/lib/types'
import SplineModelingPanel from '@/components/panels/SplineModelingPanel'
import GeometryEditPanel, { type GeometryEditPanelProps } from './GeometryEditPanel'

/** Provides actual scene data and spies for the editor command boundary. */
function panelProps(layer: Layer | null): GeometryEditPanelProps {
  const scene = { ...emptyScene(), layers: layer ? [layer] : [] }
  return {
    layer, selectedPointId: null, getScene: () => scene, getRevision: () => 0,
    getDocumentSignal: () => new AbortController().signal, isTransactionActive: () => false,
    dispatchCommand: vi.fn(), onSelectLayer: vi.fn(), onClearPoint: vi.fn(), onLayerChange: vi.fn(),
  }
}

describe('Geometry Edit dock', () => {
  it('excludes basic shapes and empty selection', () => {
    for (const layer of [null, newRectLayer()]) {
      const props = panelProps(layer)
      const html = renderToStaticMarkup(<GeometryEditPanel {...props} splineSourceSettings={<p>Point inspector</p>} />)
      expect(html).toContain('Select a spline or Mesh2D')
      expect(html).not.toMatch(/Point inspector|Modeling operations|Mesh settings/)
    }
  })

  it('shows the spline operation list above the supplied source inspector', () => {
    const layer = newSplineLayerFromData(createRectangleSpline({ width: 80, height: 50 }))
    const props = panelProps(layer)
    const html = renderToStaticMarkup(<GeometryEditPanel {...props} splineSourceSettings={<p>Point inspector</p>} />)
    expect(html).toMatch(/aria-pressed="true"[^>]*>Source/)
    expect(html).toMatch(/Modeling operations.*Offset.*Outline.*Chamfer.*Fillet.*Point inspector/)
    expect(html).not.toContain('Spline modeling amount')
    expect(props.dispatchCommand).not.toHaveBeenCalled()
  })

  it('puts structured-grid geometry in Source and keeps other mesh settings selectable', () => {
    const props = panelProps(newStructuredGridMesh2DLayer())
    const html = renderToStaticMarkup(<GeometryEditPanel {...props} />)
    expect(html).toMatch(/Mesh settings[\s\S]*Texture[\s\S]*Deformation Clip[\s\S]*Pins[\s\S]*Quad Diagonal/)
    expect(html).not.toMatch(/Deformation clip asset|Pin selection presets|Modeling operations/)
    expect(props.onLayerChange).not.toHaveBeenCalled()
  })

  it.each([
    ['offset', 'Apply creates a separate spline layer.', 'Distance'],
    ['fillet', 'Apply updates the source contour.', 'Radius'],
  ] as const)('shows only the selected %s operation and describes its Apply behavior', (operation, consequence, amountLabel) => {
    const layer = newSplineLayerFromData(createRectangleSpline({ width: 80, height: 50 }))
    const props = panelProps(layer)
    const html = renderToStaticMarkup(<SplineModelingPanel {...props} operation={operation} />)
    expect(html).toContain(consequence)
    expect(html).toContain(`${amountLabel} (local px)`)
    expect(html).not.toContain('Spline modeling operation')
    expect(props.dispatchCommand).not.toHaveBeenCalled()
  })
})
