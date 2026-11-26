/** The announcement is deliberately version-pinned. Updating the app without
 * new notes cannot silently replay old release content. */
export const featuredReleaseNotes = {
  version: '0.5.0',
  title: 'Mesh2D, physics baking and fracture',
  url: 'https://github.com/codie1982/chorono-editor/releases/tag/v0.5.0',
  turkishUrl: 'https://github.com/codie1982/chorono-editor/blob/v0.5.0/docs/tr/releases/v0.5.0.md',
} as const

export const RELEASE_NOTES_SEEN_KEY = 'chorono.releaseNotes.lastShownVersion'

/**
 * Claim one automatic display per release in this browser origin. The marker
 * is written before opening the dialog, so reloads cannot redisplay it. When
 * persistence is unavailable, the automatic dialog is skipped rather than
 * repeatedly interrupting the user. Manual reopening is independent.
 */
export function claimReleaseNotesDisplay(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  appVersion: string,
  notesVersion: string,
): boolean {
  if (appVersion !== notesVersion) return false
  try {
    if (storage.getItem(RELEASE_NOTES_SEEN_KEY) === notesVersion) return false
    storage.setItem(RELEASE_NOTES_SEEN_KEY, notesVersion)
    return true
  } catch {
    return false
  }
}
