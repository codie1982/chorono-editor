import type { ChronoScene, Layer } from '../../types'
import type { Model3DData } from '../../model3d/types'
import type { ModelInventory } from '../../model3d/content/types'
import { assertInstanceInventory } from '../../model3d/content/assertInstanceInventory'
import { modelAssetIds } from '../../model3d/content/modelContent'
import { emptyScene, newTimeline } from '../../defaults'
import { newModelLayer, validateModel } from '../../model3d/source/modelDefaults'
import { assertModelContentAnimation, MODEL_CONTENT_ROOT, type ModelContentAnimation, type ModelContentClip } from '../../model3d/animation/ModelContentAnimation'
import { assertModelClipOwnership } from '../../model3d/animation/modelClipOwnership'
import { remapTrackTarget } from '../../timeline/TrackTargetParser'
import type { EditorCommand } from '../commands-keyframe'

/** Owns the projection/conversion boundary for one model detail draft. The main
 * source is borrowed, never copied into the local Timeline. Private targets use
 * a stable local root on disk and the real owner ID only while editing. Main
 * identity/parent/outer animation/assets/authoring remain outside this scope.
 * No GPU/decoder handles or runtime clocks are retained here.
 */
export class ModelClipDraft {
  private readonly inventories = new Map<string, ModelInventory>()
  /** Bind borrowed immutable metadata while its UI media pin is alive. No native handle is retained. */
  registerInventory(assetId: string, inventory: ModelInventory): void { this.inventories.set(assetId, inventory) }
  /** Final Apply requires all revision-bound references to have been decoded and checked. */
  assertPrepared(data: Model3DData): void {
    for (const instance of Object.values(data.content?.instances ?? {})) {
      const inventory = this.inventories.get(instance.assetId)
      if (!inventory) throw new Error('Wait for every 3D asset before applying content changes.')
      assertInstanceInventory(instance, inventory)
    }
  }
  readonly initial: ChronoScene
  readonly layer: Layer

  constructor(readonly source: ChronoScene, readonly owner: Layer) {
    if (!owner.model3d) throw new Error('Missing model content.')
    const { animation: oldAnimation, ...placement } = owner.model3d
    const animation = owner.model3d.version >= 2 ? oldAnimation : undefined
    const neutral = newModelLayer(owner.id, placement.assetId, owner.name)
    this.layer = { ...neutral, transform: { ...neutral.transform, x: 0, y: 0 }, size: owner.size,
      model3d: { ...placement, version: placement.modeling ? 4 : placement.content ? 3 : 1 } }
    this.initial = { ...emptyScene(), composition: { ...source.composition, width: owner.size!.width, height: owner.size!.height },
      assets: source.assets, layers: [this.layer],
      timelines: (animation?.clips ?? []).map(clip => ({ ...clip, ...(clip.layerIds ? { layerIds: clip.layerIds.map(() => owner.id) } : {}), tracks: clip.tracks.map(track => ({ ...track,
        target: remapTrackTarget(track.target, { [MODEL_CONTENT_ROOT]: owner.id }) })) })),
      initialState: { activeClipId: animation?.activeClipId ?? null } }
  }

  /** Validate only the private layer's content fields. This is distinct from
   * ItemDetailSession.validate, which continues to guard static main-layer edits.
   */
  validateLayer(next: Layer): void {
    for (const key of Array.from(new Set([...Object.keys(this.layer), ...Object.keys(next)])) as (keyof Layer)[]) {
      if (key !== 'model3d' && JSON.stringify(next[key]) !== JSON.stringify(this.layer[key])) throw new Error(`The model content draft cannot change ${key}.`)
    }
    if (!next.model3d || ![1, 3, 4].includes(next.model3d.version) || next.model3d.animation || next.model3d.assetId !== this.layer.model3d!.assetId) throw new Error('The detail draft cannot replace a model asset or embed another clip source.')
    validateModel(next.model3d)
    for (const i of Object.values(next.model3d.content?.instances ?? {})) { const inventory = this.inventories.get(i.assetId); if (inventory) assertInstanceInventory(i, inventory) }
  }

