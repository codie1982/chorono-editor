import { shouldAutoClose } from '@/lib/spline/creation/autoClose'
import type { SplineVertexTarget, Vec2 } from '@/lib/snap/SnapCandidate'

/** Mutable, transient placed-anchor owner for one Line draw in composition px.
 * Borrows no source geometry: incoming points and the optional opposite endpoint
 * are copied; consumers receive readonly positions. Owns neither DOM listeners,
 * editor transactions nor Undo. The hook commits once on explicit completion.
 * Closure hit testing uses the shared 10 CSS px policy; the hook gates both
 * closure and existing-anchor completion with the Auto Close preference. */
export class SplineLineDraft {
  private readonly pointsValue: Vec2[]
  private readonly optionsValue: { targetId?: string | null; endpointId?: string; closePoint?: Vec2; existingCount?: number }
  constructor(first: Vec2, options: { targetId?: string | null; endpointId?: string; closePoint?: Vec2; existingCount?: number } = {}) {
    this.pointsValue = [{ ...first }]
    this.optionsValue = { ...options, closePoint: options.closePoint ? { ...options.closePoint } : undefined }
  }
  get points(): readonly Readonly<Vec2>[] { return this.pointsValue }
  get endpointId() { return this.optionsValue.endpointId }
  get existingCount() { return this.optionsValue.existingCount }
  get closePoint(): Readonly<Vec2> { return this.optionsValue.closePoint ?? this.pointsValue[0] }

  /** Append a finite point once. Closing clicks are handled separately. With allowStart (Auto Close off),
   * returning to the first position remains an open path. Repeated adjacent
   * anchors never create zero-length edges. */
  add(point: Vec2, allowStart = false): boolean {
    if (![point.x, point.y].every(Number.isFinite) || [allowStart ? undefined : this.pointsValue[0], this.pointsValue.at(-1)].some(previous => previous && Math.hypot(previous.x - point.x, previous.y - point.y) < 1e-7)) return false
    this.pointsValue.push({ ...point }); return true
  }
  /** Remove one uncommitted anchor; zero means the hook should release the draft. */
  backspace(): number { this.pointsValue.pop(); return this.pointsValue.length }
  /** Screen-distance closure of this contour only, with no duplicate endpoint. */
  closesAt(pointer: Vec2, zoom: number): boolean {
    return !!this.pointsValue.length && shouldAutoClose(this.pointsValue, this.closePoint, pointer, zoom, this.existingCount)
  }
  /** An acquired vertex in the explicit target finishes a placed Line. Closed
   * circle/curve vertices are positional destinations, never topology welds.
   * Actual open-endpoint joins remain the existing native command's job. */
  finishesAt(vertex?: SplineVertexTarget): boolean {
    return !!vertex && !!this.optionsValue.targetId && vertex.layerId === this.optionsValue.targetId
  }
  /** One real segment is enough to finish open; explicit joins can have no new
   * intermediate anchor. Continue may close an already three-anchor contour. */
  canFinish(closed: boolean, joinEndpointId?: string): boolean {
    return this.pointsValue.length >= 2 || !!joinEndpointId || !!(closed && this.endpointId && this.pointsValue.length + (this.existingCount ?? 0) >= 3)
  }
}
