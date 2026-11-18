import { expect, it } from 'vitest'
import { emptyScene, newRectLayer } from '../../defaults'
import { isChoronoScene, parseSceneJson } from './SceneJsonConverter'
import {
  newShapeBoundaryMesh2DLayer,
  newStructuredGridMesh2DLayer,
} from '../../registry/definitions/mesh2d/Mesh2DDefinition'
import { selectMesh2DPinPreset, setMesh2DDeformation, setMesh2DTexture } from '../../mesh2d'

it('preserves IDs/unknown data and distinguishes merge-source minimum from full editor arrays', () => {
  const original = { ...emptyScene(), extension: { value: 'preserved' } }, text = JSON.stringify(original)
  expect(parseSceneJson(text, true)).toEqual(original)
  const fragment = { formatVersion: '1.0', layers: [], composition: original.composition }
  expect(isChoronoScene(fragment)).toBe(true); expect(isChoronoScene(fragment, true)).toBe(false)
  expect(() => parseSceneJson(JSON.stringify(fragment), true)).toThrow('complete Chorono scene')
})
it('rejects wrong roots/versions/null composition without hiding syntax errors', () => {
  for (const value of [null, [], {}, { formatVersion: '2.0', layers: [], composition: {} }, { formatVersion: '1.0', layers: [], composition: null }]) expect(isChoronoScene(value)).toBe(false)
  expect(() => parseSceneJson('{broken')).toThrow(SyntaxError)
  expect(() => parseSceneJson('{}')).toThrow('valid Chorono scene')
})

it('round-trips portable Mesh2D source, topology and stable vertex ids', () => {
  const scene = emptyScene()
  const layer = setMesh2DDeformation(
    selectMesh2DPinPreset(setMesh2DTexture(newStructuredGridMesh2DLayer(), 'fabric'), 'corners'),
    'deformation',
    { startTimeMs: 250, playbackRate: 0.5, loop: true },
  )
  const shape = newRectLayer()
  const linked = newShapeBoundaryMesh2DLayer(shape)
  scene.layers = [layer, shape, linked]
  scene.assets = [
    { id: 'fabric', name: 'Fabric', type: 'image', url: 'project:fabric.png' },
    { id: 'deformation', name: 'Flag motion', type: 'meshDeformation', url: 'project:flag.chmd' },
  ]
  const loaded = parseSceneJson(JSON.stringify(scene), true)
  expect(loaded.layers[0]).toEqual(layer)
  expect(loaded.layers[0].mesh2d?.geometry.topology.topologyHash)
    .toBe(layer.mesh2d?.geometry.topology.topologyHash)
  expect(loaded.layers[0].mesh2d?.appearance?.textureAssetId).toBe('fabric')
  expect(loaded.layers[0].mesh2d?.pins?.vertexIds).toHaveLength(4)
  expect(loaded.layers[0].mesh2d?.deformation).toEqual(layer.mesh2d?.deformation)
  expect(loaded.assets[1].type).toBe('meshDeformation')
  expect(loaded.layers[2]).toEqual(linked)
  expect(loaded.layers[2].mesh2d?.source).toMatchObject({
    kind: 'shapeBoundary', sourceLayerId: shape.id,
  })
})
