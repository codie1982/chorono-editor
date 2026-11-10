import { SourceAccessError } from './SourceAccessError'

const identities = new WeakMap<AbortSignal, string>()
export interface SourceAuthorization { readonly documentEpoch: string; readonly expectedRevision: number }

/** Reuse EditorDocumentLifetime's runtime identity, independent of scene ids or
 * serialized content. Reset/remount changes its signal; ordinary edits/undo do
 * not. Weak keys avoid retaining old documents. No identity enters scene JSON. */
export function editorDocumentEpoch(editor: { getDocumentSignal(): AbortSignal }): string {
  const signal = editor.getDocumentSignal()
  if (signal.aborted) throw new SourceAccessError('SOURCE_DOCUMENT_CHANGED')
  let identity = identities.get(signal)
  if (!identity) { identity = crypto.randomUUID(); identities.set(signal, identity) }
  return identity
}

/** Browser-side final source gate. The broker supplies this authorization in
 * its private job envelope, never in a model-settable tool argument. */
export function assertEditorSourceAuthorization(authorization: SourceAuthorization | undefined,
  current: { documentEpoch: string; revision: number; transactionActive: boolean }): void {
  if (!authorization) throw new SourceAccessError('SOURCE_READ_REQUIRED')
  if (current.transactionActive) throw new SourceAccessError('SOURCE_EDITOR_BUSY')
  if (authorization.documentEpoch !== current.documentEpoch) throw new SourceAccessError('SOURCE_DOCUMENT_CHANGED')
  if (authorization.expectedRevision !== current.revision) throw new SourceAccessError('SOURCE_REVISION_CONFLICT')
}
