import { describe, expect, it } from 'vitest'
import { drawSplineLayer, hitTestLayer } from '../renderer'
import { emptyScene, newSplineLayerFromPrimitive } from '../defaults'
import { mergeSplineData } from '../spline/factory/mergeSplineData'
import { createArcSpline } from '../spline/primitives/createArcSpline'
import type { Layer } from '../types'

function recordingContext() {
  let path: unknown[][] = []
  const fills: Array<{ path: unknown[][]; style: unknown; rule: string; alpha: number }> = []
  const strokes: Array<{ path: unknown[][]; style: unknown; width: number; dash: number[] }> = []
  const gradients: Array<{ coordinates: number[]; stops: unknown[][] }> = []
  const state: Array<Record<string, unknown>> = []
  const ctx = {
    globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1,
    lineDashOffset: 0, lineCap: 'butt', lineJoin: 'miter', dash: [] as number[],
    save() { state.push({ globalAlpha: this.globalAlpha, fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle, lineWidth: this.lineWidth, dash: this.dash }) },
    restore() { Object.assign(this, state.pop()) },
    beginPath() { path = [] },
    moveTo(...v: number[]) { path.push(['M', ...v]) },
    lineTo(...v: number[]) { path.push(['L', ...v]) },
    bezierCurveTo(...v: number[]) { path.push(['C', ...v]) },
    quadraticCurveTo(...v: number[]) { path.push(['Q', ...v]) },
    closePath() { path.push(['Z']) },
    setLineDash(dash: number[]) { this.dash = dash },
    fill(rule: string) { fills.push({ path: [...path], style: this.fillStyle, rule, alpha: this.globalAlpha }) },
    stroke() { strokes.push({ path: [...path], style: this.strokeStyle, width: this.lineWidth, dash: this.dash }) },
    createLinearGradient(...coordinates: number[]) {
      const grad = { coordinates, stops: [] as unknown[][] }
      gradients.push(grad)
      return { addColorStop(...stop: unknown[]) { grad.stops.push(stop) } }
    },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills, strokes, gradients }
}

const circle = () => newSplineLayerFromPrimitive('circle', { radius: 80 })!
const gradient = { type: 'linear' as const, angle: 0,
  stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }] }

describe('spline canvas rendering', () => {
  it('renders fill and stroke gradients over centred spline bounds', () => {
    const layer = circle()
    layer.style = { fill: { type: 'gradient', gradient }, stroke: { color: '#fff', width: 3, gradient } }
    const { ctx, fills, strokes, gradients } = recordingContext()
    drawSplineLayer(ctx, layer, new Map())
    expect(gradients).toHaveLength(2)
    expect(gradients[0].coordinates).toEqual([-80, 0, 80, 0])
    expect(gradients[0].stops).toEqual([[0, '#ff0000'], [1, '#0000ff']])
    expect(typeof fills[0].style).toBe('object')
    expect(typeof strokes[0].style).toBe('object')
  })

  it('uses animated fill/stroke colors and width even when the base width is zero', () => {
    const layer = circle()
    const { ctx, fills, strokes } = recordingContext()
    drawSplineLayer(ctx, layer, new Map([
      [`layers.${layer.id}.style.fill.color`, 0xff0000],
      [`layers.${layer.id}.style.stroke.color`, 0x00ff00],
      [`layers.${layer.id}.style.stroke.width`, 7],
    ]))
    expect(fills[0].style).toBe('#ff0000')
    expect(strokes[0].style).toBe('#00ff00')
    expect(strokes[0].width).toBe(7)
  })

  it('keeps parameter color bindings ahead of numeric animation', () => {
    const layer = circle()
    layer.paramBindings = { 'style.fill.color': 'tint' }
    const { ctx, fills } = recordingContext()
    drawSplineLayer(ctx, layer, new Map([[`layers.${layer.id}.style.fill.color`, 0xff0000]]),
      new Map([['tint', '#123456']]))
    expect(fills[0].style).toBe('#123456')
  })

  it('excludes open contours from compound fill while still stroking them', () => {
    const layer = circle()
    layer.spline = mergeSplineData(layer.spline!, createArcSpline({ radius: 140, startAngle: 0, endAngle: 90 }))
    layer.style!.stroke!.width = 2
    const { ctx, fills, strokes } = recordingContext()
    drawSplineLayer(ctx, layer, new Map())
    expect(fills[0].path.filter(c => c[0] === 'M')).toHaveLength(1)
    expect(strokes[0].path.filter(c => c[0] === 'M')).toHaveLength(2)
  })

  it('honours even-odd holes and leaves a fill-only open arc unfilled', () => {
    const donut = newSplineLayerFromPrimitive('donut', { outerRadius: 80, innerRadius: 40 })!
    const first = recordingContext()
    drawSplineLayer(first.ctx, donut, new Map())
    expect(first.fills[0].rule).toBe('evenodd')
    const arc = newSplineLayerFromPrimitive('arc', { radius: 80, startAngle: 0, endAngle: 90 })!
    arc.style = { fill: { type: 'solid', color: '#fff' } }
    const second = recordingContext()
    drawSplineLayer(second.ctx, arc, new Map())
    expect(second.fills).toHaveLength(0)
  })

  it('trims actual stroke geometry and preserves the authored dash pattern', () => {
    const line = newSplineLayerFromPrimitive('line', { x1: 0, y1: 0, x2: 100, y2: 0 })!
    line.style!.stroke!.trim = { start: 0.25, end: 0.75, offset: 0 }
    line.style!.stroke!.dashArray = [4, 2]
    const { ctx, strokes } = recordingContext()
    drawSplineLayer(ctx, line, new Map())
    expect(strokes[0].path).toEqual([['M', 25, 0], ['L', 75, 0]])
    expect(strokes[0].dash).toEqual([4, 2])
  })

  it('shows no stroke for an empty animated trim, without requiring a base trim object', () => {
    const line = newSplineLayerFromPrimitive('line', { x1: 0, y1: 0, x2: 100, y2: 0 })!
    const { ctx, strokes } = recordingContext()
    drawSplineLayer(ctx, line, new Map([[`layers.${line.id}.style.stroke.trim.end`, 0]]))
    expect(strokes).toHaveLength(0)
  })
})

