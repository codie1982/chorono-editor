// ── Axis-Aligned Bounding Box ─────────────────────────────────────────────────
//
// Used for hit-testing, layout calculations, scene-tree culling, viewport fit.
// All Bounds methods are pure — return new Bounds, never mutate `this`.

import type { Vec2 } from './CoordinateSystem'

export class Bounds {
  constructor(
    public readonly x: number,
    public readonly y: number,
    public readonly width: number,
    public readonly height: number,
  ) {}

  // ── Factories ───────────────────────────────────────────────────────────────

  /** Empty bounds at origin — useful as a reducer seed. */
  static empty(): Bounds {
    return new Bounds(0, 0, 0, 0)
  }

  /** Build from min/max corners. Allows reversed args (auto-normalised). */
  static fromMinMax(minX: number, minY: number, maxX: number, maxY: number): Bounds {
    const x = Math.min(minX, maxX)
    const y = Math.min(minY, maxY)
    return new Bounds(x, y, Math.abs(maxX - minX), Math.abs(maxY - minY))
  }

  /** Bounding box of a set of points. Returns empty bounds for empty input. */
  static fromPoints(points: Vec2[]): Bounds {
    if (points.length === 0) return Bounds.empty()
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of points) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
    return Bounds.fromMinMax(minX, minY, maxX, maxY)
  }

  // ── Inspection ──────────────────────────────────────────────────────────────

  get maxX(): number { return this.x + this.width  }
  get maxY(): number { return this.y + this.height }
  get cx():   number { return this.x + this.width  / 2 }
  get cy():   number { return this.y + this.height / 2 }

  isEmpty(): boolean {
    return this.width === 0 && this.height === 0 && this.x === 0 && this.y === 0
  }

  containsPoint(p: Vec2): boolean {
    return p.x >= this.x && p.x <= this.maxX && p.y >= this.y && p.y <= this.maxY
  }

  // ── Set operations (pure) ───────────────────────────────────────────────────

  /** Smallest bounds containing both `this` and `other`. */
  union(other: Bounds): Bounds {
    if (this.isEmpty())  return other
    if (other.isEmpty()) return this
    return Bounds.fromMinMax(
      Math.min(this.x,    other.x),
      Math.min(this.y,    other.y),
      Math.max(this.maxX, other.maxX),
      Math.max(this.maxY, other.maxY),
    )
  }

  /** Returns true if `this` and `other` overlap (touching edges count). */
  intersects(other: Bounds): boolean {
    return !(
      this.maxX < other.x ||
      this.x    > other.maxX ||
      this.maxY < other.y ||
      this.y    > other.maxY
    )
  }

  /** Grow bounds by `pad` pixels on all sides. */
  inflate(pad: number): Bounds {
    return new Bounds(this.x - pad, this.y - pad, this.width + pad * 2, this.height + pad * 2)
  }
}
