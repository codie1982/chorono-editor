import type { Timeline, TimelineSettings } from '@/lib/types'
import type { KfMove } from '@/lib/editor/commands-keyframe'

export interface DragSnapshot {
  kfId: string
  trackTarget: string
  timelineId: string
  originalMs: number
}

export interface DopeSheetDragUpdate {
  deltaMs: number
  previewMs: Record<string, number>
  moves: KfMove[]
  snappedTo: number | null
}

interface DragOptions {
  timeline: Timeline
  leaderId: string
  selectedIds: Set<string>
  frameRate: number
  settings: TimelineSettings
  pixelsPerMs: number
  gridStepMs: number
  startX: number
  onBegin: () => void
  onPreview: (update: DopeSheetDragUpdate) => void
  onCommit: (moves: KfMove[]) => void
  onCancel: () => void
  onClick?: () => void
}

export function collectDopeSheetSnapshots(timeline: Timeline, selectedIds: Set<string>): DragSnapshot[] {
  return timeline.tracks.flatMap(track => track.keyframes
    .filter(key => selectedIds.has(key.id))
    .map(key => ({ kfId: key.id, trackTarget: track.target, timelineId: timeline.id, originalMs: key.timeMs })))
}

/** Session owns a frozen group and one bounded delta for preview AND commit. */
export class DopeSheetDragSession {
  private active = true
  private moved = false
  private lastDelta: number | null = null
  private lastSnap: number | null = null
  private readonly fixedTargets: number[]
  private readonly minDelta: number
  private readonly maxDelta: number

  constructor(
    private readonly options: DragOptions,
    private readonly leader: DragSnapshot,
    private readonly snapshots: DragSnapshot[],
  ) {
    const movingIds = new Set(snapshots.map(snapshot => snapshot.kfId))
    const targets = new Set<number>([0, options.timeline.durationMs])
    if (options.timeline.workAreaInMs != null) targets.add(options.timeline.workAreaInMs)
    if (options.timeline.workAreaOutMs != null) targets.add(options.timeline.workAreaOutMs)
    if (options.settings.snapToKeyframes) for (const track of options.timeline.tracks) {
      for (const key of track.keyframes) if (!movingIds.has(key.id)) targets.add(key.timeMs)
    }
    if (options.settings.snapToMarkers) for (const marker of options.timeline.markers ?? []) targets.add(marker.timeMs)
    this.fixedTargets = Array.from(targets)
    this.minDelta = -Math.min(...snapshots.map(snapshot => snapshot.originalMs))
    this.maxDelta = options.timeline.durationMs - Math.max(...snapshots.map(snapshot => snapshot.originalMs))
    options.onBegin()
  }

  private resolve(clientX: number, bypassSnap: boolean): DopeSheetDragUpdate {
    const { options, leader } = this
    let leaderTime = leader.originalMs + (clientX - options.startX) / options.pixelsPerMs
    let snappedTo: number | null = null
    if (options.settings.snapEnabled && !bypassSnap) {
      const targets = [...this.fixedTargets]
      if (options.settings.snapToFrame && options.frameRate > 0) {
        const frameMs = 1000 / options.frameRate
        targets.push(Math.round(leaderTime / frameMs) * frameMs)
      }
      if (options.settings.snapToGrid && options.gridStepMs > 0) {
        targets.push(Math.round(leaderTime / options.gridStepMs) * options.gridStepMs)
      }
      let closest = 8 / options.pixelsPerMs
      for (const target of targets) {
        const distance = Math.abs(target - leaderTime)
        if (distance <= closest) { closest = distance; snappedTo = target }
      }
      if (snappedTo != null) leaderTime = snappedTo
    }
    const intendedDelta = leaderTime - leader.originalMs
    const deltaMs = Math.max(this.minDelta, Math.min(this.maxDelta, intendedDelta))
    if (deltaMs !== intendedDelta) snappedTo = null
    const moves = this.snapshots.map(snapshot => ({
      timelineId: snapshot.timelineId, target: snapshot.trackTarget, kfId: snapshot.kfId,
      fromMs: snapshot.originalMs, toMs: snapshot.originalMs + deltaMs,
    }))
    return { deltaMs, moves, snappedTo, previewMs: Object.fromEntries(moves.map(move => [move.kfId, move.toMs])) }
  }

  move(clientX: number, bypassSnap = false): DopeSheetDragUpdate | null {
    if (!this.active) return null
    if (!this.moved && Math.abs(clientX - this.options.startX) < 3) return null
    this.moved = true
    const update = this.resolve(clientX, bypassSnap)
    if (update.deltaMs !== this.lastDelta || update.snappedTo !== this.lastSnap) {
      this.lastDelta = update.deltaMs
      this.lastSnap = update.snappedTo
      this.options.onPreview(update)
    }
    return update
  }

  finish(clientX: number, bypassSnap = false): void {
    if (!this.active) return
    const update = this.move(clientX, bypassSnap)
    this.active = false
    if (!update || Math.abs(update.deltaMs) < 1e-9) {
      this.options.onCancel()
      if (!this.moved) this.options.onClick?.()
    } else this.options.onCommit(update.moves)
  }

  cancel(): void {
    if (!this.active) return
    this.active = false
    this.options.onCancel()
  }
}

export function createDopeSheetDrag(options: DragOptions): DopeSheetDragSession | null {
  if (!(options.pixelsPerMs > 0)) return null
  const ids = new Set(options.selectedIds).add(options.leaderId)
  const snapshots = collectDopeSheetSnapshots(options.timeline, ids)
  const leader = snapshots.find(snapshot => snapshot.kfId === options.leaderId)
  if (!leader) return null
  // An already-invalid group spanning beyond the duration cannot fit without
  // changing spacing. Leave it untouched rather than silently compressing keys.
  const times = snapshots.map(snapshot => snapshot.originalMs)
  if (Math.max(...times) - Math.min(...times) > options.timeline.durationMs) return null
  return new DopeSheetDragSession(options, leader, snapshots)
}
