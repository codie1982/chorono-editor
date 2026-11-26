import { describe, expect, it } from 'vitest'
import type { FractureRegionRingGeometry } from '@/lib/types/fracture'
import { FractureSharedBoundaryAnalyzer } from '../FractureSharedBoundaryAnalyzer'

describe('FractureSharedBoundaryAnalyzer', () => {
  it('returns a length-weighted midpoint and oriented unit normal', () => {
    const analyzer = new FractureSharedBoundaryAnalyzer()
    const metrics = analyzer.analyze(
      [ring([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }])],
      [ring([{ x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 5 }])],
      { x: 5, y: 5 },
      { x: 15, y: 5 },
    )

    expect(metrics).toEqual({
      lengthPx: 10,
      midpointPx: { x: 10, y: 5 },
      normalFromLeftToRight: { x: 1, y: 0 },
    })
  })

  it('ignores point-only contact', () => {
    const metrics = new FractureSharedBoundaryAnalyzer().analyze(
      [ring([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }])],
      [ring([{ x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }])],
      { x: 3, y: 3 },
      { x: 17, y: 3 },
    )
    expect(metrics).toBeNull()
  })
})

function ring(points: FractureRegionRingGeometry['points']): FractureRegionRingGeometry {
  return { points, signedDoubleArea: 1, parentIndex: null, depth: 0, role: 'outer' }
}