describe('spline body selection', () => {
  function hit(layer: Layer, x: number, y: number, parents: Layer[] = []) {
    const scene = emptyScene()
    scene.layers = [...parents, layer]
    return hitTestLayer(scene, 0, x, y)
  }

  it('selects negative local coordinates and misses empty space in the old fallback box', () => {
    const layer = newSplineLayerFromPrimitive('rectangle', { width: 100, height: 60 })!
    layer.transform.x = layer.transform.y = 200
    expect(hit(layer, 160, 180)).toBe(layer.id)
    expect(hit(layer, 275, 220)).toBeNull()
  })

  it('selects a long open line outside the old 80×24 fallback box', () => {
    const layer = newSplineLayerFromPrimitive('line', { x1: -100, y1: 0, x2: 150, y2: 0 })!
    expect(hit(layer, layer.transform.x + 130, layer.transform.y)).toBe(layer.id)
  })

  it('does not select the empty centre of a donut', () => {
    const layer = newSplineLayerFromPrimitive('donut', { outerRadius: 80, innerRadius: 40 })!
    expect(hit(layer, 80, 80)).toBeNull()
    expect(hit(layer, 140, 80)).toBe(layer.id)
  })

  it('uses parent rotation and nonuniform scale for body picking', () => {
    const layer = newSplineLayerFromPrimitive('rectangle', { width: 100, height: 20 })!
    const group: Layer = { id: 'g', name: 'g', type: 'group', opacity: 1,
      transform: { x: 300, y: 200, scaleX: 2, scaleY: 3, rotationDeg: 90, anchorX: 0, anchorY: 0 } }
    layer.parentId = 'g'
    layer.transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 }
    // local (40,0) → scale (80,0) → rotate (0,80) → translate (300,280)
    expect(hit(layer, 300, 280, [group])).toBe(layer.id)
  })

  it('ignores singular layer transforms instead of throwing during picking', () => {
    const layer = circle()
    layer.transform.scaleX = 0
    expect(hit(layer, 80, 80)).toBeNull()
  })

  it('picks the displayed runtime position and scale instead of the static scene', () => {
    const scene = emptyScene()
    const layer = circle()
    layer.transform.x = 100
    layer.transform.y = 100
    scene.layers = [layer]
    const frame = new Map([
      [`layers.${layer.id}.transform.x`, 400],
      [`layers.${layer.id}.transform.y`, 300],
      [`layers.${layer.id}.transform.scaleX`, 2],
    ])
    // The visible ellipse reaches x=560. Its old position around x=100 must
    // no longer grab clicks when runtime/binding values moved it elsewhere.
    expect(hitTestLayer(scene, 0, 530, 300, frame)).toBe(layer.id)
    expect(hitTestLayer(scene, 0, 100, 100, frame)).toBeNull()
  })

  it('honours an empty override map when an animation is isolated out', () => {
    const scene = emptyScene()
    const layer = circle()
    layer.transform.x = 100
    layer.transform.y = 100
    scene.layers = [layer]
    scene.timelines = [{ id: 'inactive', durationMs: 1000, loop: false, autoplay: false,
      tracks: [{ target: `layers.${layer.id}.transform.x`, keyframes: [
        { id: 'move', timeMs: 0, value: 500, easing: { type: 'linear' } },
      ] }] }]
    expect(hitTestLayer(scene, 0, 100, 100, new Map())).toBe(layer.id)
    expect(hitTestLayer(scene, 0, 500, 100, new Map())).toBeNull()
    // Existing callers without an explicit frame keep normal evaluation.
    expect(hitTestLayer(scene, 0, 500, 100)).toBe(layer.id)
  })

  it('selects a group between its real vector children instead of a fabricated size box', () => {
    const group: Layer = { id: 'group', name: 'Vector group', type: 'group', opacity: 1,
      transform: { x: 200, y: 100, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 } }
    const left = circle()
    left.parentId = group.id
    left.transform.x = -100
    left.transform.y = 0
    const path: Layer = { id: 'path', name: 'Far path', type: 'path', parentId: group.id, opacity: 1,
      transform: { x: 20, y: 30, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 },
      path: { closed: true, anchors: [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }] } }
    const scene = emptyScene()
    scene.layers = [group, left, path]
    // The point lies between children, inside their union's world AABB.
    expect(hitTestLayer(scene, 0, 200, 200)).toBe(group.id)
    expect(hitTestLayer(scene, 0, 500, 400)).toBeNull()
  })
})
