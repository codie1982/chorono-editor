import type { Model3DData } from '../types'
import type { ModelViewCamera } from '../inspection/types'

export const SCENE_OBJECT_SELECTION_INSTANCE = '@scene'
export interface ScenePoint { x: number; y: number; z: number }
interface SceneObjectBase { id: string; name: string; visible?: boolean; frozen?: boolean; renderable?: boolean }
/** Authored Y-up camera. Positions and target are world metres; roll/FOV are degrees. */
export interface ModelSceneCamera extends SceneObjectBase {
  kind: 'camera'; position: ScenePoint; target: ScenePoint; roll: number
  projection: 'perspective' | 'orthographic'; fov: number; orthoHeight: number
}
/** Authored punctual light. Position is world metres; intensity is Three light intensity. */
export interface ModelSceneLight extends SceneObjectBase {
  kind: 'light'; lightType: 'directional' | 'point' | 'spot'
  position: ScenePoint; target: ScenePoint; color: string; intensity: number; shadows: boolean
}
export type ModelSceneObject = ModelSceneCamera | ModelSceneLight
export interface ModelSceneObjects { objects: ModelSceneObject[]; activeCameraId?: string }

/** Convert a view to an independent camera object. No legacy camera field is modified. */
export function cameraFromView(id: string, view: ModelViewCamera, name = 'Camera'): ModelSceneCamera {
  const yaw = view.yaw * Math.PI / 180, pitch = view.pitch * Math.PI / 180
  const target = { x: view.targetX, y: view.targetY, z: view.targetZ }
  return { id, name, kind: 'camera', position: {
    x: target.x + view.distance * Math.sin(yaw) * Math.cos(pitch),
    y: target.y + view.distance * Math.sin(pitch),
    z: target.z + view.distance * Math.cos(yaw) * Math.cos(pitch),
  }, target, roll: view.roll ?? 0, projection: view.projection, fov: view.fov, orthoHeight: view.orthoHeight }
}

/** Derive the renderer's orbit view from the authored position and target. */
export function viewFromCamera(camera: ModelSceneCamera): ModelViewCamera {
  const dx = camera.position.x - camera.target.x, dy = camera.position.y - camera.target.y, dz = camera.position.z - camera.target.z
  const distance = Math.hypot(dx, dy, dz)
  return { yaw: Math.atan2(dx, dz) * 180 / Math.PI, pitch: Math.asin(Math.max(-1, Math.min(1, dy / distance))) * 180 / Math.PI,
    roll: camera.roll, distance, targetX: camera.target.x, targetY: camera.target.y, targetZ: camera.target.z,
    fov: camera.fov, projection: camera.projection, orthoHeight: camera.orthoHeight }
}

/** Resolve the explicitly active, render-enabled camera; missing means no render camera. */
export function activeSceneCamera(data: Model3DData): ModelSceneCamera | undefined {
  const scene = data.sceneObjects
  return scene?.objects.find((object): object is ModelSceneCamera => object.kind === 'camera' && object.id === scene.activeCameraId && object.renderable !== false)
}

/** Whether visible or output-active authored lighting needs shadow receivers. */
export function sceneShadowsEnabled(data: Model3DData, inspection: boolean): boolean {
  return !!data.content?.light.shadows || !!data.sceneObjects?.objects.some(object => object.kind === 'light'
    && object.shadows && (inspection ? object.visible !== false : object.renderable !== false))
}

/** Add an authored camera or light without touching legacy output settings. */
export function addSceneObject(data: Model3DData, object: ModelSceneObject): Model3DData {
  const scene = data.sceneObjects ?? { objects: [] }
  if (scene.objects.length >= 64 || scene.objects.some(existing => existing.id === object.id)) throw new Error('3D scene object limit or duplicate ID.')
  return { ...data, sceneObjects: { ...scene, objects: [...scene.objects, object],
    activeCameraId: object.kind === 'camera' && !scene.activeCameraId ? object.id : scene.activeCameraId } }
}

/** Replace one authored object immutably, retaining its ID and type. */
export function updateSceneObject(data: Model3DData, id: string, edit: (object: ModelSceneObject) => ModelSceneObject): Model3DData {
  const scene = data.sceneObjects
  if (!scene?.objects.some(object => object.id === id)) throw new Error('3D scene object no longer exists.')
  return { ...data, sceneObjects: { ...scene, objects: scene.objects.map(object => {
    if (object.id !== id) return object
    const next = edit(object)
    if (next.id !== id || next.kind !== object.kind) throw new Error('Cannot change a 3D object ID or type.')
    return next
  }) } }
}

/** Validate portable scene objects before source commit or load. */
export function assertSceneObjects(scene: ModelSceneObjects): void {
  if (!scene || !Array.isArray(scene.objects) || scene.objects.length > 64) throw new Error('Invalid 3D scene objects.')
  const ids = new Set<string>()
  for (const object of scene.objects) {
    if (!object || !/^[\w-]{1,100}$/.test(object.id) || ids.has(object.id) || !object.name?.trim() || object.name.length > 80
      || !['camera', 'light'].includes(object.kind)
      || ['visible', 'frozen', 'renderable'].some(flag => object[flag as keyof ModelSceneObject] !== undefined && typeof object[flag as keyof ModelSceneObject] !== 'boolean'))
      throw new Error('Invalid 3D scene object identity.')
    ids.add(object.id)
    const numbers = object.kind === 'camera'
      ? [object.position?.x, object.position?.y, object.position?.z, object.target?.x, object.target?.y, object.target?.z, object.roll, object.fov, object.orthoHeight]
      : [object.position?.x, object.position?.y, object.position?.z, object.target?.x, object.target?.y, object.target?.z, object.intensity]
    if (numbers.some(value => !Number.isFinite(value) || Math.abs(value) > 1e6)) throw new Error('Invalid 3D scene object coordinates.')
    if (object.kind === 'camera') {
      if (object.projection !== 'perspective' && object.projection !== 'orthographic' || object.fov < 5 || object.fov > 150
        || object.orthoHeight <= 0 || object.orthoHeight > 1e6 || Math.hypot(object.position.x - object.target.x, object.position.y - object.target.y, object.position.z - object.target.z) < .1)
        throw new Error('Invalid 3D scene camera.')
    } else if (!['directional', 'point', 'spot'].includes(object.lightType) || !/^#[0-9a-fA-F]{6}$/.test(object.color)
      || object.intensity < 0 || typeof object.shadows !== 'boolean') throw new Error('Invalid 3D scene light.')
  }
  if (scene.activeCameraId !== undefined && !scene.objects.some(object => object.kind === 'camera' && object.id === scene.activeCameraId))
    throw new Error('Active 3D camera does not exist.')
}
