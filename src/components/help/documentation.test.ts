import { describe, expect, it } from 'vitest'
import { documentationUrl } from './documentation'

describe('documentationUrl', () => {
  it('keeps a guide heading after editor attribution parameters', () => {
    const url = new URL(documentationUrl('editor/canvas/snapping#add-and-edit-ruler-guides'))

    expect(url.origin).toBe('https://www.chorono.com')
    expect(url.pathname).toBe('/docs/editor/canvas/snapping')
    expect(url.hash).toBe('#add-and-edit-ruler-guides')
    expect(url.searchParams.get('utm_source')).toBe('chorono_editor')
    expect(url.searchParams.get('utm_medium')).toBe('referral')
    expect(url.searchParams.get('utm_campaign')).toBe('editor_help')
  })
})
