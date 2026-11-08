/** Projected editor glyph, in row-local CSS pixels. Source index/identity refer
 * to the current immutable input only; no keyframe or scene is copied here.
 * members is used for the dope sheet's existing exact-time summary groups. */
export interface KeyGlyphPoint {
  readonly id: string
  readonly sourceIndex: number
  readonly x: number
  readonly y: number
  readonly members?: readonly string[]
}
interface Cell { readonly point: KeyGlyphPoint; readonly indices: readonly number[] }
export const MAX_KEY_DOM_GLYPHS = 256
const CELL_SIZE = 8

/**
 * One immutable projected row. Keeps authored-order navigation and id lookup
 * separate from a bounded SVG representation: one representative per 8px cell.
 * Only finite coordinates within the existing ±10px x guard are visible.
 * Rebuild on geometry/viewport/preview changes; selection is a separate query.
 * Instances borrow point records, own O(n) index arrays/maps and retain no DOM,
 * renderer or persistent scene cache. Equal-cell representatives use the LAST
 * authored point, matching the old overlapping DOM stacking convention. Hidden
 * members remain individually reachable through visibleAt/ordinal navigation.
 */
export class KeyGlyphLayout {
  private readonly byId = new Map<string, KeyGlyphPoint>()
  private readonly ordinals = new Map<string, number>()
  private readonly cells = new Map<string, Cell>()
  private readonly visiblePoints: KeyGlyphPoint[] = []

  constructor(points: readonly KeyGlyphPoint[], readonly width: number, readonly height: number) {
    const cells = new Map<string, { point: KeyGlyphPoint; indices: number[] }>()
    for (const point of points) {
      if (![point.x, point.y].every(Number.isFinite)) continue
      this.byId.set(point.id, point)
      if (![width, height].every(Number.isFinite) || !(width > 0 && height > 0)
        || point.x < -10 || point.x > width + 10 || point.y < -11 || point.y > height + 11) continue
      this.ordinals.set(point.id, this.visiblePoints.length)
      this.visiblePoints.push(point)
      const key = cellKey(point.x, point.y), cell = cells.get(key)
      if (cell) { cell.point = point; cell.indices.push(this.visiblePoints.length - 1) }
      else cells.set(key, { point, indices: [this.visiblePoints.length - 1] })
    }
    cells.forEach((cell, key) => this.cells.set(key, cell))
  }

  get count(): number { return this.visiblePoints.length }
  get dense(): boolean { return this.count > MAX_KEY_DOM_GLYPHS }
  get cellCount(): number { return this.cells.size }
  /** Borrowed authored-order points. A selected set never expands this view. */
  get visible(): readonly KeyGlyphPoint[] { return this.visiblePoints }
  get(id: string): KeyGlyphPoint | undefined { return this.byId.get(id) }
  ordinal(id: string): number { return this.ordinals.get(id) ?? -1 }
  visibleAt(ordinal: number): KeyGlyphPoint | undefined { return this.visiblePoints[ordinal] }
  /** Displayed representative for a visible source point; useful for choosing
   * the initial cursor without covering a later stacked key with the first. */
  representative(point: KeyGlyphPoint): KeyGlyphPoint { return this.cells.get(cellKey(point.x, point.y))?.point ?? point }

  /** Hit tests DISPLAYED representatives with 11px diamond slop. At most the
   * neighboring cells are queried, even when 42,000 keys coincide in one cell.
   * Last authored representative wins overlap. Other source members are edited
   * through keyboard/ordinal navigation, never silently removed from the model. */
  hit(x: number, y: number): KeyGlyphPoint | undefined {
    let hit: KeyGlyphPoint | undefined, ordinal = -1
    for (let cy = Math.floor((y - 11) / CELL_SIZE); cy <= Math.floor((y + 11) / CELL_SIZE); cy++) {
      for (let cx = Math.floor((x - 11) / CELL_SIZE); cx <= Math.floor((x + 11) / CELL_SIZE); cx++) {
        const cell = this.cells.get(`${cx}:${cy}`), point = cell?.point
        if (!point || Math.abs(x - point.x) + Math.abs(y - point.y) > 11) continue
        const next = this.ordinal(point.id)
        if (next > ordinal) { hit = point; ordinal = next }
      }
    }
    return hit
  }

  /** Three bounded SVG paths: unselected, partially selected, fully selected.
   * Selection unions every member in a display cell, including existing dope
   * summary groups. Radius is CSS pixels; path rounding is display-only (0.01px)
   * and never changes source times/values or data marquee calculations. */
  paths(selected: ReadonlySet<string>, radius = 8.5): readonly string[] {
    const paths = ['', '', '']
    this.cells.forEach(cell => {
      let count = 0, selectedCount = 0
      for (const index of cell.indices) {
        const point = this.visiblePoints[index]
        if (point.members) {
          count += point.members.length
          for (const id of point.members) if (selected.has(id)) selectedCount++
        } else { count++; if (selected.has(point.id)) selectedCount++ }
      }
      const state = selectedCount === 0 ? 0 : selectedCount === count ? 2 : 1
      const { x, y } = cell.point, r = state === 2 ? radius * 1.25 : radius
      const n = (value: number) => Math.round(value * 100) / 100
      paths[state] += `M${n(x)},${n(y - r)}l${n(r)},${n(r)}l${n(-r)},${n(r)}l${n(-r)},${n(-r)}Z`
    })
    return paths
  }
}

/** Integer spatial address; no ordering/sorting or source mutation occurs. */
function cellKey(x: number, y: number): string { return `${Math.floor(x / CELL_SIZE)}:${Math.floor(y / CELL_SIZE)}` }
