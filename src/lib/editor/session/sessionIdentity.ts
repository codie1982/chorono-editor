export const SESSION_INDEX_PREFIX = 'chorono.sessions.v1.'
export const SLOT_KEY = 'chorono.editor-recovery.v1.slot'

/** Logical session IDs survive project save/open and reload. Recovery slots
 * distinguish concurrent tabs of the same session without changing file names. */
export function validSessionId(value: unknown): value is string { return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value) }
/** Partition checkpoints by logical project and private tab slot; reject unsafe IDs. */
export function sessionRecordKey(sessionId: string, slotId: string): string {
  if (!validSessionId(sessionId) || !validSessionId(slotId)) throw new Error('Invalid session or slot ID.')
  return `${sessionId}__${slotId}`
}
/** Flat browser downloads cannot select subfolders. The same ID used by folder
 * sessions/<id>/ is appended to the basename, preserving the extension. */
export function sessionOutputFilename(filename: string, sessionId?: string | null): string {
  if (!sessionId) return filename
  if (!validSessionId(sessionId)) throw new Error('Invalid output session ID.')
  const clean = filename.replace(/[\\/:\u0000-\u001f]/g, '_')
  const dot = clean.lastIndexOf('.'), base = dot > 0 ? clean.slice(0, dot) : clean, extension = dot > 0 ? clean.slice(dot) : ''
  return `${base}__session_${sessionId}${extension}`
}
