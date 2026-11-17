import { BackSide, Group, InstancedMesh, Line, Matrix4, Mesh, MeshBasicMaterial, Points, SkinnedMesh, Vector3, type Object3D } from 'three'

const MAX_OUTLINED_MESHES = 32
const MAX_OUTLINED_VERTICES = 150_000
const OUTLINE_SCALE = 1.025

/** Editor-only inverted hulls for selected static meshes. Each hull borrows
 * its mesh's geometry and world transform; no source graph or geometry is
 * mutated. Skinned, instanced and oversized selections use the caller's box
 * fallback instead. Instances and one material are owned and disposed here. */
export class ModelSelectionOutline {
  readonly root = new Group()
  private readonly material = new MeshBasicMaterial({ color: '#fb923c', side: BackSide, depthTest: true, depthWrite: false, toneMapped: false })
  private readonly outlines = new Map<Mesh, Mesh>()

  /** Sync hulls to visible selected nodes after pose/world matrices update.
   * Returns selected nodes fully represented by hulls. No GPU readback occurs. */
  configure(selected: readonly Object3D[]): ReadonlySet<Object3D> {
    const wanted = new Set<Mesh>(), covered = new Set<Object3D>()
    let vertexCount = 0
    for (const node of selected) {
      const meshes: Mesh[] = []
      let unsupported = false
      node.traverseVisible(child => {
        if (child instanceof SkinnedMesh || child instanceof InstancedMesh || child instanceof Line || child instanceof Points) {
          unsupported = true
        } else if (child instanceof Mesh) {
          if (!child.geometry.getAttribute('position')) unsupported = true
          else meshes.push(child)
        }
      })
      const count = meshes.reduce((sum, mesh) => sum + mesh.geometry.getAttribute('position').count, 0)
      if (unsupported || meshes.length === 0 || wanted.size + meshes.length > MAX_OUTLINED_MESHES || vertexCount + count > MAX_OUTLINED_VERTICES) continue
      vertexCount += count
      covered.add(node)
      meshes.forEach(mesh => wanted.add(mesh))
    }
    for (const [mesh, hull] of Array.from(this.outlines)) if (!wanted.has(mesh)) {
      this.root.remove(hull)
      this.outlines.delete(mesh)
    }
    for (const mesh of Array.from(wanted)) {
      let hull = this.outlines.get(mesh)
      if (!hull) {
        hull = new Mesh(mesh.geometry, this.material)
        hull.matrixAutoUpdate = false
        hull.frustumCulled = false
        hull.renderOrder = 1000
        this.outlines.set(mesh, hull)
        this.root.add(hull)
      }
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
      const center = mesh.geometry.boundingBox?.getCenter(new Vector3()) ?? new Vector3()
      hull.matrix.copy(mesh.matrixWorld)
        .multiply(new Matrix4().makeTranslation(center.x, center.y, center.z))
        .multiply(new Matrix4().makeScale(OUTLINE_SCALE, OUTLINE_SCALE, OUTLINE_SCALE))
        .multiply(new Matrix4().makeTranslation(-center.x, -center.y, -center.z))
      hull.morphTargetInfluences?.splice(0, hull.morphTargetInfluences.length, ...(mesh.morphTargetInfluences ?? []))
    }
    this.root.updateMatrixWorld(true)
    return covered
  }

  /** Release borrowed hull instances and the private material. */
  dispose(): void { this.root.clear(); this.outlines.clear(); this.material.dispose() }
}
