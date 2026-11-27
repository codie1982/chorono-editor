import { describe, expect, it } from 'vitest'
import { modelDefaults, validateModel } from './modelDefaults'
import { addSceneObject, assertSceneObjects, cameraFromView, updateSceneObject, viewFromCamera } from './modelSceneObjects'
import { modelSceneDeletionTargets, removeModelSceneObjects } from './modelSceneDeletion'
import { buildModelSceneTree } from '../inspection/modelSceneTree'
import { emptyScene } from '../../defaults'
import { newModelLayer } from './modelDefaults'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'

describe('authored 3D camera and light objects', () => {
  it('keeps stable IDs and camera pose through source edits and deletion', () => {
    const base = modelDefaults()
    const view = { ...base.camera, roll: 30, projection: 'perspective' as const, orthoHeight: 2.8 }
    const first = cameraFromView('cam_a', view)
    const next = addSceneObject(addSceneObject(base, first), cameraFromView('cam_b', { ...view, yaw: -45 }))
    expect(next.sceneObjects?.activeCameraId).toBe('cam_a')
    expect(viewFromCamera(first).yaw).toBeCloseTo(view.yaw)
    expect(viewFromCamera(first).pitch).toBeCloseTo(view.pitch)
    const renamed = updateSceneObject(next, 'cam_b', object => ({ ...object, name: 'Detail' }))
    expect(next.sceneObjects?.objects[1].name).toBe('Camera')
    const targets = modelSceneDeletionTargets(renamed, [{ instanceId: '@scene', nodeId: 'cam_a' }])
    expect(removeModelSceneObjects(renamed, targets).sceneObjects?.activeCameraId).toBe('cam_b')
    validateModel(renamed)
    const scene = emptyScene(); scene.layers = [{ ...newModelLayer('three'), model3d: renamed }]
    expect(parseSceneJson(JSON.stringify(scene), true).layers[0].model3d?.sceneObjects).toEqual(renamed.sceneObjects)
    expect(buildModelSceneTree('Scene', renamed, undefined, () => undefined).children[0].children.find(group => group.id === 'group:cameras')?.children.map(item => item.name)).toEqual(['Camera', 'Detail'])
  })

  it('rejects a degenerate camera, duplicate identity and invalid light', () => {
    const base = modelDefaults(), view = { ...base.camera, projection: 'perspective' as const, orthoHeight: 2.8 }
    const camera = cameraFromView('cam_a', view)
    expect(() => assertSceneObjects({ objects: [{ ...camera, position: camera.target }] })).toThrow(/camera/)
    expect(() => assertSceneObjects({ objects: [camera, camera] })).toThrow(/identity/)
    expect(() => assertSceneObjects({ objects: [{ kind: 'light', id: 'light_a', name: 'Light', lightType: 'point',
      position: { x: 0, y: 1, z: 0 }, target: { x: 0, y: 0, z: 0 }, color: 'red', intensity: 2, shadows: false }] })).toThrow(/light/)
  })
})
