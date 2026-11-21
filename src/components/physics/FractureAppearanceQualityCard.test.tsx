import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { FractureAppearanceQualityAnalysis } from '@/lib/fracture/FractureAppearanceQualityAnalyzer'
import FractureAppearanceQualityCard from './FractureAppearanceQualityCard'

describe('FractureAppearanceQualityCard', () => {
  it('shows textual pass status, event geometry and both memory paths', () => {
    const html = renderToStaticMarkup(createElement(FractureAppearanceQualityCard, { analysis: report('pass') }))

    expect(html).toContain('Geometry aligned')
    expect(html).toContain('Exact event · 800 ms · Image mesh')
    expect(html).toContain('Maximum event gap')
    expect(html).toContain('0 B · mask-free')
    expect(html).toContain('5.5 MiB')
    expect(html).toContain('before physical separation')
  })

  it('adds an explicit recovery path for warnings and unavailable data', () => {
    const warning = renderToStaticMarkup(createElement(FractureAppearanceQualityCard, { analysis: report('warning') }))
    expect(warning).toContain('Review alignment')
    expect(warning).toContain('Re-bake before export')

    const unavailable = renderToStaticMarkup(createElement(FractureAppearanceQualityCard, {
      analysis: { status: 'unavailable', reason: 'The fracture source layer is missing.' },
    }))
    expect(unavailable).toContain('Unavailable')
    expect(unavailable).toContain('restore or relink it first')
  })
})

function report(status: 'pass' | 'warning'): FractureAppearanceQualityAnalysis {
  return {
    status,
    recordId: 'quality-bake',
    generationId: 'quality-generation',
    appearanceKind: 'image',
    eventTimeMs: 800,
    fragmentCount: 16,
    triangleCount: 50,
    sharedEdgeCount: 28,
    sharedBoundaryLengthPx: 421.25,
    maxEventAlignmentGapPx: status === 'pass' ? 0 : 0.25,
    meanEventAlignmentGapPx: status === 'pass' ? 0 : 0.02,
    eventAreaDeltaPercent: 0,
    maskedFragmentCount: 0,
    estimatedCurrentMaskScratchPeakBytes: 0,
    fullFrameMaskAlternativePeakBytes: 800 * 450 * 4 * 4,
  }
}
