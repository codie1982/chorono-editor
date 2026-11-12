import type { Layer } from '../../types'
import type { PropertyGroup } from '../../registry/PropertySchema'

/** Content authoring capability, independent of React and workspace mode.
 * Fields are complete layer-relative payload roots owned by this adapter;
 * outer transforms, identity, hierarchy and animation never become implicit
 * content edits. Groups use the authoritative layer schema, not a second copy.
 */
export interface ItemDetailAdapter {
  readonly id: string
  readonly label: string
  readonly fields: readonly (keyof Layer)[]
  supports(layer: Layer): boolean
  groups(layer: Layer): PropertyGroup[]
  validate(layer: Layer): void
}

/** Composition-owned capability catalog. Registrations have unique stable IDs;
 * the first matching adapter wins, in registration order. No UI, native handle
 * or source snapshot is retained here. A new content family supplies its own
 * adapter instead of copying the host's draft/commit workflow.
 */
export class ItemDetailRegistry {
  private readonly adapters = new Map<string, ItemDetailAdapter>()

  /** Register one implementation; duplicate IDs fail without replacing callers. */
  register(adapter: ItemDetailAdapter): void {
    if (this.adapters.has(adapter.id)) throw new Error(`Duplicate detail adapter: ${adapter.id}`)
    this.adapters.set(adapter.id, adapter)
  }

  /** Return the first supported capability, or undefined for an unsupported item. */
  find(layer: Layer): ItemDetailAdapter | undefined {
    return Array.from(this.adapters.values()).find(adapter => adapter.supports(layer))
  }
}
