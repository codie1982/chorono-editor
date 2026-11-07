import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Layer } from '@/lib/types'
import { emptyScene, newRectLayer, newSplineLayerFromData } from '@/lib/defaults'
import { createPolylineSpline } from '@/lib/spline/creation/createPolylineSpline'
import { cloneSingleLayer } from '@/lib/clone/CloneSingleLayer'
import { Matrix2D } from '@/lib/geometry/Matrix2D'
import { CanvasRenderer } from './CanvasRenderer'
import { rendererRegistry } from '@/lib/registry'
import { CanvasSurfacePool } from './resources/CanvasSurfacePool'

/** Records composition-space rectangles, including any active canvas transform. */
function recordingCanvas() {
  let matrix = Matrix2D.identity()
  const rectangles: number[][] = []
  const fills: string[] = []
  const states: Array<{ matrix: Matrix2D; alpha: number; fill: string; stroke: string; dash: number[] }> = []
  const ctx = {
    globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1,
    globalCompositeOperation: 'source-over', filter: 'none',
    lineCap: 'butt', lineJoin: 'miter', lineDashOffset: 0, dash: [] as number[],
    save() {
      states.push({ matrix, alpha: this.globalAlpha, fill: this.fillStyle, stroke: this.strokeStyle, dash: this.dash })
    },
    restore() {
      const state = states.pop()!
      matrix = state.matrix
      this.globalAlpha = state.alpha
      this.fillStyle = state.fill
      this.strokeStyle = state.stroke
      this.dash = state.dash
    },
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
      matrix = new Matrix2D(a, b, c, d, e, f)
    },
    translate(x: number, y: number) { matrix = matrix.translate(x, y) },
    rotate(radians: number) { matrix = matrix.rotate(radians * 180 / Math.PI) },
    scale(x: number, y: number) { matrix = matrix.scale(x, y) },
    transform(a: number, b: number, c: number, d: number, e: number, f: number) {
      matrix = matrix.multiply(new Matrix2D(a, b, c, d, e, f))
    },
    strokeRect(x: number, y: number, width: number, height: number) {
      const corners = [[x, y], [x + width, y], [x, y + height], [x + width, y + height]]
        .map(([px, py]) => matrix.applyToPoint({ x: px, y: py }))
      const xs = corners.map(p => p.x), ys = corners.map(p => p.y)
      rectangles.push([Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)])
    },
    setLineDash(dash: number[]) { this.dash = dash },
    clearRect() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
    bezierCurveTo() {}, quadraticCurveTo() {}, arcTo() {}, closePath() {}, stroke() {},
    fill() { fills.push(this.fillStyle) },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rectangles, fills, saveDepth:()=>states.length }
}

function triangle(): Layer {
  return newSplineLayerFromData(createPolylineSpline([
    { x: -60, y: 40 }, { x: 0, y: -80 }, { x: 90, y: 20 },
  ], true), { x: 200, y: 180, name: 'Editable triangle' })
}

function expectRectangle(actual: number[][], expected: number[]) {
  expect(actual).toHaveLength(1)
  expected.forEach((value, i) => expect(actual[0][i]).toBeCloseTo(value, 6))
}

function render(layers: Layer[], selectedId: string, options = {}) {
  const scene = emptyScene()
  scene.layers = layers
  const recording = recordingCanvas()
  new CanvasRenderer().render(recording.ctx, scene, 0, selectedId, new Map(), options)
  return recording
}

afterEach(() => vi.restoreAllMocks())

describe('CanvasRenderer selection outlines', () => {
  it('unwinds parent canvas state after scratch admission fails, keeping the next frame correctly positioned', () => {
    const pool=new CanvasSurfacePool({maxBytes:0}), renderer=new CanvasRenderer(pool)
    const group={...newRectLayer(),type:'group' as const}
    group.transform.x=group.transform.y=100
    const host=newRectLayer();host.parentId=group.id
    host.masks=[{id:'m',maskLayerId:'missing',mode:'add',opacity:1}]
    const scene={...emptyScene(),layers:[group,host]}, recording=recordingCanvas()
    try {
      expect(()=>renderer.render(recording.ctx,scene,0,null,new Map())).toThrow(/budget exceeded/)
      expect(recording.saveDepth()).toBe(0)
      const layer=triangle()
      renderer.render(recording.ctx,{...scene,layers:[layer]},0,layer.id,new Map())
      expectRectangle(recording.rectangles,[138,98,154,124])
      expect(pool.getSnapshot().activeBytes).toBe(0)
    } finally {pool.dispose()}
  })
  it('outlines the actual filled triangle when a spline has no size box', () => {
    const layer = triangle()
    expect(layer.size).toBeUndefined()
    const recording = render([layer], layer.id)
    // Local x -60..90, y -80..40 translated by (200,180), padded by 2px.
    expectRectangle(recording.rectangles, [138, 98, 154, 124])
    expect(recording.fills).toHaveLength(1)
  })

  it('outlines a size-less path in world space after custom pivot and rotation', () => {
    const path: Layer = {
      id: 'path', name: 'Rotated path', type: 'path', opacity: 1,
      transform: { x: 300, y: 200, scaleX: 1, scaleY: 1, rotationDeg: 90, anchorX: 10, anchorY: 20 },
      path: { closed: true, anchors: [{ x: -50, y: -40 }, { x: 80, y: 20 }, { x: -20, y: 60 }] },
      style: { fill: { type: 'solid', color: '#123456' } },
    }
    const recording = render([path], path.id)
    // Transformed anchors are (370,160), (310,290), (270,190).
    expectRectangle(recording.rectangles, [268, 158, 104, 134])
    expect(recording.fills).toEqual(['#123456'])
  })

  it('uses source spline geometry with the selected instance transform', () => {
    const source = triangle()
    const { clonedLayer: instance } = cloneSingleLayer(source, { mode: 'instance', offsetX: 160, offsetY: 40 })
    expect(instance.spline).toBeUndefined()
    const recording = render([source, instance], instance.id)
    expectRectangle(recording.rectangles, [298, 138, 154, 124])
    expect(recording.fills).toHaveLength(2)
  })

  it('unites real child bounds for a group containing a spline and shape', () => {
    const group: Layer = { id: 'group', name: 'Mixed group', type: 'group', opacity: 1,
      transform: { x: 100, y: 100, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 } }
    const spline = triangle()
    spline.parentId = group.id
    const shape: Layer = { id: 'rect', name: 'Small rect', type: 'shape', shape: 'rect', parentId: group.id, opacity: 1,
      transform: { x: -20, y: 0, scaleX: 1, scaleY: 1, rotationDeg: 0, anchorX: 0, anchorY: 0 },
      size: { width: 40, height: 30 }, style: { fill: { type: 'solid', color: '#123456' } } }
    const recording = render([group, spline, shape], group.id)
    // Rectangle is x80..120/y100..130; spline is x240..390/y200..320.
    expectRectangle(recording.rectangles, [78, 98, 314, 224])
    expect(recording.fills).toHaveLength(2)
  })

  it('can suppress the canvas outline without hiding content or plugin selection state', () => {
    const layer = triangle()
    const selected: boolean[] = []
    const plugin = rendererRegistry.findOrThrow(layer)
    const originalRender = plugin.render
    vi.spyOn(plugin, 'render').mockImplementation((context, target) => {
      selected.push(context.isSelected(target.id))
      originalRender(context, target)
    })
    const recording = render([layer], layer.id, { selectionOutline: false })
    expect(recording.rectangles).toEqual([])
    expect(recording.fills).toHaveLength(1)
    expect(selected).toEqual([true])
  })
})
