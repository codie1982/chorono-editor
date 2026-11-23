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
  it('keeps an empty selection out of point editing', () => {
    for (const layer of [null]) {
      const props = panelProps(layer)
      const html = renderToStaticMarkup(<GeometryEditPanel {...props} splineSourceSettings={<p>Point inspector</p>} />)
      expect(html).toContain('Select a Spline or 2D Mesh')
      expect(html).not.toMatch(/Point inspector|Modeling operations|Mesh settings/)
    }
  })

  it('keeps Convert out of the Edit dock and guides Basic Shapes to Properties', () => {
    const html = renderToStaticMarkup(<GeometryEditPanel {...panelProps(newRectLayer())} />)
    expect(html).toContain('parameters are in Properties')
    expect(html).not.toMatch(/Convert Spline|Convert 2D Mesh|Add Spline modifiers/)
  })

  it('puts native spline settings before its modern stack and closed source history', () => {
    const layer = newSplineLayerFromData(createRectangleSpline({ width: 80, height: 50 }))
    const props = panelProps(layer)
    const html = renderToStaticMarkup(<GeometryEditPanel {...props} splineSourceSettings={<p>Point inspector</p>} />)
    expect(html).toMatch(/Point inspector[\s\S]*Add Spline modifiers[\s\S]*Source \/ History/)
    expect(html).not.toMatch(/<details[^>]*open/)
    expect(html).not.toMatch(/Create Mesh2D from closed spline|Mesh modifiers|>Source<|Spline modeling amount/)
    expect(props.dispatchCommand).not.toHaveBeenCalled()
  })

  it('puts structured-grid geometry in Source and keeps other mesh settings selectable', () => {
    const props = panelProps(newStructuredGridMesh2DLayer())
    const html = renderToStaticMarkup(<GeometryEditPanel {...props} />)
    expect(html).toMatch(/Mesh modifiers[\s\S]*Add Mesh modifiers[\s\S]*Texture[\s\S]*Pins[\s\S]*Quad Diagonal/)
    expect(html).not.toMatch(/Deformation clip asset|Pin selection presets|Modeling operations/)
    expect(props.onLayerChange).not.toHaveBeenCalled()
  })

  it.each([
    [newSplineLayerFromData(createRectangleSpline({ width: 80, height: 50 })), 'Spline'],
    [newStructuredGridMesh2DLayer(), 'Mesh'],
  ] as const)('exposes modifiers outside Edit while hiding native source tools (%s)', (layer, kind) => {
    const props = panelProps(layer)
    const html = renderToStaticMarkup(<GeometryEditPanel {...props}
      editMode={{ active: false, mode: 'object', enter: vi.fn(), exit: vi.fn() }}
      splineModeControls={<p>Native mode controls</p>} splineSourceSettings={<p>Native source inspector</p>} splineToolPreview={<p>Native preview</p>} />)
    expect(html).toContain(`Add ${kind} modifiers`)
    expect(html).not.toMatch(/Enter edit mode|Exit edit mode/)
    expect(html).not.toMatch(/Native mode controls|Native source inspector|Native preview|Mesh selection mode|Mesh settings|Quad Diagonal/)
    expect(props.dispatchCommand).not.toHaveBeenCalled()
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
