// ── LayerHandle (BL-76) ───────────────────────────────────────────────────────
// Script-facing wrapper around a single layer id. Property setters translate to
// makeUpdateLayerCmd; key() translates to makeAddKfCmd. All mutations flow through
// the ScriptHost so they get batched into one undo step.

import type {
  Layer, Keyframe, AnimatableValue, EasingType,
  FontWeight, FontStyle, TextAlign, ShapeParams, DragConfig, DragAxis,
} from '../../types'
import type { ParticleEmitterData } from '../../particles/types'
import type { ScriptHost } from '../types'
import type { EditorCommand } from '../../editor/commands-keyframe'
import { makeUpdateLayerCmd } from '../../editor/commands-layer'
import { upsertKeyframe, removeKf, ensureLayerInTimeline } from '../../timeline/keyframeOps'
import { nextKfId } from '../../defaults'

const VALID_EASINGS: ReadonlySet<EasingType> = new Set<EasingType>([
  'linear', 'hold', 'easeIn', 'easeOut', 'easeInOut',
])

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

  // ── Text ────────────────────────────────────────────────────────────────────

  get text(): string { return this._layer().text?.value ?? '' }
  set text(content: string) {
    const prev = this._layer()
    const text = { fontSize: 24, color: '#FFFFFF', ...prev.text, value: content }
    this.ctx.host.applyCommand(makeUpdateLayerCmd(this.id, { text }, prev))
  }

  /** Typography options: handle.font({ family: 'Inter', weight: '700', size: 48 }). */
  font(opts: {
    family?: string; weight?: FontWeight; style?: FontStyle; size?: number
    align?: TextAlign; letterSpacing?: number; uppercase?: boolean
    underline?: boolean; color?: string
  }): this {
    const prev = this._layer()
    const text = {
      value: '', fontSize: 24, color: '#FFFFFF', ...prev.text,
      ...(opts.family        != null ? { fontFamily:    opts.family }        : {}),
      ...(opts.weight        != null ? { fontWeight:    opts.weight }        : {}),
      ...(opts.style         != null ? { fontStyle:     opts.style }         : {}),
      ...(opts.size          != null ? { fontSize:      opts.size }          : {}),
      ...(opts.align         != null ? { textAlign:     opts.align }         : {}),
      ...(opts.letterSpacing != null ? { letterSpacing: opts.letterSpacing } : {}),
      ...(opts.uppercase     != null ? { uppercase:     opts.uppercase }     : {}),
      ...(opts.underline     != null ? { underline:     opts.underline }     : {}),
      ...(opts.color         != null ? { color:         opts.color }         : {}),
    }
    this.ctx.host.applyCommand(makeUpdateLayerCmd(this.id, { text }, prev))
    return this
  }

  // ── Stroke ──────────────────────────────────────────────────────────────────

  /** Set the shape stroke: handle.stroke({ color: '#000', width: 2 }). */
  stroke(opts: { color?: string; width?: number; opacity?: number }): this {
    const prev = this._layer()
    const style = {
      ...prev.style,
      stroke: {
        color: '#000000', width: 1, ...prev.style?.stroke,
        ...(opts.color   != null ? { color:   opts.color }   : {}),
        ...(opts.width   != null ? { width:   opts.width }   : {}),
        ...(opts.opacity != null ? { opacity: opts.opacity } : {}),
      },
    }
    this.ctx.host.applyCommand(makeUpdateLayerCmd(this.id, { style }, prev))
    return this
  }

  // ── Corner radius ─────────────────────────────────────────────────────────────

  get cornerRadius(): number { return this._layer().style?.cornerRadius ?? 0 }
  set cornerRadius(r: number) {
    const prev = this._layer()
    const style = { ...prev.style, cornerRadius: r }
    this.ctx.host.applyCommand(makeUpdateLayerCmd(this.id, { style }, prev))
  }

  // ── Shape params ──────────────────────────────────────────────────────────────

  /** Set a shape geometry param: handle.shapeParam('sides', 6). */
  shapeParam(name: keyof Omit<ShapeParams, 'kind'>, value: number): this {
    const prev = this._layer()
    const kind = prev.shapeParams?.kind ?? prev.shapeKind ?? 'rect'
    const shapeParams = { kind, ...prev.shapeParams, [name]: value } as ShapeParams
    this.ctx.host.applyCommand(makeUpdateLayerCmd(this.id, { shapeParams }, prev))
    return this
  }

  // ── Blend mode ────────────────────────────────────────────────────────────────

  get blendMode(): GlobalCompositeOperation {
    return this._layer().blendMode ?? 'source-over'
  }
  set blendMode(mode: GlobalCompositeOperation) {
    const prev = this._layer()
    this.ctx.host.applyCommand(makeUpdateLayerCmd(this.id, { blendMode: mode }, prev))
  }

  // ── Parent (scene graph) ──────────────────────────────────────────────────────

  /** Reparent under a group: handle.parent(groupHandle) or handle.parent(null) to detach. */
  parent(p: LayerHandle | string | null): this {
    const prev = this._layer()
    const parentId = p == null ? undefined : (typeof p === 'string' ? p : p.id)
    this.ctx.host.applyCommand(makeUpdateLayerCmd(this.id, { parentId }, prev))
    return this
  }

  // ── Interactivity ─────────────────────────────────────────────────────────────

  /**
   * Make this layer interactive: handle.interactive({ tappable: true }) or
   * handle.interactive({ draggable: true, axis: 'x', setsParameter: 'angle' }).
   */
  interactive(opts: {
    tappable?: boolean; draggable?: boolean
    axis?: DragAxis; range?: number; followCursor?: boolean
    setsParameter?: string; scrubsTimeline?: string
  }): this {
    const prev = this._layer()
    const patch: Partial<Layer> = {}
    if (opts.tappable  != null) patch.tappable  = opts.tappable
    if (opts.draggable != null) patch.draggable = opts.draggable
    const drag: DragConfig = {
      ...prev.dragConfig,
      ...(opts.axis          != null ? { axis:           opts.axis }          : {}),
      ...(opts.range         != null ? { range:          opts.range }         : {}),
      ...(opts.followCursor  != null ? { followCursor:   opts.followCursor }  : {}),
      ...(opts.setsParameter != null ? { setsParameter:  opts.setsParameter } : {}),
      ...(opts.scrubsTimeline!= null ? { scrubsTimeline: opts.scrubsTimeline }: {}),
    }
    if (Object.keys(drag).length) patch.dragConfig = drag
    this.ctx.host.applyCommand(makeUpdateLayerCmd(this.id, patch, prev))
    return this
  }

  // ── Motion path ───────────────────────────────────────────────────────────────

  /** Make this layer follow a path layer: handle.followPath(pathId, { orientToPath: true }). */
  followPath(pathLayerId: string, opts?: {
    progress?: number; orientToPath?: boolean
    rotationOffset?: number; perpendicularOffset?: number
  }): this {
    const prev = this._layer()
    const followPath = {
      pathLayerId,
      progress: opts?.progress ?? 0,
      ...(opts?.orientToPath != null ? { orientToPath: opts.orientToPath } : {}),
      ...(opts?.rotationOffset != null ? { rotationOffset: opts.rotationOffset } : {}),
      ...(opts?.perpendicularOffset != null ? { perpendicularOffset: opts.perpendicularOffset } : {}),
    }
    this.ctx.host.applyCommand(makeUpdateLayerCmd(this.id, { followPath }, prev))
    return this
  }

  // ── Particles ─────────────────────────────────────────────────────────────────

  /**
   * Patch the particle emitter config (only valid on a particleEmitter layer).
   * Merges shallowly at the emitter / particle sub-object level:
   *   handle.configureParticles({ emitter: { maxParticles: 200, loop: true } }).
   */
  configureParticles(config: Partial<ParticleEmitterData>): this {
    const prev = this._layer()
    const base = prev.particleEmitter
    if (!base) return this
    const merged: ParticleEmitterData = {
      ...base, ...config,
      emitter:  { ...base.emitter,  ...config.emitter },
      particle: { ...base.particle, ...config.particle },
    }
    this.ctx.host.applyCommand(makeUpdateLayerCmd(this.id, { particleEmitter: merged }, prev))
    return this
  }

  // ── Keyframe ──────────────────────────────────────────────────────────────────

  /**
   * Add a keyframe: handle.key('opacity', 600, 1, 'easeInOut').
   * `prop` is the dot-path within the layer (e.g. 'opacity', 'transform.x').
   * `easing` is optional (default 'linear'); invalid values fall back to 'linear'.
   * Writes to the scene's first timeline.
   */
  key(prop: string, timeMs: number, value: AnimatableValue, easing: EasingType = 'linear'): this {
    const easingType: EasingType = VALID_EASINGS.has(easing) ? easing : 'linear'
    // Fall back to a deterministic 'main' timeline so key() works even when no
    // timeline was created yet (BL-78 ordering fix: previously this threw and
    // aborted the whole script — common when the AI orders run_script before
    // create_timeline). The command below auto-creates the timeline if missing.
    const timelineId = this.ctx.resolveTimelineId() ?? 'main'
    const target = `layers.${this.id}.${prop}`
    const kf: Keyframe = {
      id: nextKfId(),
      timeMs,
      value,
      easing: { type: easingType },
    }
    // Ensure timeline AND track exist before upsert (mirrors autoKeyframe.ts).
    const cmd: EditorCommand = {
      label: 'Script Keyframe',
      execute: (scene) => {
        let s = scene
        // 1. Ensure the timeline exists (auto-create a sensible default).
        if (!s.timelines.some((t) => t.id === timelineId)) {
          s = {
            ...s,
            timelines: [
              ...s.timelines,
              {
                id: timelineId, mode: '2danimation',
                durationMs: Math.max(1000, Math.ceil(timeMs / 1000) * 1000),
                autoplay: true, loop: false, tracks: [], layerIds: [],
              },
            ],
          }
        } else if (timeMs > 0) {
          // Grow duration to cover late keyframes on the existing default tl.
          s = {
            ...s,
            timelines: s.timelines.map((t) =>
              t.id === timelineId && timeMs > t.durationMs
                ? { ...t, durationMs: Math.ceil(timeMs / 1000) * 1000 }
                : t,
            ),
          }
        }
        // 2. Ensure the track exists.
        const tl = s.timelines.find((t) => t.id === timelineId)!
        if (!tl.tracks.some((t) => t.target === target)) {
          s = {
            ...s,
            timelines: s.timelines.map((t) =>
              t.id !== timelineId ? t : { ...t, tracks: [...t.tracks, { target, keyframes: [] }] },
            ),
          }
        }
        // 3. Ensure the layer shows in the dope sheet (B4).
        s = ensureLayerInTimeline(s, timelineId, this.id)
        // 4. Upsert the keyframe.
        return upsertKeyframe(s, timelineId, target, kf)
      },
      undo: (scene) => removeKf(scene, timelineId, target, kf.id),
    }
    this.ctx.host.applyCommand(cmd)
    return this
  }
}
