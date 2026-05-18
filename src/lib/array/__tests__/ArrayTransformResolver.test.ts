import { describe, it, expect } from 'vitest'
import {
  resolveArrayTransforms,
  countArrayInstances,
  countNewClones,
} from '../ArrayTransformResolver'
import {
  defaultLinearArraySettings,
  defaultGridArraySettings,
  defaultRadialArraySettings,
} from '../ArrayTypes'
import type {
  LinearArraySettings,
  GridArraySettings,
  RadialArraySettings,
} from '../ArrayTypes'
import type { Layer } from '../../types'

function makeRect(x: number = 0, y: number = 0): Layer {
  return {
    id: 'rect_1',
    name: 'Rect',
    type: 'shape',
    shape: 'rect',
    transform: { x, y, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 },
    opacity: 1,
  }
}

// ── Linear ───────────────────────────────────────────────────────────────────

describe('Linear array', () => {
  it('produces N transforms with incremental step', () => {
    const settings: LinearArraySettings = {
      ...defaultLinearArraySettings(),
      count: 5,
      move: { x: 50, y: 0 },
      transformMode: 'incremental',
    }
    const out = resolveArrayTransforms(makeRect(0, 0), settings)
    expect(out.map((t) => t.position.x)).toEqual([0, 50, 100, 150, 200])
    expect(out.map((t) => t.position.y)).toEqual([0, 0, 0, 0, 0])
  })

  it('total mode distributes across (count-1) gaps', () => {
    const settings: LinearArraySettings = {
      ...defaultLinearArraySettings(),
      count: 5,
      move: { x: 200, y: 0 },
      transformMode: 'total',
    }
    const out = resolveArrayTransforms(makeRect(0, 0), settings)
    expect(out.map((t) => t.position.x)).toEqual([0, 50, 100, 150, 200])
  })

  it('marks index 0 as source when sourcePolicy=include-source', () => {
    const settings: LinearArraySettings = {
      ...defaultLinearArraySettings(),
      count: 3,
      sourcePolicy: 'include-source',
    }
    const out = resolveArrayTransforms(makeRect(), settings)
    expect(out[0].isSourceIndex).toBe(true)
    expect(out[1].isSourceIndex).toBe(false)
    expect(out[2].isSourceIndex).toBe(false)
  })

  it('does NOT mark source when sourcePolicy=clone-source-too', () => {
    const settings: LinearArraySettings = {
      ...defaultLinearArraySettings(),
      count: 3,
      sourcePolicy: 'clone-source-too',
    }
    const out = resolveArrayTransforms(makeRect(), settings)
    for (const t of out) expect(t.isSourceIndex).toBe(false)
  })

  it('applies incremental rotation', () => {
    const settings: LinearArraySettings = {
      ...defaultLinearArraySettings(),
      count: 4,
      rotationDeg: 15,
      transformMode: 'incremental',
    }
    const out = resolveArrayTransforms(makeRect(), settings)
    expect(out.map((t) => t.rotation)).toEqual([0, 15, 30, 45])
  })

  it('applies multiplicative scale step (incremental)', () => {
    const settings: LinearArraySettings = {
      ...defaultLinearArraySettings(),
      count: 4,
      scale: { x: 0.9, y: 0.9 },
      transformMode: 'incremental',
    }
    const out = resolveArrayTransforms(makeRect(), settings)
    // i=0: 1, i=1: 0.9, i=2: 0.81, i=3: 0.729
    expect(out[0].scale.x).toBeCloseTo(1, 5)
    expect(out[1].scale.x).toBeCloseTo(0.9, 5)
    expect(out[2].scale.x).toBeCloseTo(0.81, 5)
    expect(out[3].scale.x).toBeCloseTo(0.729, 5)
  })

  it('count=0 returns empty', () => {
    const settings: LinearArraySettings = { ...defaultLinearArraySettings(), count: 0 }
    expect(resolveArrayTransforms(makeRect(), settings)).toEqual([])
  })

  it('respects source position as baseline', () => {
    const settings: LinearArraySettings = {
      ...defaultLinearArraySettings(),
      count: 3,
      move: { x: 10, y: 5 },
      transformMode: 'incremental',
    }
    const out = resolveArrayTransforms(makeRect(100, 200), settings)
    expect(out.map((t) => t.position.x)).toEqual([100, 110, 120])
    expect(out.map((t) => t.position.y)).toEqual([200, 205, 210])
  })
})

// ── Grid ─────────────────────────────────────────────────────────────────────

