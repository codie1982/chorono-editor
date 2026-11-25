/** Editor requirements are CSS viewport pixels, not hardware resolution or
 * user-agent/device names. A tablet with a fine pointer can qualify; a large
 * touch-only screen cannot yet use the desktop context-menu/handle workflow. */
export const EDITOR_DISPLAY = { minWidth: 1280, minHeight: 720 } as const
export interface EditorDisplaySnapshot { width: number; height: number; finePointer: boolean }
export type EditorDisplayState = 'supported' | 'too-small' | 'pointer-required'

/** Pure capability policy. Invalid/missing dimensions conservatively block
 * startup. Browser zoom naturally changes CSS pixels; zoom is never disabled. */
export function editorDisplayState(snapshot: EditorDisplaySnapshot): EditorDisplayState {
  if (!Number.isFinite(snapshot.width) || !Number.isFinite(snapshot.height)
    || snapshot.width < EDITOR_DISPLAY.minWidth || snapshot.height < EDITOR_DISPLAY.minHeight) return 'too-small'
  return snapshot.finePointer ? 'supported' : 'pointer-required'
}
