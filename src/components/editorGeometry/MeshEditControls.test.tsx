import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import GeometryEditPanel, { type GeometryEditPanelProps } from './GeometryEditPanel'
import { emptyScene } from '@/lib/defaults'
import { newStructuredGridMesh2DLayer } from '@/lib/registry/definitions/mesh2d/Mesh2DDefinition'

/** Real Mesh panel contracts with no source writes during display/mode choice. */
function props(active: boolean): GeometryEditPanelProps {
  const layer = newStructuredGridMesh2DLayer(), scene = { ...emptyScene(), layers: [layer] }
  return { layer, selectedPointId: null, getScene: () => scene, getRevision: () => 0,
    getDocumentSignal: () => new AbortController().signal, isTransactionActive: () => false,
    dispatchCommand: vi.fn(), onSelectLayer: vi.fn(), onClearPoint: vi.fn(), onLayerChange: vi.fn(),
    editMode: { active, mode: 'face', enter: vi.fn(), exit: vi.fn() } }
}

describe('Mesh Vertex / Edge / Face panel', () => {
  it.each([false, true])('shows the three editing levels beside the persistent stack (active=%s)', active => {
    const input = props(active), html = renderToStaticMarkup(<GeometryEditPanel {...input} />)
    for (const mode of ['point', 'edge', 'face']) expect(html).toContain(`aria-label="Mesh ${mode} mode"`)
    expect(html).not.toContain('aria-label="Mesh object mode"')
    expect(html).toContain('Add Mesh modifiers')
    expect(html).toContain('quads')
    expect(input.dispatchCommand).not.toHaveBeenCalled()
  })
})
