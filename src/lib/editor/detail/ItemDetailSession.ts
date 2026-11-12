import type { ChronoScene, Layer } from '../../types'
import type { EditorCommand } from '../commands-keyframe'
import { makeUpdateLayerCmd } from '../commands-layer'
import { itemDetailRegistry, detailUnavailableReason, detailDrivenReason } from './detailAdapters'
import type { ItemDetailAdapter, ItemDetailRegistry } from './ItemDetailRegistry'

/** One ephemeral draft authorization. Borrows immutable source references;
 * native handles and dense media are owned by existing resource services.
 * The UI uses bounded editor history for its draft and releases it on close.
 * A source commit/reset/undo after opening invalidates Apply conservatively.
 * No JSON/session/history format changes are required by opening a detail.
 */
export class ItemDetailSession {
  readonly id = crypto.randomUUID()
  readonly adapter: ItemDetailAdapter
  readonly layer: Layer
  private closed = false

  constructor(readonly source: ChronoScene, readonly revision: number, readonly document: AbortSignal,
    layerId: string, registry: ItemDetailRegistry = itemDetailRegistry) {
    const layer = source.layers.find(item => item.id === layerId)
    const reason = detailUnavailableReason(layer, registry)
    if (reason || !layer) throw new Error(reason ?? 'Missing detail target.')
    this.layer = layer
    this.adapter = registry.find(layer)!
  }

  /** Require a live, exact document/revision and no competing gesture. A failed
   * check never restores the captured source or discards intervening edits.
   */
  assertCurrent(revision: number, document: AbortSignal, transaction = false): void {
    if (this.closed || this.document.aborted || document !== this.document) throw new Error('The detail document is no longer active.')
    if (revision !== this.revision) throw new Error('The scene changed while this detail was open. Cancel and reopen it before applying.')
    if (transaction) throw new Error('Finish the current pointer gesture first.')
  }

  /** Restrict candidate changes to declared content roots. Validate authoritative
   * numeric limits and refuse driven roots; callers cannot sneak in reparent,
   * identity, asset replacement, transform or new animation via a draft edit.
   */
  validate(next: Layer): Partial<Layer> {
    if (this.closed || this.document.aborted) throw new Error('Detail session is closed.')
    const fields = this.adapter.fields, patch: Partial<Layer> = {}
    for (const key of Array.from(new Set([...Object.keys(this.layer), ...Object.keys(next)] as (keyof Layer)[]))) {
      if (Object.is(this.layer[key], next[key]) || JSON.stringify(this.layer[key]) === JSON.stringify(next[key])) continue
      if (!fields.includes(key)) throw new Error(`The detail editor cannot change ${key}.`)
      const reason = detailDrivenReason(this.source, this.layer, key)
      if (reason) throw new Error(reason)
      Object.assign(patch, { [key]: next[key] })
    }
    if (next.model3d?.assetId !== this.layer.model3d?.assetId) throw new Error('Replacing a source asset is a separate import operation.')
    this.adapter.validate(next)
    return patch
  }

  /** Build one source command from a scoped draft. The synchronous scene CAS is
   * repeated in execute; Undo delegates to the existing layer command. The main
   * editor stamps only the final changed fields as human edits. No-op Apply
   * returns null and creates no history entry.
   */
  prepareApply(draft: ChronoScene, current: ChronoScene, revision: number, document: AbortSignal): EditorCommand | null {
    this.assertCurrent(revision, document)
    if (draft.layers.length !== this.source.layers.length || draft.layers.some((item, index) => item.id !== this.source.layers[index]?.id
      || item.id !== this.layer.id && item !== this.source.layers[index])) throw new Error('The draft changed another scene item.')
    for (const key of Object.keys(this.source) as (keyof ChronoScene)[]) {
      if (key !== 'layers' && key !== 'authoring' && draft[key] !== this.source[key]) throw new Error('The draft changed data outside this content.')
    }
    const next = draft.layers.find(item => item.id === this.layer.id)
    if (!next || current.layers.find(item => item.id === this.layer.id) !== this.layer) throw new Error('The detail source changed or was removed.')
    const patch = this.validate(next)
    if (!Object.keys(patch).length) return null
    const native = makeUpdateLayerCmd(this.layer.id, patch, this.layer)
    return { label: `Edit ${this.layer.name} content`,
      execute: scene => {
        if (scene !== current || this.document.aborted || this.closed) throw new Error('The detail source is stale.')
        return native.execute(scene)
      }, undo: native.undo }
  }

  /** Invalidate once. Borrowed immutable source is released with this owner. */
  close(): void { this.closed = true }
}
