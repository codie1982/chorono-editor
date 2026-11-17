import { describe, expect, it, vi } from 'vitest'
import { modelDefaults } from '../source/modelDefaults'
import { addPrimitive } from '../modeling/poly/primitiveSource'
import { withModelContent } from '../content/modelContent'
import type { Model3DResource } from '../types'
import type { ModelInventory } from '../content/types'
import { isEmptyModelScene } from './EmptyModelScenePreview'
import { modelRendererPlugin } from './modelRendererPlugin'

const inventory: ModelInventory = { revision: 'a'.repeat(64), nodes: [], clips: [], materials: {}, textures: [], textureColorSpaces: [] }
const resource = (draw = vi.fn()): Model3DResource => ({ bytes: 1, inventory, isExplicitEmptyScene: true, draw, dispose: () => {} })

describe('empty 3D scene in the 2D editor', () => {
  it('recognizes only the explicit empty source before any 3D object is added', () => {
    const data = modelDefaults('empty'), empty = resource()
    expect(isEmptyModelScene(data, empty)).toBe(true)
    expect(isEmptyModelScene(data, { ...empty, isExplicitEmptyScene: false })).toBe(false)
    expect(isEmptyModelScene(addPrimitive(data, inventory, 'box', 'boxA'), empty)).toBe(false)
    const assembled = withModelContent(data, inventory)
    expect(isEmptyModelScene({ ...assembled, content: { ...assembled.content!, instances: {
      ...assembled.content!.instances, second: { ...assembled.content!.instances.primary, name: 'Second model' },
    } } }, empty)).toBe(false)
  })

  it('draws a camera grid and caption in editor mode, but keeps output transparent', () => {
    const data = modelDefaults('empty'), draw = vi.fn(), model = resource(draw)
    const canvas = { save: vi.fn(), restore: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(), fillStyle: '', font: '' } as unknown as CanvasRenderingContext2D
    const base = { canvas, assets: { modelForAsset: () => model }, renderMode: 'editor' }
    const layer = { name: 'Empty 3D Scene', size: { width: 400, height: 400 }, model3d: data }
    modelRendererPlugin.render(base as never, layer as never)
    expect(canvas.fillRect).toHaveBeenCalledWith(0, 0, 400, 400)
    expect(canvas.fillText).toHaveBeenCalledWith('EMPTY 3D SCENE', 18, 29)
    expect(draw.mock.calls[0][5]).toMatchObject({ showGrid: true, camera: { projection: 'perspective' } })

    vi.clearAllMocks()
    modelRendererPlugin.render({ ...base, renderMode: 'preview' } as never, layer as never)
    expect(draw).toHaveBeenCalledOnce()
    expect(draw.mock.calls[0][5]).toBeUndefined()
    expect(canvas.fillRect).not.toHaveBeenCalled()

    vi.clearAllMocks()
    modelRendererPlugin.render({ ...base, assets: { ...base.assets, finalOutput: true } } as never, layer as never)
    expect(draw.mock.calls[0][5]).toBeUndefined()
    expect(canvas.fillRect).not.toHaveBeenCalled()
  })
})
