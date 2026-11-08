/** Half-open mounted row interval; all distances are CSS pixels. */
export interface RowRange { start: number; end: number }

/**
 * Immutable vertical layout for editor lists. Keeps only n+1 prefix offsets,
 * never DOM nodes, scene objects or selection. Construct after row order/height
 * changes; querying a viewport is O(log n), plus the mounted output size.
 * Heights must be finite and positive; invalid layouts fail synchronously.
 * This is UI geometry: it never changes authored layer visibility or timing.
 */
export class RowLayout {
  private readonly offsets: Float64Array
  readonly count: number

  constructor(heights: readonly number[]) {
    this.count = heights.length
    this.offsets = new Float64Array(this.count + 1)
    heights.forEach((height, i) => {
      if (!Number.isFinite(height) || height <= 0) throw new RangeError('Row height must be finite and positive')
      this.offsets[i + 1] = this.offsets[i] + height
      if (!Number.isFinite(this.offsets[i + 1])) throw new RangeError('Row layout exceeds finite pixel space')
    })
  }

  /** Uniform list adapter; the resulting layout owns its prefix buffer. */
  static fixed(count: number, height: number): RowLayout {
    if (!Number.isSafeInteger(count) || count < 0) throw new RangeError('Invalid row count')
    return new RowLayout(Array.from({ length: count }, () => height))
  }

  get height(): number { return this.offsets[this.count] }

  /** Top boundary for an integer index; out-of-range integers clamp to the
   * endpoints. count addresses the terminal bottom boundary. */
  top(index: number): number { return this.offsets[Math.max(0, Math.min(this.count, index))] }

  /** CSS-pixel window with bounded pixel overscan. Empty/hidden viewports mount
   * no ordinary rows. Nonintersecting nested lists return empty; native scroll
   * layout/ResizeObserver resolves a stale scroll after filtering. */
  range(top: number, height: number, overscan = 168): RowRange {
    if (!this.count || !Number.isFinite(top) || !Number.isFinite(height) || height <= 0) return { start: 0, end: 0 }
    const extra = Number.isFinite(overscan) ? Math.max(0, overscan) : 0
    const from = Math.max(0, top - extra), to = Math.min(this.height, top + height + extra)
    if (to <= from) return { start: 0, end: 0 }
    return { start: this.find(from, true), end: this.find(to, false) }
  }

  /** Mounted rows from this layout's range() plus a few explicit interaction owners. Ordinary numeric
   * sorting preserves authored order. Selection is not an interaction owner:
   * selecting thousands of rows must not mount thousands of controls. */
  indices(range: RowRange, retained: readonly number[] = []): number[] {
    const indices = new Set<number>()
    for (let i = range.start; i < range.end; i++) indices.add(i)
    for (const i of retained) if (Number.isInteger(i) && i >= 0 && i < this.count) indices.add(i)
    return Array.from(indices).sort((a, b) => a - b)
  }

  /** Boundary bisection: starts exclude rows ending at x; ends exclude rows
   * starting at x. Fractional heights and exact boundaries stay deterministic. */
  private find(x: number, start: boolean): number {
    let low = 0, high = this.count
    while (low < high) {
      const mid = (low + high) >>> 1
      if (start ? this.offsets[mid + 1] <= x : this.offsets[mid] < x) low = mid + 1
      else high = mid
    }
    return low
  }
}