  /** Convert a scoped immutable draft back to one model payload. No global
   * Timeline is replaced. Reject foreign fields, targets and clip data before
   * the final source CAS; preserve original unknown model fields/base settings.
   * v1 remains v1 until a clip/content/primitive edit explicitly promotes it;
   * v2 and v4 modeling records are never silently downcast.
   */
  model(draft: ChronoScene): Model3DData {
    for (const key of Array.from(new Set([...Object.keys(this.initial), ...Object.keys(draft)])) as (keyof ChronoScene)[]) {
      if (!['layers', 'timelines', 'initialState', 'authoring'].includes(key) && draft[key] !== this.initial[key]) throw new Error('The model draft changed data outside its content.')
    }
    if (draft.layers.length !== 1 || draft.layers[0].id !== this.owner.id) throw new Error('The model draft changed its owner.')
    this.validateLayer(draft.layers[0])
    if (Object.keys(draft.initialState).some(key => key !== 'activeClipId')) throw new Error('The model draft changed unrelated state.')
    const hasExtendedChannels = draft.timelines.some(timeline => timeline.tracks.some(track =>
      /\.model3d\.(modeling|lighting)\./.test(track.target) || /\.model3d\.content\.(light|environment)\./.test(track.target) || track.target.includes('.materials.')))
    const animation: ModelContentAnimation = { version: hasExtendedChannels ? 2 : this.owner.model3d?.animation?.version ?? 1, activeClipId: draft.initialState.activeClipId as string | null,
      clips: draft.timelines.map(timeline => {
        if (timeline.layerIds?.some(id => id !== this.owner.id)) throw new Error('An internal clip references another layer.')
        return { ...timeline, ...(timeline.layerIds ? { layerIds: timeline.layerIds.map(() => MODEL_CONTENT_ROOT) } : {}), tracks: timeline.tracks.map(track => ({ ...track,
          target: remapTrackTarget(track.target, { [this.owner.id]: MODEL_CONTENT_ROOT }) })) } as ModelContentClip
      }) }
    assertModelContentAnimation(animation, draft.layers[0].model3d)
    if (animation.clips.length && this.owner.model3d!.version === 1 && this.owner.model3d!.animation !== undefined) throw new Error('Existing v1 animation metadata is preserved; convert it explicitly before creating authored clips.')
    const model = { ...this.owner.model3d!, ...draft.layers[0].model3d!,
      ...(draft.layers[0].model3d?.modeling ? { version: 4 as const, ...(animation.clips.length || this.owner.model3d!.animation ? { animation } : {}) }
        : draft.layers[0].model3d?.content ? { version: 3 as const, ...(animation.clips.length || this.owner.model3d!.animation ? { animation } : {}) }
          : animation.clips.length || this.owner.model3d!.version === 2 ? { version: 2 as const, animation } : { version: 1 as const }) }
    validateModel(model)
    assertModelClipOwnership(this.source, { ...this.owner, model3d: model })
    return model
  }
}

/** Scoped private clip lifecycle command; stable prepared IDs survive local
 * undo/redo. Whole source snapshots here contain only one projected owner, not
 * the main scene. Validation happens before publishing; source assets stay borrowed.
 */
export function modelClipCommand(session: ModelClipDraft, label: string, change: (scene: ChronoScene) => ChronoScene): EditorCommand {
  let before: ChronoScene | undefined
  return { label, execute(scene) { const next = change(scene); session.model(next); before = scene; return next }, undo: scene => before ?? scene }
}

/** Prepare a new empty local clip. Creation is explicit and activates this clip;
 * merely opening a model never changes its version or main source/history.
 */
export function addModelClip(session: ModelClipDraft): EditorCommand & { clipId: string } {
  const clip = { ...newTimeline(), id: `clip_${crypto.randomUUID()}`, name: 'Clip',
    durationMs: 1000, autoplay: false, layerIds: [session.owner.id], tracks: [] }
  return { ...modelClipCommand(session, 'Create content clip', scene => ({ ...scene, timelines: [...scene.timelines, { ...clip, name: `Clip ${scene.timelines.length + 1}` }], initialState: { activeClipId: clip.id } })), clipId: clip.id }
}
