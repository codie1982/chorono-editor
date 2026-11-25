import { AmbientLight, Box3, Box3Helper, Color, DirectionalLight, Group, Line, MathUtils, Mesh, OrthographicCamera, PerspectiveCamera, Points, Raycaster, Scene, Vector2, Vector3, SkinnedMesh, WebGLRenderer, type Material, type Object3D } from 'three'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import { editorResourceBudget, type ResourceReservation } from '../../resources/budget'
import { rectInsideRect, rectIntersectsRect, rectInsideCircle, rectIntersectsCircle, rectInsidePolygon, rectIntersectsPolygon, type SelectionContainMode } from '../../selection/canvasShapes'
import type { SelectionRegion } from '../../selection/selectionGesture'
import type { Model3DData, Model3DResource } from '../types'
import type { ModelGizmo, ModelInspection, ModelResourceLookup, ModelSelection, ModelWorldBounds, ModelWorldMeasurement } from '../inspection/types'
import type { ModelPreparedSource } from '../resources/modelInventory'
import { ModelPose } from './ModelPose'
import { ModelInspectionGrid } from './ModelInspectionGrid'
import { ModelSelectionOutline } from './ModelSelectionOutline'
import { PrimitiveScene } from '../modeling/poly/PrimitiveScene'
import { PRIMITIVE_SELECTION_INSTANCE } from '../modeling/poly/primitiveSource'
import { PrimitivePolyView } from '../modeling/poly/PrimitivePolyView'
import type { PolyProjection, PolySelectionMode } from '../modeling/poly/editSelection'
import { activeSceneCamera, SCENE_OBJECT_SELECTION_INSTANCE, sceneShadowsEnabled, viewFromCamera } from '../source/modelSceneObjects'
import { ModelSceneObjectView } from './ModelSceneObjectView'

/** A bounded 3D world for one prepared owner. Up to eight imported source
 * slots and 16 authored primitives share a camera/light/depth buffer. Slots
 * retain no source leases themselves: callers
 * must pin every media dependency for the complete synchronous draw. Switching
 * a slot's resource disposes the old pose before allocating its replacement.
 */