describe('Grid array', () => {
  it('produces columns × rows transforms', () => {
    const settings: GridArraySettings = {
      ...defaultGridArraySettings(),
      columns: 3,
      rows: 2,
      columnMove: { x: 50, y: 0 },
      rowMove: { x: 0, y: 40 },
    }
    const out = resolveArrayTransforms(makeRect(0, 0), settings)
    expect(out.length).toBe(6)
    // row 0
    expect(out[0].position).toEqual({ x: 0, y: 0 })
    expect(out[1].position).toEqual({ x: 50, y: 0 })
    expect(out[2].position).toEqual({ x: 100, y: 0 })
    // row 1
    expect(out[3].position).toEqual({ x: 0, y: 40 })
    expect(out[4].position).toEqual({ x: 50, y: 40 })
    expect(out[5].position).toEqual({ x: 100, y: 40 })
  })

  it('marks (0,0) as source index', () => {
    const settings: GridArraySettings = {
      ...defaultGridArraySettings(),
      columns: 2,
      rows: 2,
      sourcePolicy: 'include-source',
    }
    const out = resolveArrayTransforms(makeRect(), settings)
    expect(out[0].isSourceIndex).toBe(true)
    expect(out.slice(1).every((t) => !t.isSourceIndex)).toBe(true)
  })

  it('stagger offsets odd rows', () => {
    const settings: GridArraySettings = {
      ...defaultGridArraySettings(),
      columns: 2,
      rows: 2,
      columnMove: { x: 10, y: 0 },
      rowMove: { x: 0, y: 10 },
      stagger: { enabled: true, mode: 'odd-rows', offset: { x: 5, y: 0 } },
    }
    const out = resolveArrayTransforms(makeRect(0, 0), settings)
    // Row 0 (even row, not staggered): x = 0, 10
    expect(out[0].position.x).toBe(0)
    expect(out[1].position.x).toBe(10)
    // Row 1 (odd, staggered by +5): x = 0+5=5, 10+5=15
    expect(out[2].position.x).toBe(5)
    expect(out[3].position.x).toBe(15)
  })

  it('returns empty if columns or rows = 0', () => {
    expect(
      resolveArrayTransforms(makeRect(), {
        ...defaultGridArraySettings(),
        columns: 0,
      }),
    ).toEqual([])
  })
})

// ── Radial ───────────────────────────────────────────────────────────────────

describe('Radial array', () => {
  it('places N copies around a circle (closed=true)', () => {
    const settings: RadialArraySettings = {
      ...defaultRadialArraySettings(),
      count: 4,
      center: { x: 0, y: 0 },
      radius: 100,
      startAngleDeg: 0,
      totalAngleDeg: 360,
      closed: true,
      sourcePolicy: 'clone-source-too', // skip source-index special case
    }
    const out = resolveArrayTransforms(makeRect(50, 50), settings)
    expect(out.length).toBe(4)
    // 0° = top (0, -100), 90° = right (100, 0), 180° = bottom (0, 100), 270° = left (-100, 0)
    expect(out[0].position.x).toBeCloseTo(0, 3)
    expect(out[0].position.y).toBeCloseTo(-100, 3)
    expect(out[1].position.x).toBeCloseTo(100, 3)
    expect(out[1].position.y).toBeCloseTo(0, 3)
    expect(out[2].position.x).toBeCloseTo(0, 3)
    expect(out[2].position.y).toBeCloseTo(100, 3)
    expect(out[3].position.x).toBeCloseTo(-100, 3)
    expect(out[3].position.y).toBeCloseTo(0, 3)
  })

  it('source stays put at index 0 (include-source)', () => {
    const settings: RadialArraySettings = {
      ...defaultRadialArraySettings(),
      count: 4,
      sourcePolicy: 'include-source',
    }
    const out = resolveArrayTransforms(makeRect(50, 50), settings)
    expect(out[0].isSourceIndex).toBe(true)
    expect(out[0].position).toEqual({ x: 50, y: 50 })
  })

  it('orientToAngle rotates instances to face outward', () => {
    const settings: RadialArraySettings = {
      ...defaultRadialArraySettings(),
      count: 4,
      orientToAngle: true,
      sourcePolicy: 'clone-source-too',
      closed: true,
    }
    const out = resolveArrayTransforms(makeRect(), settings)
    expect(out[0].rotation).toBe(0)
    expect(out[1].rotation).toBe(90)
    expect(out[2].rotation).toBe(180)
    expect(out[3].rotation).toBe(270)
  })

  it('rotationOffset applied on top of orient', () => {
    const settings: RadialArraySettings = {
      ...defaultRadialArraySettings(),
      count: 4,
      orientToAngle: true,
      rotationOffsetDeg: 45,
      sourcePolicy: 'clone-source-too',
      closed: true,
    }
    const out = resolveArrayTransforms(makeRect(), settings)
    expect(out[0].rotation).toBe(45)
    expect(out[1].rotation).toBe(135)
  })

  it('closed=false uses (count-1) divisor (instances span the arc inclusive)', () => {
    const settings: RadialArraySettings = {
      ...defaultRadialArraySettings(),
      count: 3,
      totalAngleDeg: 180,
      startAngleDeg: 0,
      closed: false,
      orientToAngle: true,
      sourcePolicy: 'clone-source-too',
    }
    const out = resolveArrayTransforms(makeRect(), settings)
    // 0°, 90°, 180° (3 points spanning 180° at the endpoints)
    expect(out[0].rotation).toBe(0)
    expect(out[1].rotation).toBe(90)
    expect(out[2].rotation).toBe(180)
  })
})

// ── Counts ───────────────────────────────────────────────────────────────────

describe('countArrayInstances / countNewClones', () => {
  it('Linear count', () => {
    const s = { ...defaultLinearArraySettings(), count: 5 }
    expect(countArrayInstances(s)).toBe(5)
  })
  it('Grid total = cols * rows', () => {
    const s = { ...defaultGridArraySettings(), columns: 4, rows: 3 }
    expect(countArrayInstances(s)).toBe(12)
  })
  it('Radial count', () => {
    const s = { ...defaultRadialArraySettings(), count: 7 }
    expect(countArrayInstances(s)).toBe(7)
  })
  it('countNewClones subtracts 1 for include-source', () => {
    const s = {
      ...defaultLinearArraySettings(),
      count: 5,
      sourcePolicy: 'include-source' as const,
    }
    expect(countNewClones(s)).toBe(4)
  })
  it('countNewClones equals total for clone-source-too', () => {
    const s = {
      ...defaultLinearArraySettings(),
      count: 5,
      sourcePolicy: 'clone-source-too' as const,
    }
    expect(countNewClones(s)).toBe(5)
  })
})
