import { PointerGestureSession, type PointerGestureSample, type PointerGestureStart } from './PointerGestureSession'
import type { SelectionMode, SelectionRegion, SelectionRegionStyle } from '@/lib/selection/selectionGesture'

type Point = { x: number; y: number }
interface Host {
  eventTarget: Pick<Window, 'addEventListener' | 'removeEventListener'>
  world(sample: Point): Point
  current(): boolean
  query(region: SelectionRegion): Set<string>
  show(region: SelectionRegion | null): void
  select(ids: Set<string>, mode: SelectionMode): void
  closed(): void
}

/** One transient empty-space region gesture. The shared native pointer owner
 * handles capture, foreign pointers, missed release, Escape and cleanup; this
 * class owns only the region preview and apply-on-release policy. A 3 CSS px
 * threshold separates a blank click from a drag, independent of zoom/DPR.
 * The host pins the displayed source/frame, converts client→composition pixels
 * and supplies geometry queries. No source, history or baseline selection is
 * mutated before release. Paint always accumulates hits, lasso samples at most
 * 4,096 points separated by 3 CSS px (then replaces only its last point).
 */
export class SelectionRegionSession {
  private readonly pointer: PointerGestureSession
  private readonly startWorld: Point
  private readonly points: Point[]
  private readonly painted = new Set<string>()
  private lastClient: Point
  private dragged = false
  private done = false

  /** Start must be the actual primary down on an empty viewport surface. */
  constructor(private readonly start: Point, private readonly style: SelectionRegionStyle,
    private readonly mode: SelectionMode, private readonly host: Host, pointer?: PointerGestureStart) {
    this.startWorld = host.world(start); this.points = [this.startWorld]; this.lastClient = start
    this.pointer = new PointerGestureSession({ eventTarget: host.eventTarget,
      move: sample => this.sample(sample), up: sample => this.finish(sample), cancel: () => this.cancel(),
      error: () => this.cancel(), diagnostics: { owner: 'selection-region', details: { style, mode } },
    }, pointer)
  }

  /** Discard only temporary preview; prior layer/key selection is unchanged. */
  cancel(): void {
    if (this.done) return
    this.done = true; this.pointer.dispose(); this.host.show(null); this.host.closed()
  }

  private sample(sample: PointerGestureSample, final = false): SelectionRegion | null {
    if (this.done) return null
    if (!this.host.current()) { this.cancel(); return null }
    const first = !this.dragged
    if (Math.hypot(sample.clientX - this.start.x, sample.clientY - this.start.y) >= 3) this.dragged = true
    if (!this.dragged) return null
    const point = this.host.world({ x: sample.clientX, y: sample.clientY })
    if (this.style === 'lasso' && (final || Math.hypot(sample.clientX - this.lastClient.x, sample.clientY - this.lastClient.y) >= 3)) {
      if (this.points.length < 4096) this.points.push(point)
      else this.points[this.points.length - 1] = point
      this.lastClient = { x: sample.clientX, y: sample.clientY }
    }
    const region = this.region(point)
    if (this.style === 'paint') {
      if (first) this.host.query(this.region(this.startWorld)).forEach(id => this.painted.add(id))
      this.host.query(region).forEach(id => this.painted.add(id))
    }
    this.host.show(region)
    return region
  }

  private region(point: Point): SelectionRegion {
    switch (this.style) {
      case 'box': return { kind: 'box', x: Math.min(this.startWorld.x, point.x), y: Math.min(this.startWorld.y, point.y),
        w: Math.abs(point.x - this.startWorld.x), h: Math.abs(point.y - this.startWorld.y) }
      case 'circle': return { kind: 'circle', cx: this.startWorld.x, cy: this.startWorld.y,
        r: Math.hypot(point.x - this.startWorld.x, point.y - this.startWorld.y) }
      case 'lasso': return { kind: 'lasso', points: this.points.slice() }
      case 'paint': return { kind: 'paint', cx: point.x, cy: point.y, r: 24 }
    }
  }

  /** Resample the genuine release, including a final circle/lasso/paint point.
   * A blank click clears replace-selection; additive/subtractive clicks on
   * empty space are no-ops. Stale source/frame and cancellation never apply. */
  private finish(sample: PointerGestureSample): void {
    const region = this.sample(sample, true)
    if (this.done) return
    try {
      if (region) this.host.select(this.style === 'paint' ? this.painted : this.host.query(region), this.mode)
      else if (this.mode === 'replace') this.host.select(new Set(), this.mode)
    } finally { this.cancel() }
  }
}
