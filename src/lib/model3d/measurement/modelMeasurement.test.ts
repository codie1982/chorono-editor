import { describe, expect, it } from 'vitest'
import { emptyScene } from '../../defaults'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'
import { cloneSingleLayer } from '../../clone/CloneSingleLayer'
import { newModelLayer, validateModel } from '../source/modelDefaults'
import type { ModelInventory } from '../content/types'
import { DEFAULT_MODEL_MEASUREMENT, calibrateModelInstance, fromModelMeters, modelMeasurement, toModelMeters, updateModelMeasurement } from './modelMeasurement'
import { visibleGridStep } from './gridSpacing'
import '../../registry/bootstrap'

const inventory: ModelInventory = { revision: 'a'.repeat(64), nodes: [], clips: [], materials: {}, textures: [], textureColorSpaces: [] }

describe('3D physical measurements', () => {
  it('converts centimetres, inches and design pixels through one metre', () => {
    expect(toModelMeters(100, DEFAULT_MODEL_MEASUREMENT)).toBeCloseTo(1)
    const inches = { ...DEFAULT_MODEL_MEASUREMENT, unit: 'in' as const }
    const pixels = { ...DEFAULT_MODEL_MEASUREMENT, unit: 'px' as const }
    expect(toModelMeters(1, inches)).toBeCloseTo(.0254)
    expect(toModelMeters(96, pixels)).toBeCloseTo(.0254)
    expect(fromModelMeters(1, inches)).toBeCloseTo(39.3700787)
    expect(fromModelMeters(1, pixels)).toBeCloseTo(3779.52756)
  })

  it('thins the visible grid by zoom without changing its physical base interval', () => {
    const camera = { yaw: 30, pitch: 15, distance: 3.5, targetX: 0, targetY: 0, targetZ: 0, fov: 45, projection: 'perspective' as const, orthoHeight: 2.8 }
    const near = visibleGridStep({ ...camera, distance: .1 }, 600, 400, .1)
    const far = visibleGridStep({ ...camera, distance: 100 }, 600, 400, .1)
    expect(near).toBeCloseTo(.1)
    expect(far).toBeGreaterThan(near)
    expect(DEFAULT_MODEL_MEASUREMENT.gridBaseMeters).toBe(.1)
    expect(visibleGridStep({ ...camera, projection: 'orthographic', orthoHeight: .1 }, 600, 400, .1)).toBeCloseTo(.1)
  })

  it('promotes only on explicit settings edit and preserves physical grid spacing across unit changes and portable roundtrip', () => {
    const layer = newModelLayer('box', 'asset'), old = layer.model3d!, before = JSON.stringify(old)
    const cm = updateModelMeasurement(old, inventory, { gridBaseMeters: .25 })
    const inches = updateModelMeasurement(cm, inventory, { unit: 'in', pixelsPerInch: 120 })
    expect(old.version).toBe(1)
    expect(JSON.stringify(old)).toBe(before)
    expect(inches.version).toBe(4)
    expect(modelMeasurement(inches).gridBaseMeters).toBe(.25)
    expect(fromModelMeters(.25, modelMeasurement(inches))).toBeCloseTo(9.84252)
    validateModel(inches)
    const scene = { ...emptyScene(), layers: [{ ...layer, model3d: inches }], assets: [{ id: 'asset', type: 'model3d' as const, name: 'Empty', url: 'data:model/gltf+json;base64,e30=' }] }
    const reopened = parseSceneJson(JSON.stringify(scene), true)
    expect(reopened.layers[0].model3d?.measurement).toEqual(inches.measurement)
    expect(cloneSingleLayer(reopened.layers[0]).clonedLayer.model3d?.measurement).toEqual(inches.measurement)
    expect(() => updateModelMeasurement(inches, inventory, { gridBaseMeters: 0 })).toThrow()
    expect(() => updateModelMeasurement(inches, inventory, { subdivisions: 1.5 })).toThrow()
  })

  it('calibrates one revision-bound imported instance without changing source geometry or other instances', () => {
    const layer = newModelLayer('box', 'asset'), old = layer.model3d!
    const updated = calibrateModelInstance(old, inventory, 'primary', 2, 1)
    expect(updated.version).toBe(4)
    expect(updated.content?.instances.primary.calibration).toEqual({ revision: inventory.revision, metersPerNormalizedUnit: .5 })
    validateModel(updated)
    expect(() => validateModel({ ...updated, version: 3, modeling: undefined, measurement: undefined })).toThrow('calibration requires source version 4')
    expect(old.content).toBeUndefined()
    const scene = { ...emptyScene(), layers: [{ ...layer, model3d: updated }], assets: [{ id: 'asset', type: 'model3d' as const, name: 'Imported', url: 'data:model/gltf+json;base64,e30=' }] }
    expect(parseSceneJson(JSON.stringify(scene), true).layers[0].model3d?.content?.instances.primary.calibration)
      .toEqual(updated.content?.instances.primary.calibration)
    expect(cloneSingleLayer(scene.layers[0]).clonedLayer.model3d?.content?.instances.primary.calibration)
      .toEqual(updated.content?.instances.primary.calibration)
    expect(() => calibrateModelInstance(updated, inventory, 'primary', 0, 1)).toThrow()
  })
})