export class ModelComposition {
  private readonly scene = new Scene()
  private readonly placement = new Group()
  private readonly ambient = new AmbientLight(0xffffff)
  private readonly key = new DirectionalLight(0xffffff)
  private readonly perspective = new PerspectiveCamera()
  private readonly orthographic = new OrthographicCamera()
  private readonly poses = new Map<string, { source: ModelPreparedSource; pose: ModelPose }>()
  private readonly selection = new Box3Helper(new Box3(), 0xfb923c)
  private readonly extraSelections: Box3Helper[] = []
  private readonly selectionOutline = new ModelSelectionOutline()
  private readonly inspectionGrid = new ModelInspectionGrid(this.scene)
  private readonly primitives = new PrimitiveScene()
  private readonly sceneObjects = new ModelSceneObjectView()
  private camera: PerspectiveCamera | OrthographicCamera = this.perspective
  private shadowStorage?: ResourceReservation
  private currentInspection?: ModelInspection
  constructor(private readonly primary: ModelPreparedSource, private readonly sourceFor: (r: Model3DResource) => ModelPreparedSource | undefined) {
    this.scene.add(this.placement, this.ambient, this.key, this.sceneObjects.lights, this.sceneObjects.markers, this.selection, this.selectionOutline.root)
    this.placement.add(this.primitives.root)
    this.selection.visible = false
  }
  /** Prepare CPU state only, with no native render allocation or clock. Missing
   * resources/revisions fail explicitly rather than silently omitting a model. */
  configure(data: Model3DData, width: number, height: number, lookup?: ModelResourceLookup, inspection?: ModelInspection): void {
    const shadows = sceneShadowsEnabled(data, !!inspection)
    const entries = data.content ? Object.entries(data.content.instances) : [['primary', undefined] as const]
    const keep = new Set(entries.map(([id]) => id))
    for (const [id, old] of Array.from(this.poses)) if (!keep.has(id)) { old.pose.dispose(); this.poses.delete(id) }
    for (const [id, instance] of entries) {
      const resource = instance && id !== 'primary' ? lookup?.(instance.assetId) : undefined
      const source = id === 'primary' ? this.primary : resource && this.sourceFor(resource)
      if (!source) throw new Error(`3D assembly asset '${instance?.assetId}' is not prepared.`)
      let working = this.poses.get(id)
      if (working && working.source !== source) { working.pose.dispose(); this.poses.delete(id); working = undefined }
      if (!working) { working = { source, pose: new ModelPose(source) }; this.poses.set(id, working); working.pose.attachTo(this.placement) }
      working.pose.sample(instance, data.content?.explode ?? 0, !!inspection)
      working.pose.setInspectionIsolation(inspection?.isolated && new Set(inspection.isolated.filter(s => s.instanceId === id).map(s => s.nodeId)))
      working.pose.setShadows(shadows)
    }
    this.primitives.configure(data.modeling, shadows, !!inspection)
    this.primitives.setInspectionIsolation(inspection?.isolated && new Set(inspection.isolated.filter(s => s.instanceId === PRIMITIVE_SELECTION_INSTANCE).map(s => s.nodeId)))
    this.placement.position.set(data.position.x, data.position.y, data.position.z)
    this.placement.rotation.set(...(['x', 'y', 'z'] as const).map(k => MathUtils.degToRad(data.rotation[k])) as [number, number, number])
    if (data.content?.turntable.enabled) this.placement.rotation.y += MathUtils.degToRad(data.content.turntable.speed * (data.content.timeMs ?? 0) / 1000)
    this.placement.scale.setScalar(data.scale)
    this.sceneObjects.configure(data.sceneObjects?.objects ?? [], !!inspection,
      inspection?.isolated && new Set(inspection.isolated.filter(s => s.instanceId === SCENE_OBJECT_SELECTION_INSTANCE).map(s => s.nodeId)))
    const c = inspection?.camera ?? (activeSceneCamera(data) && viewFromCamera(activeSceneCamera(data)!))
      ?? { ...data.camera, projection: data.content?.view.projection ?? 'perspective', orthoHeight: data.content?.view.orthoHeight ?? 2.8 }
    this.camera = c.projection === 'orthographic' ? this.orthographic : this.perspective
    const yaw = MathUtils.degToRad(c.yaw), pitch = MathUtils.degToRad(c.pitch), target = new Vector3(c.targetX, c.targetY, c.targetZ)
    this.camera.position.set(c.distance * Math.sin(yaw) * Math.cos(pitch), c.distance * Math.sin(pitch), c.distance * Math.cos(yaw) * Math.cos(pitch)).add(target)
    if (this.camera instanceof PerspectiveCamera) { this.camera.fov = c.fov; this.camera.aspect = width / height }
    else { const half = c.orthoHeight / 2; this.camera.left = -half * width / height; this.camera.right = half * width / height; this.camera.top = half; this.camera.bottom = -half }
    // At exactly ±90° the usual Y-up vector is parallel to the viewing ray.
    // A yaw-relative horizontal up vector keeps the top/bottom views stable.
    this.camera.up.set(0, 1, 0)
    if (Math.abs(c.pitch) === 90) this.camera.up.set(-Math.sin(yaw) * Math.sign(c.pitch), 0, -Math.cos(yaw) * Math.sign(c.pitch))
    // Editor clipping is view-local. Source/output renders retain their fixed
    // defaults and never inherit inspection settings.
    this.camera.near = inspection?.clipNear ?? .001; this.camera.far = inspection?.clipFar ?? 10000; this.camera.lookAt(target)
    this.camera.rotateZ(MathUtils.degToRad(c.roll ?? 0))
    this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld(true)
    this.ambient.intensity = data.lighting.ambient * (data.content?.environment.intensity ?? 1); this.ambient.color.set(data.content?.environment.color ?? '#ffffff')
    this.key.intensity = data.sceneObjects?.objects.some(object => object.kind === 'light' && object.renderable !== false) ? 0 : data.lighting.key
    this.key.color.set(data.content?.light.color ?? '#ffffff')
    const light = data.content?.light.position ?? { x: 3, y: 5, z: 4 }; this.key.position.set(light.x, light.y, light.z)
    this.key.castShadow = this.key.intensity > 0 && !!data.content?.light.shadows; this.key.shadow.mapSize.set(512, 512)
    if (this.key.castShadow && !this.shadowStorage) {
      this.shadowStorage = editorResourceBudget.reserve('gpu', 512 * 512 * 8) ?? undefined
      if (!this.shadowStorage) throw new Error('3D shadow map exceeds the managed resource budget.')
      this.shadowStorage.commit()
    } else if (!this.key.castShadow && this.shadowStorage) this.releaseShadow()
    // Inspection helpers are independent of imported content. Raster/output
    // callers omit inspection and cannot accidentally render the grid.
    this.inspectionGrid.configure(c, width, height, inspection?.showGrid === true, inspection?.grid)
    this.currentInspection = inspection; this.scene.updateMatrixWorld(true)
    const selected = inspection?.selections ?? (inspection?.selection ? [inspection.selection] : [])
    const helpers = [this.selection, ...this.extraSelections]
    helpers.forEach(helper => { helper.visible = false })
    const nodes = selected.map(value => this.nodeFor(value)).filter((node): node is Object3D => !!node && visibleInHierarchy(node) && !frozenInHierarchy(node))
    const outlined = this.selectionOutline.configure(nodes)
    selected.forEach((value, index) => {
      if (index > 255) return
      const node = this.nodeFor(value)
      if (!node || !visibleInHierarchy(node) || frozenInHierarchy(node)) return
      let helper = helpers[index]
      if (!helper) { helper = new Box3Helper(new Box3(), 0xfb923c); this.extraSelections.push(helper); this.scene.add(helper) }
      if (outlined.has(node)) return
      refreshSkinBounds(node); helper.box.setFromObject(node); helper.visible = !helper.box.isEmpty()
    })
  }
  /** Render the configured private world without leaking native graph handles. */
  draw(renderer: WebGLRenderer): void { renderer.render(this.scene, this.camera) }
  /** Export authored output meshes, lights and the configured active camera.
   * Editor grid, selection and gizmos are excluded. Deep geometry
   * and material copies freeze the asynchronous exporter against later edits;
   * shared texture image bytes remain borrowed until the operation resolves. */
  async exportGlb(): Promise<Uint8Array> {
    const exportScene = new Scene(), placement = cloneSkeleton(this.placement), light = this.key.clone(), camera = this.camera.clone()
    const geometries = new Set<Mesh['geometry']>(), materials = new Set<Material>()
    placement.traverse(node => {
      if (!(node instanceof Mesh)) return
      node.geometry = node.geometry.clone(); geometries.add(node.geometry)
      const cloned = (Array.isArray(node.material) ? node.material.map(material => material.clone()) : node.material.clone())
      node.material = cloned; for (const material of Array.isArray(cloned) ? cloned : [cloned]) materials.add(material)
    })
    light.lookAt(this.key.target.position)
    light.target.position.set(0, 0, -1); light.add(light.target)
    camera.name = 'Chorono Output'
    exportScene.add(placement, camera)
    if (this.key.intensity > 0) exportScene.add(light)
    exportScene.add(this.sceneObjects.exportLights())
    try {
      const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js')
      const result = await new GLTFExporter().parseAsync(exportScene, { binary: true, onlyVisible: true, animations: [], includeCustomExtensions: false })
      if (!(result instanceof ArrayBuffer)) throw new Error('3D output exporter did not return a binary GLB.')
      return new Uint8Array(result)
    } finally {
      geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose())
      exportScene.clear()
    }
  }
  /** Borrow the selected authored mesh for a single editor-only query. */
  private polyView(id: string, width: number, height: number): PrimitivePolyView | null {
    const node = this.primitives.getNode(id), topology = this.primitives.getTopology(id)
    return node && topology && visibleInHierarchy(node) && !frozenInHierarchy(node)
      ? new PrimitivePolyView(node, this.camera, topology, width, height) : null
  }
  /** Project plain-data logical components to CSS pixels. */
  projectPoly(id: string, width: number, height: number): PolyProjection | null { return this.polyView(id, width, height)?.project() ?? null }
  /** Pick one logical component; view-only and never enters render output. */
  pickPoly(id: string, mode: PolySelectionMode, x: number, y: number, width: number, height: number): string | null {
    return this.polyView(id, width, height)?.pick(mode, x, y) ?? null
  }
  private nodeFor(s: ModelSelection) { return s.instanceId === SCENE_OBJECT_SELECTION_INSTANCE ? this.sceneObjects.marker(s.nodeId)
    : s.instanceId === PRIMITIVE_SELECTION_INSTANCE
    ? this.primitives.getNode(s.nodeId) : this.poses.get(s.instanceId)?.pose.getNode(s.nodeId) }
  private selected() { const s = this.currentInspection?.selection; return s ? this.nodeFor(s) : undefined }
  /** Ray hit returns the closest imported ancestor, including meshes nested in
   * a multi-primitive node. Helpers and invisible branches are excluded. */
  pick(x: number, y: number, width: number, height: number): ModelSelection | null {
    this.selection.visible = false
    refreshSkinBounds(this.placement)
    const ray = new Raycaster(); ray.setFromCamera(new Vector2(x / width * 2 - 1, 1 - y / height * 2), this.camera)
    for (const hit of ray.intersectObject(this.sceneObjects.markers, true)) {
      const id = hit.object.userData.choronoSceneObjectId
      if (typeof id === 'string' && !frozenInHierarchy(hit.object)) return { instanceId: SCENE_OBJECT_SELECTION_INSTANCE, nodeId: id }
    }
    for (const hit of ray.intersectObject(this.placement, true)) {
      let n = hit.object, visible = true
      for (let p: typeof n | null = n; p; p = p.parent) if (!p.visible) visible = false
      if (!visible || frozenInHierarchy(hit.object)) continue
      if (typeof hit.object.userData.choronoPrimitiveId === 'string') return { instanceId: PRIMITIVE_SELECTION_INSTANCE, nodeId: hit.object.userData.choronoPrimitiveId }
      while (!n.userData.choronoNode && n.parent) n = n.parent
      for (const [id, { pose }] of Array.from(this.poses)) if (pose.getNode(n.userData.choronoNode) === n) return { instanceId: id, nodeId: n.userData.choronoNode }
    }
    return null
  }
  /** Select visible 3D objects by their projected screen-space bounds. Region
   * geometry reuses 2D selection predicates; bounds are in CSS pixels and the
   * active inspection camera handles perspective/orthographic projection.
   * Non-renderable or fully behind-camera nodes are excluded. */
  selectRegion(region: SelectionRegion, containment: SelectionContainMode, width: number, height: number): ModelSelection[] {
    refreshSkinBounds(this.placement)
    const bounds = collectVisibleBounds(this.placement)
    const matches = (rect: { x: number; y: number; w: number; h: number }) => {
      if (region.kind === 'box') return containment === 'inside' ? rectInsideRect(rect, region) : rectIntersectsRect(rect, region)
      if (region.kind === 'circle') { const circle = { x: region.cx, y: region.cy, r: region.r }; return containment === 'inside' ? rectInsideCircle(rect, circle) : rectIntersectsCircle(rect, circle) }
      if (region.kind === 'lasso') return containment === 'inside' ? rectInsidePolygon(rect, region.points) : rectIntersectsPolygon(rect, region.points)
      return rectIntersectsCircle(rect, { x: region.cx, y: region.cy, r: region.r })
    }
    const found: ModelSelection[] = []
    for (const [instanceId, { source, pose }] of Array.from(this.poses)) for (const info of source.inventory.nodes) {
      const node = pose.getNode(info.id), rect = node && projectedVisibleBounds(bounds.get(node), this.camera, width, height)
      if (rect && node && !frozenInHierarchy(node) && matches(rect)) found.push({ instanceId, nodeId: info.id })
    }
    for (const object of this.primitives.root.children) {
      const rect = projectedVisibleBounds(bounds.get(object), this.camera, width, height)
      if (rect && !frozenInHierarchy(object) && matches(rect)) found.push({ instanceId: PRIMITIVE_SELECTION_INSTANCE, nodeId: object.userData.choronoPrimitiveId })
    }
    for (const object of this.sceneObjects.markers.children) {
      const rect = projectedVisibleBounds(new Box3().setFromObject(object), this.camera, width, height)
      if (rect && !frozenInHierarchy(object) && matches(rect)) found.push({ instanceId: SCENE_OBJECT_SELECTION_INSTANCE, nodeId: object.userData.choronoSceneObjectId })
    }
    return found
  }
  /** Project selected primitive or imported-node XYZ axes to CSS pixels.
   * Returned scale converts a handle drag into local source units, including
   * imported ancestor transforms. Primitive local units are metres. */
  gizmo(width: number, height: number): ModelGizmo | null {
    const node = this.selected(), s = this.currentInspection?.selection
    if (!node || !s || !visibleInHierarchy(node) || frozenInHierarchy(node)) return null
    const position = node.getWorldPosition(new Vector3()), project = (v: Vector3) => { v.project(this.camera); return { x: (v.x + 1) * width / 2, y: (1 - v.y) * height / 2 } }
    const origin = project(position.clone()), axes = {} as ModelGizmo['axes'], units = {} as Record<'x' | 'y' | 'z', number>
    for (const axis of ['x', 'y', 'z'] as const) {
      const local = node.position.clone(); local[axis] += 1
      const end = project(node.parent ? node.parent.localToWorld(local) : local), dx = end.x - origin.x, dy = end.y - origin.y, length = Math.hypot(dx, dy)
      const factor = length > .001 ? 65 / length : 0
      axes[axis] = { x: origin.x + dx * factor, y: origin.y + dy * factor }; units[axis] = factor
    }
    refreshSkinBounds(node)
    const box = collectVisibleBounds(this.placement).get(node)
    const rect = projectedVisibleBounds(box, this.camera, width, height)
    const screenRadius = rect ? Math.max(52, Math.min(180, Math.max(rect.w, rect.h) * .62 + 12)) : 65
    return { origin, axes, unitsPerHandle: units, screenRadius,
      localUnitsPerPresentation: s.instanceId === PRIMITIVE_SELECTION_INSTANCE || s.instanceId === SCENE_OBJECT_SELECTION_INSTANCE ? 1 : this.poses.get(s.instanceId)!.pose.radius }
  }
  /** Read visible Y-up world bounds after current pose, primitive and scene
   * transforms. Imported spans are normalized until their instance is
   * calibrated; no geometry or source value is modified by this query. */
  measure(selection: ModelSelection): ModelWorldMeasurement | null {
    refreshSkinBounds(this.placement)
    const bounds = collectVisibleBounds(this.placement), node = this.nodeFor(selection), box = node && bounds.get(node)
    if (!box || box.isEmpty()) return null
    const result: ModelWorldMeasurement = { selected: dimensionsOf(box) }
    if (selection.instanceId !== PRIMITIVE_SELECTION_INSTANCE) {
      const root = this.poses.get(selection.instanceId)?.pose.getMeasureRoot(), instanceBox = root && bounds.get(root)
      if (instanceBox && !instanceBox.isEmpty()) result.instance = dimensionsOf(instanceBox)
    }
    return result
  }
  /** Frame selected world bounds; no source camera is written. */
  frame() {
    const node = this.selected(); refreshSkinBounds(node ?? this.placement)
    const bounds = new Box3().setFromObject(node ?? this.placement)
    if (bounds.isEmpty()) return this.primary.root.userData.choronoEmptyScene === true
      ? { target: { x: 0, y: 0, z: 0 }, distance: 3.5, orthoHeight: 2.8 } : null
    const target = bounds.getCenter(new Vector3()), radius = Math.max(.01, bounds.getSize(new Vector3()).length() / 2)
    return { target: { x: target.x, y: target.y, z: target.z }, distance: Math.max(.1, radius * 3.5), orthoHeight: radius * 2.8 }
  }
  /** A secondary source may be evicted independently once consumer pins close.
   * Drop its borrowed pose before its shared geometry/textures are destroyed. */
  releaseSource(source: ModelPreparedSource): void {
    for (const [id, value] of Array.from(this.poses)) if (value.source === source) { value.pose.dispose(); this.poses.delete(id) }
  }
  /** Dispose GPU storage before uncharging; clearing the handle permits a later
   * explicit re-enable to allocate a fresh target rather than a disposed one. */
  private releaseShadow(): void { this.key.shadow.dispose(); this.key.shadow.map = null; this.shadowStorage?.release(); this.shadowStorage = undefined }
  /** Dispose mutable poses/helpers/shadow maps before shared sources disappear. */
  dispose(): void {
    this.poses.forEach(v => v.pose.dispose()); this.poses.clear()
    for (const helper of [this.selection, ...this.extraSelections]) { helper.geometry.dispose(); (Array.isArray(helper.material) ? helper.material : [helper.material]).forEach(m => m.dispose()) }
    this.primitives.dispose()
    this.sceneObjects.dispose()
    this.selectionOutline.dispose()
    this.inspectionGrid.dispose()
    this.releaseShadow(); this.scene.clear()
  }
}

