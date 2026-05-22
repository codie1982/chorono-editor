import { describe, it, expect } from 'vitest'
import { exportSVG } from './SVGExporter'
import type { ChronoScene, Layer } from '@/lib/types'

function layer(partial: Partial<Layer>): Layer {
  return {
    id: 'l1',
    name: 'Layer',
    type: 'shape',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 },
    opacity: 1,
    ...partial,
  } as Layer
}

function scene(layers: Layer[], bg = '#101010', timelines: unknown[] = []): ChronoScene {
  return {
    formatVersion: '1.0.0',
    composition: { id: 'test', width: 200, height: 100, durationMs: 1000, frameRate: 60, backgroundColor: bg },
    assets: [], layers, timelines, parameters: [], triggers: [], bindings: [], initialState: {},
  } as unknown as ChronoScene
}

// Minimal timeline/track/keyframe helpers for animated-export tests.
function kf(timeMs: number, value: number) {
  return { id: `k${timeMs}`, timeMs, value, easing: { type: 'linear' } }
}
function track(target: string, keyframes: ReturnType<typeof kf>[]) {
  return { target, keyframes }
}
function timeline(tracks: ReturnType<typeof track>[], durationMs = 1000) {
  return { id: 'tl', durationMs, loop: true, tracks }
}

describe('exportSVG — document structure', () => {
  it('emits a well-formed root svg with composition dimensions', () => {
    const { svg } = exportSVG(scene([]))
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain('width="200" height="100"')
    expect(svg).toContain('viewBox="0 0 200 100"')
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
  })

  it('derives the filename from composition id', () => {
    expect(exportSVG(scene([])).filename).toBe('test.svg')
  })

  it('draws a background rect for scene/solid background', () => {
    const { svg } = exportSVG(scene([]), { background: 'scene' })
    expect(svg).toContain('<rect width="200" height="100" fill="#101010"/>')
  })

  it('omits the background rect when transparent', () => {
    const { svg } = exportSVG(scene([]), { background: 'transparent' })
    expect(svg).not.toContain('<rect width="200" height="100"')
  })
})

describe('exportSVG — shapes & style', () => {
  it('converts a rect shape to a <path> with fill', () => {
    const { svg } = exportSVG(scene([
      layer({ type: 'shape', shapeKind: 'rect', size: { width: 50, height: 40 },
        style: { fill: { type: 'solid', color: '#ff0000' } } }),
    ]))
    expect(svg).toContain('<path d="')
    expect(svg).toContain('fill="#ff0000"')
  })

  it('emits fill="none" when a shape has no fill', () => {
    const { svg } = exportSVG(scene([
      layer({ type: 'shape', shapeKind: 'rect', size: { width: 10, height: 10 },
        style: { stroke: { color: '#fff', width: 2 } } }),
    ]))
    expect(svg).toContain('fill="none"')
    expect(svg).toContain('stroke="#fff"')
    expect(svg).toContain('stroke-width="2"')
  })

  it('registers a gradient in <defs> and references it via url(#…)', () => {
    const { svg } = exportSVG(scene([
      layer({ type: 'shape', shapeKind: 'rect', size: { width: 10, height: 10 },
        style: { fill: { type: 'gradient', gradient: {
          type: 'linear', angle: 90,
          stops: [{ offset: 0, color: '#000' }, { offset: 1, color: '#fff' }],
        } } } }),
    ]))
    expect(svg).toContain('<defs>')
    expect(svg).toContain('<linearGradient id="grad0"')
    expect(svg).toContain('fill="url(#grad0)"')
  })
})

describe('exportSVG — transform & opacity', () => {
  it('writes a transform attribute for translated/rotated layers', () => {
    const { svg } = exportSVG(scene([
      layer({ type: 'shape', shapeKind: 'rect', size: { width: 10, height: 10 },
        transform: { x: 20, y: 30, scaleX: 1, scaleY: 1, rotationDeg: 45, anchorX: 0, anchorY: 0 } }),
    ]))
    expect(svg).toContain('translate(20 30)')
    expect(svg).toContain('rotate(45)')
  })

  it('writes opacity when below 1', () => {
    const { svg } = exportSVG(scene([
      layer({ type: 'shape', shapeKind: 'rect', size: { width: 10, height: 10 }, opacity: 0.5 }),
    ]))
    expect(svg).toContain('opacity="0.5"')
  })
})

