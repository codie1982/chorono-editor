import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { newSplineLayerFromData } from '@/lib/defaults'
import { newSplineBoundaryMesh2DLayer } from '@/lib/registry/definitions/mesh2d/Mesh2DDefinition'
import { createRectangleSpline } from '@/lib/spline/primitives/createRectangleSpline'
import Mesh2DSourcePanel from './Mesh2DSourcePanel'

describe('Mesh2DSourcePanel', () => {
  it('shows the linked source and current status with a visible tolerance label', () => {
    const source = newSplineLayerFromData(createRectangleSpline({ width: 80, height: 50 }), { name: 'Source Badge' })
    const layer = newSplineBoundaryMesh2DLayer(source)
    const html = renderToStaticMarkup(
      <Mesh2DSourcePanel layer={layer} allLayers={[source, layer]} onLayerChange={() => undefined} />,
    )

    expect(html).toContain('Source Badge')
    expect(html).toContain('Source up to date')
    expect(html).toContain('Flatten tolerance (local px)')
    expect(html).toContain('Mesh2D is up to date')
  })

  it('shows an inline missing-source alert and disables regeneration', () => {
    const source = newSplineLayerFromData(createRectangleSpline({ width: 80, height: 50 }))
    const layer = newSplineBoundaryMesh2DLayer(source)
    const html = renderToStaticMarkup(
      <Mesh2DSourcePanel layer={layer} allLayers={[layer]} onLayerChange={() => undefined} />,
    )

    expect(html).toContain('role="alert"')
    expect(html).toContain('Source missing')
    expect(html).toContain('disabled=""')
  })
})
