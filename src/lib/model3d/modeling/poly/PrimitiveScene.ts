import { DoubleSide, Group, MathUtils, Mesh, MeshStandardMaterial, type BufferGeometry } from 'three'
import { editorResourceBudget, type ResourceReservation } from '../../../resources/budget'
import type { ModelModelingSource, PrimitiveObject } from './primitiveSource'
import { assertModelingSource } from './primitiveSource'
import { primitiveMeshSnapshot, type MeshSnapshot } from './meshSnapshot'
import { primitiveRenderGeometry } from './PrimitiveRenderGeometry'
import { applyPbrSurface, primitiveSurfaceDefaults } from '../../material/pbrSurface'

interface PrimitiveEntry { mesh: Mesh<BufferGeometry, MeshStandardMaterial>; topology: MeshSnapshot; signature: string; reservation: ResourceReservation; visible: boolean }

/** Owns derived Three meshes for authored primitives in one ModelComposition.
 * Geometry is rebuilt only when typed source parameters change; position and
 * material edits reuse it. No GPU object escapes into portable source or Undo.
 * Each entry holds a managed derived-memory lease and is disposed on removal,
 * replacement or composition teardown. Instances hold separate mutable state. */
export class PrimitiveScene {
  readonly root = new Group()
  private readonly entries = new Map<string, PrimitiveEntry>()

  /** Sync one validated source into the private scene. Inspection retains
   * render-disabled objects for authoring while output omits them. A replacement
   * is acquired before its predecessor is released, so allocation failure leaves
   * the last valid mesh intact for the caller's error display. */
  configure(source: ModelModelingSource | undefined, shadows: boolean, inspection = false): void {
    if (source) assertModelingSource(source)
    const objects = source?.objects ?? [], keep = new Set(objects.map(object => object.id))
    const staged = new Map<string, PrimitiveEntry>()
    try {
      for (const object of objects) {
        const signature = JSON.stringify(object.geometry)
        if (this.entries.get(object.id)?.signature !== signature) staged.set(object.id, this.createEntry(object, signature))
      }
    } catch (error) {
      for (const entry of Array.from(staged.values())) this.release(entry)
      throw error
    }
    for (const object of objects) {
      const next = staged.get(object.id), old = this.entries.get(object.id)
      if (next) { this.root.add(next.mesh); if (old) this.release(old); this.entries.set(object.id, next) }
      this.applyObject(this.entries.get(object.id)!, object, shadows, inspection)
    }
    for (const [id, old] of Array.from(this.entries)) if (!keep.has(id)) { this.release(old); this.entries.delete(id) }
  }

  /** Borrow a mesh only for adjacent pick, bounds and selection queries. */
  getNode(id: string): Mesh | undefined { return this.entries.get(id)?.mesh }
  /** Borrow logical edit topology derived from the same primitive parameters. */
  getTopology(id: string): MeshSnapshot | undefined { return this.entries.get(id)?.topology }

  /** Restrict this configured view to selected primitive IDs. Undefined
   * restores all; source geometry and visibility are never changed. */
  setInspectionIsolation(ids?: ReadonlySet<string>): void {
    for (const [id, entry] of Array.from(this.entries)) entry.mesh.visible = entry.visible && (!ids || ids.has(id))
  }

  private createEntry(object: PrimitiveObject, signature: string): PrimitiveEntry {
    const topology = primitiveMeshSnapshot(object.geometry)
    const geometry = primitiveRenderGeometry(topology)
    const material = new MeshStandardMaterial({ color: object.color, roughness: .7, metalness: .12, side: object.geometry.kind === 'plane' ? DoubleSide : undefined })
    const bytes = 2048 + (geometry.index?.array.byteLength ?? 0) + Object.values(geometry.attributes).reduce((sum, attribute) => sum + attribute.array.byteLength, 0)
    const reservation = editorResourceBudget.reserve('derived', bytes)
    if (!reservation) { geometry.dispose(); material.dispose(); throw new Error('3D primitive exceeds the managed geometry budget.') }
    const mesh = new Mesh(geometry, material)
    mesh.userData.choronoPrimitiveId = object.id
    reservation.commit()
    return { mesh, topology, signature, reservation, visible: object.visible !== false }
  }

  private applyObject(entry: PrimitiveEntry, object: PrimitiveObject, shadows: boolean, inspection: boolean): void {
    const mesh = entry.mesh
    entry.visible = object.visible !== false && (inspection || object.renderable !== false)
    mesh.visible = entry.visible
    mesh.userData.choronoFrozen = object.frozen === true
    mesh.name = object.name
    mesh.position.set(object.position.x, object.position.y, object.position.z)
    mesh.rotation.set(MathUtils.degToRad(object.rotation.x), MathUtils.degToRad(object.rotation.y), MathUtils.degToRad(object.rotation.z))
    mesh.scale.setScalar(object.scale)
    mesh.material.color.set(object.color)
    applyPbrSurface(mesh.material, { ...primitiveSurfaceDefaults, ...object.material,
      doubleSided: object.material?.doubleSided ?? object.geometry.kind === 'plane', color: object.color })
    mesh.castShadow = shadows; mesh.receiveShadow = shadows
  }

  private release(entry: PrimitiveEntry): void {
    entry.mesh.removeFromParent(); entry.mesh.geometry.dispose(); entry.mesh.material.dispose(); entry.reservation.release()
  }

  /** Idempotently release all geometry, materials and managed leases. */
  dispose(): void { for (const entry of Array.from(this.entries.values())) this.release(entry); this.entries.clear(); this.root.clear() }
}
