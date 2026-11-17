/** The announcement is deliberately version-pinned. Updating the app without
 * new notes cannot silently replay old release content. */
export const featuredReleaseNotes = {
  version: '0.4.0',
  title: 'Spline modeling and editor precision',
  url: 'https://github.com/codie1982/chorono-editor/releases/tag/v0.4.0',
  turkishUrl: 'https://github.com/codie1982/chorono-editor/blob/v0.4.0/docs/tr/releases/v0.4.0.md',
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
