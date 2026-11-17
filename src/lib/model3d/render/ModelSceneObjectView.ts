import { ConeGeometry, DirectionalLight, Group, Mesh, MeshBasicMaterial, PointLight, SphereGeometry, SpotLight, type Light, type Object3D } from 'three'
import type { ModelSceneLight, ModelSceneObject } from '../source/modelSceneObjects'
import { editorResourceBudget, type ResourceReservation } from '../../resources/budget'

/** Runtime adapter for authored scene lights and editor-only object markers.
 * Reconfiguration owns and disposes its small marker buffers; no Three object
 * enters source JSON. Markers exist only in inspection and never in GLB output. */
export class ModelSceneObjectView {
  readonly markers = new Group()
  readonly lights = new Group()
  private readonly byId = new Map<string, Object3D>()
  private authored: readonly ModelSceneLight[] = []
  private shadowStorage?: ResourceReservation

  /** Rebuild bounded scene objects from validated source; output visibility is
   * independent of editor visibility. The caller owns both group attachments. */
  configure(objects: readonly ModelSceneObject[], inspection: boolean, isolatedIds?: ReadonlySet<string>): void {
    const shadowCount = objects.filter(object => object.kind === 'light' && object.shadows
      && (inspection ? object.visible !== false : object.renderable !== false)).length
    const bytes = shadowCount * 512 * 512 * 8
    if (bytes && !this.shadowStorage) {
      this.shadowStorage = editorResourceBudget.reserve('gpu', bytes) ?? undefined
      if (!this.shadowStorage) throw new Error('3D scene lights exceed the managed shadow budget.')
      this.shadowStorage.commit()
    } else if (bytes && this.shadowStorage && !this.shadowStorage.resize(bytes)) throw new Error('3D scene lights exceed the managed shadow budget.')
    this.clear()
    if (!bytes) { this.shadowStorage?.release(); this.shadowStorage = undefined }
    this.authored = objects.filter((object): object is ModelSceneLight => object.kind === 'light' && object.renderable !== false)
    for (const object of objects) {
      if (inspection && object.visible !== false && (!isolatedIds || isolatedIds.has(object.id))) {
        const geometry = object.kind === 'camera' ? new ConeGeometry(.11, .24, 4) : new SphereGeometry(.11, 8, 6)
        const marker = new Mesh(geometry, new MeshBasicMaterial({ color: object.kind === 'camera' ? 0x67e8f9 : 0xfde68a,
          depthTest: true, transparent: true, opacity: .9 }))
        marker.position.set(object.position.x, object.position.y, object.position.z)
        marker.userData.choronoSceneObjectId = object.id
        marker.userData.choronoFrozen = object.frozen === true
        this.markers.add(marker); this.byId.set(object.id, marker)
      }
      if (object.kind === 'light' && (inspection ? object.visible !== false : object.renderable !== false))
        this.lights.add(createLight(object))
    }
  }

  /** Return an editor marker for picking, framing and selected bounds. */
  marker(id: string): Object3D | undefined { return this.byId.get(id) }

  /** Copy authored light records into a detached export group. */
  exportLights(): Group {
    const group = new Group()
    for (const source of this.authored) group.add(createLight(source))
    return group
  }

  /** Release marker geometry/materials and unlink all transient lights. */
  dispose(): void { this.clear(); this.shadowStorage?.release(); this.shadowStorage = undefined }
  private clear(): void {
    for (const marker of this.markers.children) if (marker instanceof Mesh) {
      marker.geometry.dispose(); (marker.material as MeshBasicMaterial).dispose()
    }
    this.markers.clear()
    for (const light of this.lights.children) if (light instanceof DirectionalLight || light instanceof SpotLight || light instanceof PointLight) light.shadow.dispose()
    this.lights.clear(); this.byId.clear(); this.authored = []
  }
}

/** Create a Y-up punctual Three light from one immutable metre-based source.
 * Directional/spot targets are children in local -Z after lookAt, which keeps
 * glTF exporter orientation stable without serializing editor target helpers. */
function createLight(source: ModelSceneLight): Light {
  const light = source.lightType === 'directional' ? new DirectionalLight(source.color, source.intensity)
    : source.lightType === 'spot' ? new SpotLight(source.color, source.intensity) : new PointLight(source.color, source.intensity)
  light.name = source.name; light.position.set(source.position.x, source.position.y, source.position.z)
  light.castShadow = source.shadows
  if (light instanceof DirectionalLight || light instanceof SpotLight || light instanceof PointLight) light.shadow.mapSize.set(512, 512)
  if (light instanceof DirectionalLight || light instanceof SpotLight) {
    light.lookAt(source.target.x, source.target.y, source.target.z)
    light.target.position.set(0, 0, -1); light.add(light.target)
  }
  return light
}
