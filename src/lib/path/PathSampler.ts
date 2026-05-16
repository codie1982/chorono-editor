// ── PathSampler ───────────────────────────────────────────────────────────────
//
// Arc-length parameterization for NormalizedPathDefinition.
//
// Problem: in a cubic bezier, the parameter `t ∈ [0, 1]` is NOT uniform —
// curvature accelerates `t` through tight bends and slows through straight
// stretches. For "object travels at constant speed along path", we need
// LENGTH parameterization, not t-parameterization.
//
// Solution (Pre-sampled Length Table):
//   1. Walk every command in the path
//   2. For each curve segment, sample N points using de Casteljau evaluation
//   3. Record cumulative arc-length at each sample
//   4. Lookup table → binary-search for "give me the point at arc-length L"
//
// This gives O(log N) lookup with ~10⁻³ relative accuracy at N=32 samples
// per curve — sufficient for animation at 60 FPS.

import type { NormalizedPathCommand, PathDefinition } from '@/lib/geometry'

export interface PathSample {
  /** Cumulative arc-length from path start. */
  length: number
  x: number
  y: number
  /** Tangent direction (unit vector). Useful for auto-rotate. */
  tangentX: number
  tangentY: number
  /** Tangent angle in degrees (atan2 of tangent). */
  angle: number
}

export class PathLengthTable {
  constructor(
    public readonly samples:     PathSample[],
    public readonly totalLength: number,
  ) {}

  /** Returns the sample at fractional progress (0–1) by arc-length. */
  pointAtProgress(progress: number): PathSample {
    return this.pointAtLength(this.totalLength * Math.max(0, Math.min(1, progress)))
  }

  /** Returns the (interpolated) sample at the given absolute arc-length. */
  pointAtLength(length: number): PathSample {
    if (this.samples.length === 0) {
      return { length: 0, x: 0, y: 0, tangentX: 1, tangentY: 0, angle: 0 }
    }
    if (length <= 0)                return this.samples[0]
    if (length >= this.totalLength) return this.samples[this.samples.length - 1]

    // Binary search for the bracket
    let lo = 0
    let hi = this.samples.length - 1
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1
      if (this.samples[mid].length <= length) lo = mid
      else                                    hi = mid
    }
    const a = this.samples[lo]
    const b = this.samples[hi]
    const t = (length - a.length) / Math.max(1e-9, b.length - a.length)
    return {
      length,
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      tangentX: a.tangentX + (b.tangentX - a.tangentX) * t,
      tangentY: a.tangentY + (b.tangentY - a.tangentY) * t,
      angle:    a.angle    + (b.angle    - a.angle)    * t,
    }
  }
}

export class PathSampler {
  private cache = new WeakMap<PathDefinition, PathLengthTable>()

  /**
   * Builds (or returns cached) length table. Caches by PathDefinition object
   * identity — caller is responsible for invalidating when commands change
   * (typically by creating a new PathDefinition reference).
   */
  buildLengthTable(path: PathDefinition, samplesPerCurve = 32): PathLengthTable {
    const cached = this.cache.get(path)
    if (cached) return cached
    const table = this.compute(path, samplesPerCurve)
    this.cache.set(path, table)
    return table
  }

