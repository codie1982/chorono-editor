import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { newRectLayer, newSplineLayerFromData } from '@/lib/defaults'
import { newShapeBoundaryMesh2DLayer, newSplineBoundaryMesh2DLayer, newStructuredGridMesh2DLayer } from '@/lib/registry/definitions/mesh2d/Mesh2DDefinition'
import { selectMesh2DPinPreset, setMesh2DDeformation, setMesh2DTexture } from '@/lib/mesh2d'
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

  it('uses the same source status contract for parametric shapes', () => {
    const source = newRectLayer()
    source.name = 'Parametric Source'
    const layer = newShapeBoundaryMesh2DLayer(source)
    const html = renderToStaticMarkup(
      <Mesh2DSourcePanel layer={layer} allLayers={[source, layer]} onLayerChange={() => undefined} />,
    )

    expect(html).toContain('Shape Source')
    expect(html).toContain('Parametric Source')
    expect(html).toContain('Source up to date')
  })

  it('shows texture and topology-bound pin status for a structured grid', () => {
    const layer = setMesh2DDeformation(
      selectMesh2DPinPreset(setMesh2DTexture(newStructuredGridMesh2DLayer(), 'fabric'), 'corners'),
      'clip',
    )
    const html = renderToStaticMarkup(
      <Mesh2DSourcePanel layer={layer} allLayers={[layer]}
        allAssets={[
          { id: 'fabric', name: 'Fabric.png', type: 'image', url: 'blob:fabric' },
          { id: 'clip', name: 'Flag Motion', type: 'meshDeformation', url: 'blob:clip' },
        ]}
        onLayerChange={() => undefined} />,
    )
    expect(html).toContain('Mesh Appearance')
    expect(html).toContain('Texture linked: Fabric.png')
    expect(html).toContain('Texture fit')
    expect(html).toContain('Fit X')
    expect(html).toContain('Offset X')
    expect(html).toContain('Reset texture placement')
    expect(html).toContain('Texture tool (T)')
    expect(html).toContain('4 selected')
    expect(html).toContain('Pin selection presets')
    expect(html).toContain('Clip linked: Flag Motion')
    expect(html).toContain('Topology is validated during decode')
  })

  it('identifies bake-owned fracture meshes and explains edited-output ownership', () => {
    const source = { ...newRectLayer(), id: 'poster-source', name: 'Poster Source' }
    const base = newStructuredGridMesh2DLayer()
    const layer = {
      ...base,
      id: 'poster-fragment-0',
      mesh2d: {
        ...base.mesh2d!,
        source: {
          kind: 'fractureFragment' as const,
          sourceLayerId: source.id,
          generationId: 'poster-generation',
          fragmentId: 'poster-fragment-0',
          sourceAppearanceHash: '1234567890abcdef',
          generatorVersion: 1 as const,
        },
        appearance: { schemaVersion: 1 as const, kind: 'texture' as const, textureAssetId: 'poster', sampling: 'linear' as const },
      },
    }
    const html = renderToStaticMarkup(
      <Mesh2DSourcePanel layer={layer} allLayers={[source, layer]}
        allAssets={[{ id: 'poster', name: 'Poster.png', type: 'image', url: 'embedded:poster' }]}
        onLayerChange={() => undefined} />,
    )

    expect(html).toContain('Fracture Fragment')
    expect(html).toContain('Poster Source')
    expect(html).toContain('poster-generation')
    expect(html).toContain('source-rectangle UVs preserved')
    expect(html).toContain('mark this generated output as edited')
  })
})
