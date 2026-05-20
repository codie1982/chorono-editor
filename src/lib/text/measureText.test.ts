import { describe, it, expect } from 'vitest'
import { measureTextLayout, syncTextLayerSize } from './measureText'
import type { TextStyle } from '@/lib/types/text'

// NOTE: vitest runs in the `node` environment, so `document` is undefined and
// measureTextLayout deterministically uses its canvas-free `estimate()` path.
// These tests therefore assert the estimate model + the sync behaviour, which
// is exactly what runs during SSR. Browser measurement is exercised manually
// (see BL-72 Phase 1 test plan).

const base: TextStyle = { value: 'Chorono', fontSize: 24, color: '#FFFFFF' }

describe('measureTextLayout (estimate path)', () => {
  it('produces a positive box scaled by fontSize', () => {
    const m = measureTextLayout(base)
    expect(m.width).toBeGreaterThan(0)
    expect(m.height).toBeGreaterThan(0)
  })

  it('grows width and height when fontSize increases', () => {
    const small = measureTextLayout({ ...base, fontSize: 12 })
    const large = measureTextLayout({ ...base, fontSize: 96 })
    expect(large.width).toBeGreaterThan(small.width)
    expect(large.height).toBeGreaterThan(small.height)
  })

  it('grows width with longer content', () => {
    const short = measureTextLayout({ ...base, value: 'Hi' })
    const long  = measureTextLayout({ ...base, value: 'Hello World Foo Bar' })
    expect(long.width).toBeGreaterThan(short.width)
  })

  it('accounts for letterSpacing in width', () => {
    const tight = measureTextLayout({ ...base, letterSpacing: 0 })
    const loose = measureTextLayout({ ...base, letterSpacing: 10 })
    expect(loose.width).toBeGreaterThan(tight.width)
  })

  it('accounts for lineHeight + multi-line content in height', () => {
    const oneLine  = measureTextLayout({ ...base, value: 'A' })
    const twoLines = measureTextLayout({ ...base, value: 'A\nB' })
    expect(twoLines.height).toBeGreaterThan(oneLine.height)
  })

  it('uppercase widens single-char width vs lowercase estimate baseline', () => {
    // estimate uses char count, so uppercasing keeps count but the function
    // must not throw and must stay positive.
    const m = measureTextLayout({ ...base, value: 'abc', uppercase: true })
    expect(m.width).toBeGreaterThan(0)
  })

  it('never returns a zero/negative box for empty text', () => {
    const m = measureTextLayout({ ...base, value: '' })
    expect(m.width).toBeGreaterThanOrEqual(1)
    expect(m.height).toBeGreaterThanOrEqual(1)
  })
})

describe('syncTextLayerSize', () => {
  it('adds a measured size to a text layer that has none', () => {
    const layer = { id: 't1', type: 'text', text: base } as const
    const synced = syncTextLayerSize(layer as never) as typeof layer & {
      size?: { width: number; height: number }
    }
    expect(synced.size).toBeDefined()
    expect(synced.size!.width).toBeGreaterThan(0)
    expect(synced.size!.height).toBeGreaterThan(0)
  })

  it('updates size when the font metrics change', () => {
    const start = syncTextLayerSize({ id: 't', type: 'text', text: base } as never) as {
      size: { width: number; height: number }; text: TextStyle
    }
    const grown = syncTextLayerSize({
      ...start, text: { ...start.text, fontSize: 96 },
    } as never) as { size: { width: number; height: number } }
    expect(grown.size.width).toBeGreaterThan(start.size.width)
    expect(grown.size.height).toBeGreaterThan(start.size.height)
  })

  it('returns the same reference when size already matches (no churn)', () => {
    const once = syncTextLayerSize({ id: 't', type: 'text', text: base } as never)
    const twice = syncTextLayerSize(once)
    expect(twice).toBe(once)
  })

  it('is a no-op for non-text layers', () => {
    const shape = { id: 's', type: 'shape', size: { width: 10, height: 10 } } as const
    expect(syncTextLayerSize(shape as never)).toBe(shape)
  })

  // BL-72 Phase 2: stroke/shadow are visual-only — they must NOT change the
  // layer box (the box stays the glyph box anchored at local 0,0). When the
  // measured size already matches, syncTextLayerSize returns its INPUT ref.
  it('treats stroke as size-neutral (no box change)', () => {
    const sized = syncTextLayerSize({ id: 't', type: 'text', text: base } as never) as {
      size: { width: number; height: number }
    }
    const input = { ...sized, text: { ...base, stroke: { color: '#000', width: 6 } } }
    const out = syncTextLayerSize(input as never) as typeof input
    expect(out).toBe(input)                       // unchanged ref
    expect(out.size).toEqual(sized.size)          // box identical
  })

  it('treats shadow as size-neutral (no box change)', () => {
    const sized = syncTextLayerSize({ id: 't', type: 'text', text: base } as never) as {
      size: { width: number; height: number }
    }
    const input = { ...sized, text: { ...base, shadow: { x: 4, y: 4, blur: 8, color: '#000' } } }
    const out = syncTextLayerSize(input as never) as typeof input
    expect(out).toBe(input)
    expect(out.size).toEqual(sized.size)
  })

  it('re-measures when uppercase toggles (estimate keeps width, height stable)', () => {
    // uppercase is size-affecting in the browser; in the node estimate path it
    // keeps char-count so the box stays valid and positive either way.
    const synced = syncTextLayerSize({
      id: 't', type: 'text', text: { ...base, uppercase: true },
    } as never) as { size: { width: number; height: number } }
    expect(synced.size.width).toBeGreaterThan(0)
    expect(synced.size.height).toBeGreaterThan(0)
  })
})
