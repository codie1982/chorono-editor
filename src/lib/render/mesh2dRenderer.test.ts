import { describe, expect, it } from 'vitest'
import { newStructuredGridMesh2DLayer } from '@/lib/registry/definitions/mesh2d/Mesh2DDefinition'
import { drawMesh2DLayer, drawMesh2DWireframe } from './mesh2dRenderer'
import { emptyScene } from '@/lib/defaults'
import { hitTestLayer } from '@/lib/renderer'

function recordingContext() {
  let path: unknown[][] = []
  const fills: Array<{ path: unknown[][]; style: unknown; alpha: number }> = []
  const strokes: Array<{ path: unknown[][]; width: number; dash: number[] }> = []
  const state: Array<Record<string, unknown>> = []
  const ctx = {
    globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, filter: 'none', dash: [] as number[],
    save() { state.push({ globalAlpha: this.globalAlpha, fillStyle: this.fillStyle, strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth, filter: this.filter, dash: this.dash }) },
    restore() { Object.assign(this, state.pop()) },
    beginPath() { path = [] },
    moveTo(...values: number[]) { path.push(['M', ...values]) },
    lineTo(...values: number[]) { path.push(['L', ...values]) },
    closePath() { path.push(['Z']) },
    setLineDash(dash: number[]) { this.dash = dash },
    fill() { fills.push({ path: [...path], style: this.fillStyle, alpha: this.globalAlpha }) },
    stroke() { strokes.push({ path: [...path], width: this.lineWidth, dash: [...this.dash] }) },
    createLinearGradient() { return { addColorStop() {} } },
    createRadialGradient() { return { addColorStop() {} } },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills, strokes }
}

describe('Mesh2D canvas rendering', () => {
  it('uses real triangle geometry for scene picking rather than its size box', () => {
    const layer = newStructuredGridMesh2DLayer()
    layer.transform = { x: 0, y: 0, anchorX: 0, anchorY: 0, rotationDeg: 0, scaleX: 1, scaleY: 1 }
    layer.mesh2d = { ...layer.mesh2d!, geometry: {
      positions: [0, 0, 100, 0, 0, 100],
      uvs: [0, 0, 1, 0, 0, 1],
      topology: { schemaVersion: 1, vertexIds: ['a', 'b', 'c'], triangleIndices: [0, 1, 2], topologyHash: 'fixture' },
    } }
    const scene = emptyScene()
    scene.layers = [layer]
    expect(hitTestLayer(scene, 0, 10, 10)).toBe(layer.id)
    expect(hitTestLayer(scene, 0, 80, 80)).toBeNull()
  })

  it('draws all triangles in one path and honors animated fill color/opacity', () => {
    const layer = newStructuredGridMesh2DLayer()
    const { ctx, fills } = recordingContext()
    drawMesh2DLayer(ctx, layer, new Map([
      [`layers.${layer.id}.style.fill.color`, 0xff0000],
      [`layers.${layer.id}.style.fill.opacity`, 25],
    ]))
    expect(fills).toHaveLength(1)
    expect(fills[0].path.filter(command => command[0] === 'M')).toHaveLength(8 * 6 * 2)
    expect(fills[0].style).toBe('#ff0000')
    expect(fills[0].alpha).toBe(0.25)
  })

  it('draws scale-stable wireframe only when explicitly requested', () => {
    const layer = newStructuredGridMesh2DLayer()
    const plain = recordingContext()
    drawMesh2DLayer(plain.ctx, layer, new Map())
    expect(plain.strokes).toHaveLength(0)
    const editor = recordingContext()
    drawMesh2DWireframe(editor.ctx, layer.mesh2d!.geometry, 2)
    expect(editor.strokes[0].width).toBe(0.5)
    expect(editor.strokes[0].dash).toEqual([1.5, 1])
  })

  it('skips malformed triangles and continues drawing valid ones', () => {
    const layer = newStructuredGridMesh2DLayer()
    layer.mesh2d = { ...layer.mesh2d!, geometry: {
      ...layer.mesh2d!.geometry,
      topology: { ...layer.mesh2d!.geometry.topology, triangleIndices: [0, 1, 999, 0, 1, 10] },
    } }
    const { ctx, fills } = recordingContext()
    expect(() => drawMesh2DLayer(ctx, layer, new Map())).not.toThrow()
    expect(fills[0].path.filter(command => command[0] === 'M')).toHaveLength(1)
  })
})
