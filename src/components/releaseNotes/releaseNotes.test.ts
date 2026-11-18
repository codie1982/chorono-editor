import { describe, expect, it } from 'vitest'
import { claimReleaseNotesDisplay, RELEASE_NOTES_SEEN_KEY } from './releaseNotes'

describe('release notes first display', () => {
  it('claims a release once, then permits a different release once', () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
    expect(claimReleaseNotesDisplay(storage, '0.4.0', '0.4.0')).toBe(true)
    expect(values.get(RELEASE_NOTES_SEEN_KEY)).toBe('0.4.0')
    expect(claimReleaseNotesDisplay(storage, '0.4.0', '0.4.0')).toBe(false)
    expect(claimReleaseNotesDisplay(storage, '0.4.1', '0.4.0')).toBe(false)
    expect(claimReleaseNotesDisplay(storage, '0.5.0', '0.5.0')).toBe(true)
  })

  it('skips automatic display if it cannot persist the one-time marker', () => {
    const storage = { getItem: () => null, setItem: () => { throw new Error('Storage blocked') } }
    expect(claimReleaseNotesDisplay(storage, '0.4.0', '0.4.0')).toBe(false)
  })
})
