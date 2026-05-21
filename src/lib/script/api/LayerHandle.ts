// ── LayerHandle (BL-76) ───────────────────────────────────────────────────────
// Script-facing wrapper around a single layer id. Property setters translate to
// makeUpdateLayerCmd; key() translates to makeAddKfCmd. All mutations flow through
// the ScriptHost so they get batched into one undo step.

import type { Layer, Keyframe, AnimatableValue } from '../../types'
import type { ScriptHost } from '../types'
import type { EditorCommand } from '../../editor/commands-keyframe'
import { makeUpdateLayerCmd } from '../../editor/commands-layer'
import { upsertKeyframe, removeKf } from '../../timeline/keyframeOps'
import { nextKfId } from '../../defaults'

/** Internal context shared by SceneAPI + handles. */
export interface ApiContext {
  host: ScriptHost
  /** Resolve the timeline a keyframe should be written to (first timeline). */
  resolveTimelineId(): string | undefined
}

export class LayerHandle {
  constructor(
    public readonly id: string,
    private readonly ctx: ApiContext,
  ) {}

  // ── Identity ────────────────────────────────────────────────────────────────

  private _layer(): Layer {
    const layer = this.ctx.host.getScene().layers.find((l) => l.id === this.id)
    if (!layer) throw new Error(`Layer '${this.id}' no longer exists`)
    return layer
  }

  get name(): string { return this._layer().name }
  get type(): string { return this._layer().type }

  // ── Generic patch ─────────────────────────────────────────────────────────────

  /** Apply a raw Partial<Layer> patch (escape hatch for advanced edits). */
  set(patch: Partial<Layer>): this {
    const prev = this._layer()
    this.ctx.host.applyCommand(makeUpdateLayerCmd(this.id, patch, prev))
    return this
  }

  private _patchTransform(delta: Partial<Layer['transform']>): void {
    const prev = this._layer()
    this.ctx.host.applyCommand(
      makeUpdateLayerCmd(this.id, { transform: { ...prev.transform, ...delta } }, prev),
    )
  }

  // ── Position ────────────────────────────────────────────────────────────────

  get pos(): [number, number] {
    const t = this._layer().transform
    return [t.x, t.y]
  }
  set pos(xy: [number, number]) {
    this._patchTransform({ x: xy[0], y: xy[1] })
  }

  // ── Opacity ─────────────────────────────────────────────────────────────────

  get opacity(): number { return this._layer().opacity }
  set opacity(v: number) {
    const prev = this._layer()
    this.ctx.host.applyCommand(makeUpdateLayerCmd(this.id, { opacity: v }, prev))
  }

  // ── Rotation (degrees) ────────────────────────────────────────────────────────

  get rotation(): number { return this._layer().transform.rotationDeg }
  set rotation(deg: number) { this._patchTransform({ rotationDeg: deg }) }

  // ── Scale ───────────────────────────────────────────────────────────────────

  get scale(): [number, number] {
    const t = this._layer().transform
    return [t.scaleX, t.scaleY]
  }
  set scale(s: [number, number]) {
    this._patchTransform({ scaleX: s[0], scaleY: s[1] })
  }

  // ── Size ────────────────────────────────────────────────────────────────────

  get size(): [number, number] {
    const sz = this._layer().size
    return sz ? [sz.width, sz.height] : [0, 0]
  }
  set size(s: [number, number]) {
    const prev = this._layer()
    this.ctx.host.applyCommand(
      makeUpdateLayerCmd(this.id, { size: { width: s[0], height: s[1] } }, prev),
    )
  }

  // ── Fill colour ───────────────────────────────────────────────────────────────

  get fill(): string | undefined {
    return this._layer().style?.fill?.color
  }
  set fill(color: string | undefined) {
    if (color == null) return
    const prev = this._layer()
    const style = {
      ...prev.style,
      fill: { ...(prev.style?.fill ?? { type: 'solid' as const }), type: 'solid' as const, color },
    }
    this.ctx.host.applyCommand(makeUpdateLayerCmd(this.id, { style }, prev))
  }

  // ── Keyframe ──────────────────────────────────────────────────────────────────

  /**
   * Add a keyframe: handle.key('opacity', 600, 1).
   * `prop` is the dot-path within the layer (e.g. 'opacity', 'transform.x').
   * Writes to the scene's first timeline.
   */
  key(prop: string, timeMs: number, value: AnimatableValue): this {
    const timelineId = this.ctx.resolveTimelineId()
    if (!timelineId) {
      throw new Error('No timeline exists — cannot add keyframe. Create a timeline first.')
    }
    const target = `layers.${this.id}.${prop}`
    const kf: Keyframe = {
      id: nextKfId(),
      timeMs,
      value,
      easing: { type: 'linear' },
    }
    // makeAddKfCmd only writes to an EXISTING track. Authoring scripts target
    // fresh properties, so we ensure the track exists first (mirrors
    // autoKeyframe.ts), then upsert. Undo removes the keyframe.
    const cmd: EditorCommand = {
      label: 'Script Keyframe',
      execute: (scene) => {
        const tl = scene.timelines.find((t) => t.id === timelineId)
        if (!tl) return scene
        const hasTrack = tl.tracks.some((t) => t.target === target)
        const withTrack = hasTrack ? scene : {
          ...scene,
          timelines: scene.timelines.map((t) =>
            t.id !== timelineId ? t : { ...t, tracks: [...t.tracks, { target, keyframes: [] }] },
          ),
        }
        return upsertKeyframe(withTrack, timelineId, target, kf)
      },
      undo: (scene) => removeKf(scene, timelineId, target, kf.id),
    }
    this.ctx.host.applyCommand(cmd)
    return this
  }
}