  private compute(path: PathDefinition, samplesPerCurve: number): PathLengthTable {
    const samples: PathSample[] = []
    let cumLen   = 0
    let curX     = 0
    let curY     = 0
    let startX   = 0
    let startY   = 0
    let prevX    = 0
    let prevY    = 0
    let prevDx   = 1
    let prevDy   = 0

    const push = (x: number, y: number, dx: number, dy: number) => {
      const len = Math.hypot(dx, dy) || 1
      const ux  = dx / len
      const uy  = dy / len
      samples.push({
        length: cumLen,
        x, y,
        tangentX: ux, tangentY: uy,
        angle: (Math.atan2(uy, ux) * 180) / Math.PI,
      })
      prevX = x; prevY = y
      prevDx = ux; prevDy = uy
    }

    for (const cmd of path.commands) {
      switch (cmd.type) {
        case 'M':
          // Start a fresh subpath — emit the start point with a default tangent.
          curX = startX = cmd.x
          curY = startY = cmd.y
          push(curX, curY, prevDx, prevDy)
          break

        case 'L':
          this.sampleLine(curX, curY, cmd.x, cmd.y, samplesPerCurve, (sx, sy, dx, dy) => {
            const segLen = Math.hypot(sx - prevX, sy - prevY)
            cumLen += segLen
            push(sx, sy, dx, dy)
          })
          curX = cmd.x
          curY = cmd.y
          break

        case 'C':
          this.sampleCubic(curX, curY, cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y, samplesPerCurve,
            (sx, sy, dx, dy) => {
              const segLen = Math.hypot(sx - prevX, sy - prevY)
              cumLen += segLen
              push(sx, sy, dx, dy)
            })
          curX = cmd.x
          curY = cmd.y
          break

        case 'Q':
          this.sampleQuad(curX, curY, cmd.x1, cmd.y1, cmd.x, cmd.y, samplesPerCurve,
            (sx, sy, dx, dy) => {
              const segLen = Math.hypot(sx - prevX, sy - prevY)
              cumLen += segLen
              push(sx, sy, dx, dy)
            })
          curX = cmd.x
          curY = cmd.y
          break

        case 'Z':
          if (curX !== startX || curY !== startY) {
            this.sampleLine(curX, curY, startX, startY, samplesPerCurve, (sx, sy, dx, dy) => {
              const segLen = Math.hypot(sx - prevX, sy - prevY)
              cumLen += segLen
              push(sx, sy, dx, dy)
            })
            curX = startX
            curY = startY
          }
          break
      }
    }

    return new PathLengthTable(samples, cumLen)
  }

  // ── Per-command samplers ─────────────────────────────────────────────────

  private sampleLine(
    x0: number, y0: number, x1: number, y1: number,
    samples: number,
    emit: (x: number, y: number, dx: number, dy: number) => void,
  ) {
    const dx = x1 - x0
    const dy = y1 - y0
    for (let i = 1; i <= samples; i++) {
      const t = i / samples
      emit(x0 + dx * t, y0 + dy * t, dx, dy)
    }
  }

  private sampleCubic(
    p0x: number, p0y: number,
    c1x: number, c1y: number,
    c2x: number, c2y: number,
    p3x: number, p3y: number,
    samples: number,
    emit: (x: number, y: number, dx: number, dy: number) => void,
  ) {
    for (let i = 1; i <= samples; i++) {
      const t = i / samples
      const it = 1 - t
      const x = it*it*it*p0x + 3*it*it*t*c1x + 3*it*t*t*c2x + t*t*t*p3x
      const y = it*it*it*p0y + 3*it*it*t*c1y + 3*it*t*t*c2y + t*t*t*p3y
      // Derivative: 3·(1-t)²·(c1-p0) + 6·(1-t)·t·(c2-c1) + 3·t²·(p3-c2)
      const dx = 3*it*it*(c1x - p0x) + 6*it*t*(c2x - c1x) + 3*t*t*(p3x - c2x)
      const dy = 3*it*it*(c1y - p0y) + 6*it*t*(c2y - c1y) + 3*t*t*(p3y - c2y)
      emit(x, y, dx, dy)
    }
  }

  private sampleQuad(
    p0x: number, p0y: number,
    c1x: number, c1y: number,
    p2x: number, p2y: number,
    samples: number,
    emit: (x: number, y: number, dx: number, dy: number) => void,
  ) {
    for (let i = 1; i <= samples; i++) {
      const t = i / samples
      const it = 1 - t
      const x = it*it*p0x + 2*it*t*c1x + t*t*p2x
      const y = it*it*p0y + 2*it*t*c1y + t*t*p2y
      // Derivative: 2·(1-t)·(c1-p0) + 2·t·(p2-c1)
      const dx = 2*it*(c1x - p0x) + 2*t*(p2x - c1x)
      const dy = 2*it*(c1y - p0y) + 2*t*(p2y - c1y)
      emit(x, y, dx, dy)
    }
  }
}

export const defaultPathSampler = new PathSampler()
