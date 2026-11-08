import type { ChronoScene, Layer, TimelineSettings } from '@/lib/types'
import type { EditorCommand } from '@/lib/editor/commands-keyframe'
import { makeMoveAudioClipCmd, makePatchAudioClipCmd, makeTrimAudioClipCmd } from '@/lib/editor/commands-audio'
import { resolveAudioClipWindow, type AudioClipWindow } from '@/lib/audio/audioClip'
import { computeTickIntervalMs } from '@/lib/timeline/coordinates'

export type AudioClipGestureKind = 'move' | 'trimStart' | 'trimEnd' | 'fadeIn' | 'fadeOut'
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))
export function audioGestureEdge(range: AudioClipWindow, kind: AudioClipGestureKind): number {
  if (kind === 'trimEnd') return range.endMs
  if (kind === 'fadeIn') return clamp(range.fadeStartMs + range.fadeInMs, range.startMs, range.endMs)
  if (kind === 'fadeOut') return clamp(range.fadeEndMs - range.fadeOutMs, range.startMs, range.endMs)
  return range.startMs
}
export function audioGestureCommand(layer: Layer, range: AudioClipWindow, kind: AudioClipGestureKind,
  deltaMs: number, durationMs: number, timelineId?: string): EditorCommand {
  const options = { timelineId }
  if (kind === 'move') return makeMoveAudioClipCmd(layer.id,
    clamp(range.startMs + deltaMs, 0, Math.max(0, durationMs - range.durationMs)), options)
  if (kind === 'trimStart') return makeTrimAudioClipCmd(layer.id, { startMs:
    clamp(range.startMs + deltaMs, Math.max(0, range.startMs - range.sourceOffsetMs), range.endMs - 1) }, options)
  if (kind === 'trimEnd') return makeTrimAudioClipCmd(layer.id, { endMs:
    clamp(range.endMs + deltaMs, range.startMs + 1, Math.min(durationMs,
      layer.audio?.loop || range.sourceDurationMs === undefined ? Infinity : range.startMs + range.sourceDurationMs - range.sourceOffsetMs)) }, options)
  if (kind === 'fadeIn') return makePatchAudioClipCmd(layer.id, { fadeInMs:
    clamp(audioGestureEdge(range, kind) - range.startMs + deltaMs, 0, range.durationMs) }, options)
  return makePatchAudioClipCmd(layer.id, { fadeOutMs:
    clamp(range.endMs - audioGestureEdge(range, kind) - deltaMs, 0, range.durationMs) }, options)
}

interface Options {
  scene: ChronoScene; layerId: string; kind: AudioClipGestureKind; startX: number; pixelsPerMs: number;
  durationMs: number; timelineId?: string; settings: TimelineSettings; frameRate: number;
  onBegin: () => void; onPreview: (scene: ChronoScene) => void;
  onCommit: (command: EditorCommand) => void; onCancel: () => void;
}
/** One snapshot powers preview and release. Commands keep source trim and
 * gain automation semantics identical between the editor and MCP. */
export class AudioClipGestureSession {
  private active = true
  private moved = false
  private readonly layer: Layer
  private readonly range: AudioClipWindow
  private readonly fixedTargets: number[]
  constructor(private options: Options) {
    this.layer = options.scene.layers.find(layer => layer.id === options.layerId)!
    const asset = options.scene.assets.find(asset => asset.id === this.layer.audio!.assetId)
    this.range = resolveAudioClipWindow(this.layer, asset?.durationMs, options.durationMs)
    const timeline = options.scene.timelines.find(item => item.id === options.timelineId)
    const targets = [0, options.durationMs, timeline?.workAreaInMs, timeline?.workAreaOutMs].filter((t): t is number => t != null)
    if (options.settings.snapToMarkers) targets.push(...(timeline?.markers ?? []).map(marker => marker.timeMs))
    if (options.settings.snapToKeyframes) {
      for (const track of timeline?.tracks ?? []) targets.push(...track.keyframes.map(key => key.timeMs))
      for (const layer of options.scene.layers) if (layer.type === 'audio' && layer.id !== this.layer.id
        && (!layer.audio?.timelineId || layer.audio.timelineId === options.timelineId)) {
        const range = resolveAudioClipWindow(layer, options.scene.assets.find(asset => asset.id === layer.audio?.assetId)?.durationMs, options.durationMs)
        targets.push(range.startMs, range.endMs)
      }
    }
    this.fixedTargets = targets
    options.onBegin()
  }
  private resolve(clientX: number, bypassSnap: boolean) {
    const { options, range } = this
    const edge = audioGestureEdge(range, options.kind)
    let intended = edge + (clientX - options.startX) / options.pixelsPerMs
    if (options.settings.snapEnabled && !bypassSnap) {
      const targets = [...this.fixedTargets]
      if (options.settings.snapToFrame && options.frameRate > 0) {
        const frame = 1000 / options.frameRate
        targets.push(Math.round(intended / frame) * frame)
      }
      if (options.settings.snapToGrid) {
        const step = computeTickIntervalMs(options.durationMs * options.pixelsPerMs, options.durationMs)
        targets.push(Math.round(intended / step) * step)
      }
      let best = 8 / options.pixelsPerMs
      let snapped = intended
      for (const target of targets) if (Math.abs(intended - target) <= best) { best = Math.abs(intended - target); snapped = target }
      intended = snapped
    }
    const command = audioGestureCommand(this.layer, range, options.kind, intended - edge, options.durationMs, options.timelineId)
    const scene = command.execute(options.scene)
    const next = scene.layers.find(layer => layer.id === this.layer.id)!
    const nextRange = resolveAudioClipWindow(next, range.sourceDurationMs, options.durationMs)
    const changed = options.kind === 'fadeIn' ? nextRange.fadeInMs !== range.fadeInMs
      : options.kind === 'fadeOut' ? nextRange.fadeOutMs !== range.fadeOutMs
      : nextRange.startMs !== range.startMs || nextRange.endMs !== range.endMs || nextRange.sourceOffsetMs !== range.sourceOffsetMs
    return { command, scene, changed }
  }
  move(clientX: number, bypassSnap = false) {
    if (!this.active || (!this.moved && Math.abs(clientX - this.options.startX) < 3)) return null
    this.moved = true
    const result = this.resolve(clientX, bypassSnap)
    this.options.onPreview(result.scene)
    return result
  }
  finish(clientX: number, bypassSnap = false) {
    if (!this.active) return
    const result = this.move(clientX, bypassSnap)
    this.active = false
    if (result?.changed) this.options.onCommit(result.command)
    else this.options.onCancel()
  }
  cancel() { if (this.active) { this.active = false; this.options.onCancel() } }
}
export function createAudioClipGesture(options: Options): AudioClipGestureSession | null {
  const layer = options.scene.layers.find(layer => layer.id === options.layerId)
  if (!layer?.audio || layer.locked || !(options.pixelsPerMs > 0)) return null
  return new AudioClipGestureSession(options)
}
