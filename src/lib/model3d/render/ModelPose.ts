import { modelFraming } from './modelFraming'
import { AnimationMixer, Box3, Group, LoopOnce, MathUtils, Material, Mesh, MeshStandardMaterial, Object3D, SkinnedMesh, Vector3, SRGBColorSpace } from 'three'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { editorResourceBudget, type ResourceReservation } from '../../resources/budget'
import type { ModelContentInstance } from '../content/types'
import type { ModelPreparedSource } from '../resources/modelInventory'
import { applyPbrSurface } from '../material/pbrSurface'

/** One bounded mutable pose for a composition slot. Skeletons and materials are
 * cloned; geometry and immutable textures are borrowed from a pinned source.
 * Every sample resets TRS/morph state and the mixer before absolute seeking,
 * making backwards seeks and A→B→A independent. No clock or rAF is owned here.
 */
export class ModelPose {
  private readonly root: Object3D
  private readonly framing = new Group()
  private readonly placement = new Group()
  private readonly nodes = new Map<string, Object3D>()
  private readonly rest: { node: Object3D; position: Vector3; quaternion: Object3D['quaternion']; scale: Vector3; visible: boolean; morph?: number[] }[] = []
  private readonly explodeOffsets = new Map<Object3D, Vector3>()
  private readonly materials = new Set<Material>()
  private readonly mixer: AnimationMixer
  private reservation: ResourceReservation
  private disposed = false
  private readonly baselines: Map<string, ModelPreparedSource['inventory']['nodes'][number]>
  readonly radius: number
  constructor(private readonly source: ModelPreparedSource) {
    this.baselines = new Map(source.inventory.nodes.map(n => [n.id, n]))
    const bytes = Math.max(4096, source.inventory.nodes.length * 2048 + source.materials.size * 4096)
    const reservation = editorResourceBudget.reserve('derived', bytes)
    if (!reservation) throw new Error('3D pose exceeds the managed resource budget.')
    this.reservation = reservation
    try {
      this.root = clone(source.root)
      const copies = new Map<Material, Material>()
      this.root.traverse(node => {
        if (node.userData.choronoNode) this.nodes.set(node.userData.choronoNode, node)
        if (node instanceof SkinnedMesh) node.frustumCulled = false
        if (node instanceof Mesh) {
          const material = (m: Material) => { let copy = copies.get(m); if (!copy) { copy = m.clone(); copies.set(m, copy); this.materials.add(copy) } return copy }
          node.material = Array.isArray(node.material) ? node.material.map(material) : material(node.material)
        }
        this.rest.push({ node, position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone(), visible: node.visible,
          morph: node instanceof Mesh ? node.morphTargetInfluences?.slice() : undefined })
      })
      this.root.updateMatrixWorld(true)
      const { center, radius } = modelFraming(this.root)
      this.radius = radius
      // Descend through unary import wrappers, then separate the first real
      // assembly branches. A single mesh never invents fracture/topology.
      const branches = (node: Object3D): Object3D[] => {
        const children = node.children.filter(child => !new Box3().setFromObject(child).isEmpty())
        return children.length > 1 ? children : children.length === 1 ? branches(children[0]) : []
      }
      for (const node of branches(this.root)) {
        const partCenter = new Box3().setFromObject(node).getCenter(new Vector3())
        const localCenter = node.parent ? node.parent.worldToLocal(center.clone()) : center.clone()
        if (node.parent) node.parent.worldToLocal(partCenter)
        this.explodeOffsets.set(node, partCenter.sub(localCenter).normalize().multiplyScalar(this.radius))
      }
      this.framing.scale.setScalar(1 / this.radius); this.framing.position.copy(center).multiplyScalar(-1 / this.radius); this.framing.add(this.root)
      this.placement.add(this.framing); this.mixer = new AnimationMixer(this.root); reservation.commit()
    } catch (error) { this.materials.forEach(m => m.dispose()); reservation.release(); throw error }
  }
  /** Borrow a node for the adjacent Three composition's synchronous geometric
   * queries. Never pass this native handle into application/UI/source data. */
  getNode(id: string): Object3D | undefined { return this.nodes.get(id) }
  /** Borrow only within the owning composition for world-bounds queries. */
  getMeasureRoot(): Object3D { return this.placement }
  /** Apply a temporary view filter after sample. Selected subtrees and their
   * ancestors stay visible; the next sample restores authored visibility. */
  setInspectionIsolation(ids?: ReadonlySet<string>): void {
    if (!ids) return
    const allowed = new Set<Object3D>()
    for (const id of Array.from(ids)) {
      const selected = this.nodes.get(id)
      if (!selected) continue
      selected.traverse(node => allowed.add(node))
      for (let parent: Object3D | null = selected.parent; parent; parent = parent.parent) allowed.add(parent)
    }
    this.root.traverse(node => { node.visible = node.visible && allowed.has(node) })
  }
  /** Connect the owned placement wrapper to the adjacent backend world. */
  attachTo(parent: Object3D): void { parent.add(this.placement) }
  /** Configure native mesh shadow flags without exposing mutable node maps. */
  setShadows(enabled: boolean): void { this.root.traverse(n => { if (n instanceof Mesh) { n.castShadow = enabled; n.receiveShadow = enabled } }) }
  /** Reset native state and sample one instance. Changed node channels override
   * rest values only; native clip channels are protected by source validation.
   * Freeze markers affect editor picking; render-disabled nodes stay visible
   * only when an inspection view is supplied. Material copies are private to
   * this pose; texture images remain borrowed. */
  sample(instance?: ModelContentInstance, explode = 0, inspection = false): void {
    if (this.disposed) throw new Error('Expired 3D pose.')
    this.mixer.stopAllAction()
    for (const r of this.rest) {
      r.node.position.copy(r.position); r.node.quaternion.copy(r.quaternion); r.node.scale.copy(r.scale); r.node.visible = r.visible
      r.node.userData.choronoFrozen = false
      if (r.morph && r.node instanceof Mesh && r.node.morphTargetInfluences) r.node.morphTargetInfluences.splice(0, r.morph.length, ...r.morph)
    }
    if (instance && instance.revision !== this.source.inventory.revision) throw new Error('3D asset revision changed. Reimport explicitly before editing its nodes.')
    const native = instance?.native
    if (native) {
      const clip = this.source.clips[Number(native.clipId.slice(1))]
      if (!clip || native.outMs > clip.duration * 1000 + .001) throw new Error('Native 3D clip or range is missing from this asset revision.')
      const action = this.mixer.clipAction(clip); action.reset().setLoop(LoopOnce, 1); action.clampWhenFinished = true; action.play()
      this.mixer.setTime(Math.min(native.outMs, Math.max(native.inMs, native.timeMs)) / 1000)
    }
    for (const [id, pose] of Object.entries(instance?.nodes ?? {})) {
      const node = this.nodes.get(id), baseline = this.baselines.get(id)
      if (!node || !baseline) throw new Error('A 3D node reference is missing from this asset revision.')
      for (const field of ['position', 'rotation', 'scale'] as const) for (const axis of ['x', 'y', 'z'] as const) {
        if (pose[field][axis] !== baseline[field][axis]) {
          if (native && this.source.inventory.clips[Number(native.clipId.slice(1))].channels.some(c => c.nodeId === id && c.field === field)) throw new Error('This node channel belongs to a native clip. Disable the native clip before authoring its pose.')
          node[field][axis] = field === 'rotation' ? MathUtils.degToRad(pose[field][axis]) : pose[field][axis]
        }
      }
      node.visible = pose.visible && (inspection || pose.renderable !== false)
      node.userData.choronoFrozen = pose.frozen === true

    }
    if (explode) this.explodeOffsets.forEach((offset, node) => node.position.addScaledVector(offset, explode))
    this.placement.position.set(instance?.position.x ?? 0, instance?.position.y ?? 0, instance?.position.z ?? 0)
    this.placement.rotation.set(...(['x', 'y', 'z'] as const).map(k => MathUtils.degToRad(instance?.rotation[k] ?? 0)) as [number, number, number])
    this.placement.scale.setScalar((instance?.scale ?? 1) * (instance?.calibration?.metersPerNormalizedUnit ?? 1))
    this.placement.visible = instance?.visible !== false && (inspection || instance?.renderable !== false)
    this.placement.userData.choronoFrozen = instance?.frozen === true
    for (const material of Array.from(this.materials)) {
      const id: string = material.userData.choronoMaterial, m = instance?.materials[id] ?? this.source.inventory.materials[id]
      if (!m) continue
      if (!(material instanceof MeshStandardMaterial)) throw new Error('Material override requires an imported PBR material.')
      applyPbrSurface(material, m, this.source.materials.get(id) as MeshStandardMaterial)
      for (const slot of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'] as const) {
        const index = m[slot] ?? this.source.inventory.materials[id]?.[slot] ?? -1, texture = index < 0 ? null : this.source.textures[index]
        if (index >= 0 && !texture) throw new Error('Embedded 3D texture index is missing.')
        if (texture && (texture.colorSpace === SRGBColorSpace) !== (slot === 'map' || slot === 'emissiveMap')) throw new Error('Texture color space does not match this material slot.')
        if (material[slot] !== texture) { material[slot] = texture; material.needsUpdate = true }
      }
    }
  }
  /** Release only pose-owned material/skeleton state, never shared geometry,
   * textures, source bitmaps or another composition slot's bones. Idempotent. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true; this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.root)
    this.root.traverse(n => { if (n instanceof SkinnedMesh) n.skeleton.dispose() })
    this.materials.forEach(m => m.dispose()); this.placement.removeFromParent(); this.placement.clear(); this.reservation.release()
  }
}