/** A selected descendant remains hidden when any imported ancestor is hidden. */
function visibleInHierarchy(node: Object3D): boolean {
  for (let current: Object3D | null = node; current; current = current.parent) if (!current.visible) return false
  return true
}

/** A frozen parent locks its complete imported subtree from editor picking. */
function frozenInHierarchy(node: Object3D): boolean {
  for (let current: Object3D | null = node; current; current = current.parent) if (current.userData.choronoFrozen === true) return true
  return false
}

/** Exact inspected skin bounds use the current pose. Output rendering disables
 * skin frustum culling instead of scanning every vertex on each export frame.
 * Only selection/picking/framing pays this bounded CPU geometry cost. */
function refreshSkinBounds(root: import('three').Object3D): void {
  root.updateWorldMatrix(true, true)
  root.traverse(node => { if (node instanceof SkinnedMesh) { node.skeleton.update(); node.computeBoundingBox(); node.computeBoundingSphere() } })
}

/** Collect visible subtree bounds once, so selecting many imported nodes does
 * not repeatedly traverse shared descendants. Sampled visibility is respected. */
function collectVisibleBounds(root: Object3D): WeakMap<Object3D, Box3> {
  const bounds = new WeakMap<Object3D, Box3>()
  const visit = (node: Object3D, ancestorsVisible: boolean): Box3 => {
    const box = new Box3(), visible = ancestorsVisible && node.visible
    if (visible) {
      if (node instanceof Mesh || node instanceof Line || node instanceof Points) {
        if (!(node instanceof SkinnedMesh) && !node.geometry.boundingBox) node.geometry.computeBoundingBox()
        const local = node instanceof SkinnedMesh ? node.boundingBox : node.geometry.boundingBox
        if (local) box.union(local.clone().applyMatrix4(node.matrixWorld))
      }
      for (const child of node.children) box.union(visit(child, true))
    }
    bounds.set(node, box)
    return box
  }
  visit(root, true)
  return bounds
}

/** Project visible world bounds to CSS pixels. Clipped corners are ignored;
 * this is a bounds selection, not a pixel-perfect silhouette test. */
function projectedVisibleBounds(box: Box3 | undefined, camera: PerspectiveCamera | OrthographicCamera, width: number, height: number) {
  if (!box || box.isEmpty()) return null
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity, visible = false
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const point = new Vector3(x, y, z).project(camera)
    if (point.z < -1 || point.z > 1 || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue
    visible = true
    const px = (point.x + 1) * width / 2, py = (1 - point.y) * height / 2
    left = Math.min(left, px); top = Math.min(top, py); right = Math.max(right, px); bottom = Math.max(bottom, py)
  }
  return visible ? { x: left, y: top, w: right - left, h: bottom - top } : null
}

/** Convert a world AABB to the shared Width X / Length Z / Height Y contract. */
function dimensionsOf(box: Box3): ModelWorldBounds {
  const size = box.getSize(new Vector3()), center = box.getCenter(new Vector3())
  return { width: size.x, length: size.z, height: size.y, center: { x: center.x, y: center.y, z: center.z } }
}
