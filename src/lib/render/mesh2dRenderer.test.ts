import { describe, expect, it } from 'vitest'
import { newStructuredGridMesh2DLayer } from '@/lib/registry/definitions/mesh2d/Mesh2DDefinition'
import { drawMesh2DLayer, drawMesh2DPins, drawMesh2DWireframe } from './mesh2dRenderer'
import { emptyScene } from '@/lib/defaults'
import { hitTestLayer } from '@/lib/renderer'
import { MeshDeformationClip } from '@/lib/mesh2d'

function recordingContext() {
  let path: unknown[][] = []
  const fills: Array<{ path: unknown[][]; style: unknown; alpha: number }> = []
  const strokes: Array<{ path: unknown[][]; width: number; dash: number[] }> = []
  const draws: unknown[][] = []
  const transforms: number[][] = []
  const circles: number[][] = []
  const state: Array<Record<string, unknown>> = []
  const ctx = {
    globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, filter: 'none', dash: [] as number[], imageSmoothingEnabled: true,
    save() { state.push({ globalAlpha: this.globalAlpha, fillStyle: this.fillStyle, strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth, filter: this.filter, dash: this.dash, imageSmoothingEnabled: this.imageSmoothingEnabled }) },
    restore() { Object.assign(this, state.pop()) },
    beginPath() { path = [] },
    moveTo(...values: number[]) { path.push(['M', ...values]) },
    lineTo(...values: number[]) { path.push(['L', ...values]) },
    closePath() { path.push(['Z']) },
    arc(...values: number[]) { circles.push(values) },
    clip() {},
    transform(...values: number[]) { transforms.push(values) },
    drawImage(...values: unknown[]) { draws.push(values) },
    setLineDash(dash: number[]) { this.dash = dash },
    fill() { fills.push({ path: [...path], style: this.fillStyle, alpha: this.globalAlpha }) },
    stroke() { strokes.push({ path: [...path], width: this.lineWidth, dash: [...this.dash] }) },
    createLinearGradient() { return { addColorStop() {} } },
    createRadialGradient() { return { addColorStop() {} } },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills, strokes, draws, transforms, circles }
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

  it('picks the displayed deformation frame and rejects the abandoned rest position', () => {
    const layer = newStructuredGridMesh2DLayer()
    layer.transform = { x: 0, y: 0, anchorX: 0, anchorY: 0, rotationDeg: 0, scaleX: 1, scaleY: 1 }
    layer.mesh2d = { ...layer.mesh2d!, geometry: {
      positions: [0, 0, 100, 0, 0, 100],
      uvs: [0, 0, 1, 0, 0, 1],
      topology: { schemaVersion: 1, vertexIds: ['a', 'b', 'c'], triangleIndices: [0, 1, 2], topologyHash: 'moving' },
    }, deformation: { schemaVersion: 1, assetId: 'clip', startTimeMs: 0, playbackRate: 1, loop: false } }
    const clip = new MeshDeformationClip({
      topologyHash: 'moving', vertexCount: 3, componentCount: 2,
      sampleTimesMs: Float64Array.from([0, 100]),
      positions: Float32Array.from([0, 0, 100, 0, 0, 100, 200, 0, 300, 0, 200, 100]),
    })
    const scene = emptyScene(); scene.layers = [layer]
    const options = { meshDeformations: { get: (id: string) => id === 'clip' ? clip : undefined } }
    expect(hitTestLayer(scene, 100, 210, 10, undefined, options)).toBe(layer.id)
    expect(hitTestLayer(scene, 100, 10, 10, undefined, options)).toBeNull()
    expect(hitTestLayer(scene, 100, 10, 10)).toBe(layer.id)
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

  it('maps a ready texture through every triangle UV and honors nearest sampling', () => {
    const layer = newStructuredGridMesh2DLayer()
    layer.mesh2d = { ...layer.mesh2d!, appearance: {
      schemaVersion: 1, kind: 'texture', textureAssetId: 'fabric', sampling: 'nearest',
    } }
    const texture = { naturalWidth: 240, naturalHeight: 160 } as unknown as CanvasImageSource
    const recorded = recordingContext()
    drawMesh2DLayer(recorded.ctx, layer, new Map(), texture)
    expect(recorded.draws).toHaveLength(8 * 6 * 2)
    expect(recorded.transforms).toHaveLength(8 * 6 * 2)
    expect(recorded.fills).toHaveLength(0)
  })

  it('applies portable aspect-fit placement before mapping UV triangles', () => {
    const layer = newStructuredGridMesh2DLayer()
    layer.mesh2d = { ...layer.mesh2d!, appearance: {
      schemaVersion: 1, kind: 'texture', textureAssetId: 'fabric', sampling: 'linear',
      textureTransform: {
        schemaVersion: 1, fit: 'contain', offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1,
        rotationDeg: 0, pivotU: 0.5, pivotV: 0.5, flipX: false, flipY: false,
      },
    } }
    const recorded = recordingContext()
    drawMesh2DLayer(recorded.ctx, layer, new Map(), { naturalWidth: 100, naturalHeight: 100 } as unknown as CanvasImageSource)
    expect(recorded.transforms[0][0]).toBeCloseTo(1.6)
    expect(recorded.transforms[0][3]).toBeCloseTo(1.6)
    expect(recorded.transforms[0][4]).toBeCloseTo(40)
    expect(recorded.transforms[0][5]).toBeCloseTo(0)
  })

  it('uses the complete solid fallback when texture UVs are invalid', () => {
    const layer = newStructuredGridMesh2DLayer()
    layer.mesh2d = {
      ...layer.mesh2d!,
      appearance: { schemaVersion: 1, kind: 'texture', textureAssetId: 'fabric', sampling: 'linear' },
      geometry: { ...layer.mesh2d!.geometry, uvs: layer.mesh2d!.geometry.uvs.map(() => 0) },
    }
    const recorded = recordingContext()
    drawMesh2DLayer(recorded.ctx, layer, new Map(), { naturalWidth: 2, naturalHeight: 2 } as unknown as CanvasImageSource)
    expect(recorded.draws).toHaveLength(0)
    expect(recorded.fills).toHaveLength(1)
  })

  it('draws current and stale pins as editor-only point markers', () => {
    const layer = newStructuredGridMesh2DLayer()
    const recorded = recordingContext()
    drawMesh2DPins(recorded.ctx, layer.mesh2d!.geometry, layer.mesh2d!.geometry.topology.vertexIds.slice(0, 3), 2)
    expect(recorded.circles).toHaveLength(3)
    expect(recorded.circles[0][2]).toBe(2)
  })
})
