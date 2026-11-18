/** Runtime states shared by typed bake adapters. A preview never mutates the
 * source document; only the explicit committing state may publish an artifact. */
export type BakeJobStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'preview-ready'
  | 'committing'
  | 'completed'
  | 'cancelled'
  | 'stale'
  | 'failed'

/** Serializable identity recorded with a prepared bake. `revision` is a source
 * version supplied by the owning adapter, not a cryptographic content hash. */
export interface BakeSourceIdentity {
  kind: string
  ownerId: string
  revision: string | number
}

/** Normalized, monotonic progress for one job. Adapters may name domain phases;
 * the service clamps values to 0..1 and ignores regressions. */
export interface BakeJobProgress {
  value: number
  phase: string
  message: string
}

/** Stable runtime snapshot suitable for `useSyncExternalStore` or a direct
 * subscription. Preview payloads stay outside scene JSON and undo history. */
export interface BakeJobSnapshot<TPreview> {
  readonly id: string
  readonly kind: string
  readonly label: string
  readonly source: BakeSourceIdentity
  readonly status: BakeJobStatus
  readonly progress: BakeJobProgress
  readonly preview?: TPreview
  readonly error?: string
}

/** Capabilities available while an adapter prepares its typed preview. Work
 * must observe `signal`; progress publication has no source side effects. */
export interface BakePreparationContext {
  readonly signal: AbortSignal
  reportProgress(progress: BakeJobProgress): void
}

/** Variable algorithm/backend boundary. Recipes and preview payloads are owned
 * by their feature; the shared service knows only their lifecycle. */
export interface BakeAdapter<TRecipe, TPreview> {
  readonly kind: string
  prepare(recipe: TRecipe, context: BakePreparationContext): Promise<TPreview> | TPreview
}

/** One immutable job request. `isSourceCurrent` must be a read-only comparison
 * against the live owner and may be called before/after asynchronous work. */
export interface BakeJobSpec<TPreview> {
  readonly kind: string
  readonly label: string
  readonly source: BakeSourceIdentity
  readonly documentSignal?: AbortSignal
  readonly isSourceCurrent: () => boolean
  readonly prepare: (context: BakePreparationContext) => Promise<TPreview> | TPreview
}

/** Public control surface for one typed bake. Disposal cancels unpublished work
 * and detaches listeners; it never deletes committed scene data or assets. */
export interface BakeJobHandle<TPreview> {
  readonly getSnapshot: () => BakeJobSnapshot<TPreview>
  readonly subscribe: (listener: () => void) => () => void
  start(): Promise<void>
  cancel(): void
  checkSource(): boolean
  commit(publish: (preview: TPreview) => void): Promise<void>
  dispose(): void
}
