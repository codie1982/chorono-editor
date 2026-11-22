/** Data-only instance. IDs are layer-local and stable across undo/save/clone. */
export interface ModifierRecord {
  readonly id: string
  readonly type: string
  readonly version: 1
  readonly enabled: boolean
  readonly settings: Readonly<Record<string, unknown>>
}
/** Portable ordered recipe. The owning domain defines the source representation.
 * Records contain settings only; runtime instances and buffers never serialize. */
export interface ModifierStackData<TSource> {
  readonly version: 1
  readonly source: TSource
  readonly modifiers: readonly ModifierRecord[]
}
export interface ModifierField {
  readonly key: string
  readonly label: string
  readonly kind: 'number' | 'select' | 'boolean' | 'asset' | 'points' | 'contours'
  readonly min?: number
  readonly max?: number
  readonly step?: number
  readonly unit?: string
  readonly options?: readonly { value: string; label: string }[]
  readonly assetType?: 'meshDeformation'
}
/** General presentation contract. Categories are supplied by the domain;
 * geometry kind/topology, time, renderer and object ownership do not belong here. */
export interface ModifierDescriptor {
  readonly type: string
  readonly label: string
  readonly category: string
  readonly fields: readonly ModifierField[]
  readonly addable: boolean
}
