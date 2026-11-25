import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { RigidBodyBakeReport } from '@/lib/bake'
import { BakeReportMetrics } from './BakeReportMetrics'

describe('BakeReportMetrics', () => {
  it('discloses simplification, protected events, error and retained memory', () => {
    const report: RigidBodyBakeReport = {
      tickCount: 120,
      sampleCount: 31,
      bodyCount: 2,
      dynamicBodyCount: 1,
      rawKeyframeCount: 276,
      keyframeCount: 69,
      protectedEventCount: 2,
      clusterCount: 1,
      bondCount: 7,
      bondBreakCount: 2,
      clusterSplitCount: 1,
      forcedBreakActionCount: 1,
      damageResetActionCount: 1,
      maxVertexErrorPx: .42,
      maxAngleErrorDeg: .2,
      clipBytes: 1024,
      estimatedTrackBytes: 2048,
      retainedBytes: 3072,
      solver: 'matter-js@0.20.0',
      execution: 'worker',
      recipeHash: 'recipe',
    }

    const html = renderToStaticMarkup(createElement(BakeReportMetrics, { report }))

    expect(html).toContain('Keys retained / candidate')
    expect(html).toContain('69 / 276')
    expect(html).toContain('Protected events')
    expect(html).toContain('7 bonds · 2 breaks')
    expect(html).toContain('Component splits')
    expect(html).toContain('1 forced · 1 resets')
    expect(html).toContain('0.42 px · 0.2°')
    expect(html).toContain('3.0 KiB')
  })
})
