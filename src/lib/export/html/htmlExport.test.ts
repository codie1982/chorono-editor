import { describe, it, expect } from 'vitest'
import { exportHTML } from './htmlExport'
import type { ChronoScene } from '@/lib/types'

function scene(id = 'demo'): ChronoScene {
  return {
    formatVersion: '1.0.0',
    composition: { id, width: 320, height: 240, durationMs: 1000, frameRate: 60, backgroundColor: '#000' },
    assets: [], layers: [], timelines: [], parameters: [], triggers: [], bindings: [], initialState: {},
  } as unknown as ChronoScene
}

describe('exportHTML', () => {
  it('produces a full HTML document with the composition canvas', () => {
    const { html } = exportHTML(scene())
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html).toContain('<canvas id="chorono" width="320" height="240">')
    expect(html.trimEnd().endsWith('</html>')).toBe(true)
  })

  it('derives the filename from composition id', () => {
    expect(exportHTML(scene('intro')).filename).toBe('intro.html')
  })

  it('references the runtime via CDN script and embeds the scene JSON', () => {
    const { html } = exportHTML(scene())
    expect(html).toContain('<script src="https://unpkg.com/@chorono/runtime')
    expect(html).toContain('id="chorono-scene"')
    expect(html).toContain('new Chorono.ChronoPlayer(')
    expect(html).toContain('new Chorono.CanvasRenderAdapter(')
  })

  it('honors a custom runtime URL', () => {
    const { html } = exportHTML(scene(), { runtimeUrl: 'https://cdn.example.com/r.js' })
    expect(html).toContain('<script src="https://cdn.example.com/r.js">')
  })

  it('autoplay=false renders a single frame instead of play()', () => {
    expect(exportHTML(scene(), { autoplay: false }).html).toContain('player.tick(0);')
    expect(exportHTML(scene(), { autoplay: true }).html).toContain('player.play();')
  })

  it('neutralises </script> inside scene content (no tag breakout)', () => {
    const evil = scene('</script><script>alert(1)</script>')
    const { html } = exportHTML(evil)
    // The embedded JSON must not contain a raw closing script tag.
    const sceneBlock = html.split('id="chorono-scene"')[1]
    expect(sceneBlock).not.toContain('</script><script>alert')
    expect(html).toContain('\\u003c/script\\u003e')
  })
})
