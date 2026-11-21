import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { FractureRenderColliderReport } from '@/lib/fracture/FractureRenderColliderAnalyzer'
import FractureTopologyColliderCard from './FractureTopologyColliderCard'

describe('FractureTopologyColliderCard', () => {
  it('writes topology and collider state without relying on colour', () => {
    const html = renderToStaticMarkup(createElement(FractureTopologyColliderCard, { analysis: report('pass') }))
    expect(html).toContain('Topology &amp; collider')
    expect(html).toContain('Collider aligned')
    expect(html).toContain('1 source → 16 fragments')
    expect(html).toContain('0 px')
    expect(html).toContain('Exact event')
  })

  it('provides local recovery for warning and unavailable states', () => {
    const warning = renderToStaticMarkup(createElement(FractureTopologyColliderCard, { analysis: report('warning') }))
    expect(warning).toContain('Review collider')
    expect(warning).toContain('Re-bake before export')

    const unavailable = renderToStaticMarkup(createElement(FractureTopologyColliderCard, {
      analysis: { status: 'unavailable', reason: 'Generated output is missing.' },
    }))
    expect(unavailable).toContain('Unavailable')
    expect(unavailable).toContain('Restore the generated layers or Re-bake')
  })
})

function report(status: 'pass' | 'warning'): FractureRenderColliderReport {
  return {
    status,
    recordId: 'fracture-v1',
    generationId: 'generation-v1',
    phase: 'fragments',
    eventTimeMs: 800,
    eventTick: 96,
    atEvent: true,
    renderPolygonCount: 16,
    colliderPolygonCount: 16,
    maxBoundaryDeltaPx: status === 'pass' ? 0 : 2.5,
    meanBoundaryDeltaPx: status === 'pass' ? 0 : .25,
    sampleCount: 100,
    deltaLines: [],
  }
}