describe('exportSVG — groups, text, visibility, warnings', () => {
  it('nests group children inside <g>', () => {
    const { svg } = exportSVG(scene([
      layer({ id: 'g1', type: 'group' }),
      layer({ id: 'c1', type: 'shape', parentId: 'g1', shapeKind: 'rect', size: { width: 10, height: 10 } }),
    ]))
    expect(svg).toContain('<g')
    expect(svg).toContain('</g>')
    // child path lives between the group tags
    expect(svg.indexOf('<path')).toBeGreaterThan(svg.indexOf('<g'))
  })

  it('emits <text> with the layer value', () => {
    const { svg } = exportSVG(scene([
      layer({ type: 'text', text: { value: 'Hi', fontSize: 24, color: '#fff' } as Layer['text'] }),
    ]))
    expect(svg).toContain('<text')
    expect(svg).toContain('>Hi</text>')
    expect(svg).toContain('font-size="24"')
  })

  it('uppercases text when the flag is set', () => {
    const { svg } = exportSVG(scene([
      layer({ type: 'text', text: { value: 'hi', fontSize: 12, color: '#fff', uppercase: true } as Layer['text'] }),
    ]))
    expect(svg).toContain('>HI</text>')
  })

  it('skips hidden layers', () => {
    const { svg } = exportSVG(scene([
      layer({ type: 'shape', shapeKind: 'rect', size: { width: 10, height: 10 }, hidden: true }),
    ]))
    expect(svg).not.toContain('<path')
  })

  it('warns and skips unsupported layer kinds', () => {
    const { svg, warnings } = exportSVG(scene([
      layer({ id: 'img', name: 'Photo', type: 'image' }),
    ]))
    expect(svg).not.toContain('<image')
    expect(warnings.some((w) => w.includes('Photo') && w.includes('image'))).toBe(true)
  })

  it('escapes XML special characters in text', () => {
    const { svg } = exportSVG(scene([
      layer({ type: 'text', text: { value: 'a < b & c', fontSize: 12, color: '#fff' } as Layer['text'] }),
    ]))
    expect(svg).toContain('a &lt; b &amp; c')
  })
})

describe('exportSVG — animated (SMIL)', () => {
  it('emits <animate> for an animated opacity track', () => {
    const tl = timeline([
      track('layers.l1.opacity', [kf(0, 1), kf(1000, 0)]),
    ])
    const { svg } = exportSVG(
      scene([layer({ id: 'l1', type: 'shape', shapeKind: 'rect', size: { width: 10, height: 10 } })], '#000', [tl]),
      { animated: true },
    )
    expect(svg).toContain('<animate attributeName="opacity"')
    expect(svg).toContain('repeatCount="indefinite"')
    expect(svg).toContain('dur="1s"')
  })

  it('emits an additive translate <animateTransform> for x/y tracks', () => {
    const tl = timeline([
      track('layers.l1.transform.x', [kf(0, 0), kf(1000, 100)]),
      track('layers.l1.transform.y', [kf(0, 0), kf(1000, 50)]),
    ])
    const { svg } = exportSVG(
      scene([layer({ id: 'l1', type: 'shape', shapeKind: 'rect', size: { width: 10, height: 10 } })], '#000', [tl]),
      { animated: true },
    )
    expect(svg).toContain('<animateTransform attributeName="transform" type="translate" additive="sum"')
  })

  it('emits a rotate <animateTransform> for a rotation track', () => {
    const tl = timeline([
      track('layers.l1.transform.rotationDeg', [kf(0, 0), kf(1000, 360)]),
    ])
    const { svg } = exportSVG(
      scene([layer({ id: 'l1', type: 'shape', shapeKind: 'rect', size: { width: 10, height: 10 } })], '#000', [tl]),
      { animated: true },
    )
    expect(svg).toContain('type="rotate"')
  })

  it('keeps static elements (no SMIL) for layers without animation in animated mode', () => {
    const { svg } = exportSVG(
      scene([layer({ id: 'l1', type: 'shape', shapeKind: 'rect', size: { width: 10, height: 10 } })], '#000', []),
      { animated: true },
    )
    expect(svg).not.toContain('<animateTransform')
    expect(svg).toContain('<path')
  })

  it('does not emit SMIL in static mode even when tracks exist', () => {
    const tl = timeline([track('layers.l1.opacity', [kf(0, 1), kf(1000, 0)])])
    const { svg } = exportSVG(
      scene([layer({ id: 'l1', type: 'shape', shapeKind: 'rect', size: { width: 10, height: 10 } })], '#000', [tl]),
      { animated: false },
    )
    expect(svg).not.toContain('<animate')
  })
})
