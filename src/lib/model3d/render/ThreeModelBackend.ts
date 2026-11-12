import { AmbientLight, Box3, DirectionalLight, Group, MathUtils, PerspectiveCamera, Scene, Vector3, WebGLRenderer, BufferGeometry, Material, Texture, Mesh, Line, Points, Object3D } from 'three'
import { editorResourceBudget, type ResourceReservation } from '../../resources/budget'
import type { Model3DData, Model3DResource } from '../types'
import { MAX_MODEL_BOX_SIDE, validateModel } from '../source/modelDefaults'

/** One lazily created WebGL2 context shared by this model service. Draws settle
 * synchronously before another model can reconfigure it. Native back buffers
 * use a conservative 16 bytes/pixel managed policy, not total driver RAM.
 * Last prepared model disposal destroys the context; importing has no GPU cost. */
export class ThreeModelBackend {
  private renderer?: WebGLRenderer
  private storage?: ResourceReservation
  private users = 0
  /** Adopt a parsed tree. Geometry/material/texture/bitmap ownership transfers to
   * the returned disposable resource. Presentation framing retains authored node
   * transforms under a separate normalized wrapper, never rewrites vertices. */
  adopt(root: Object3D, allScenes: readonly Object3D[], bytes: number, extras: readonly unknown[] = []): Model3DResource {
    this.users++
    const framing = new Group(), placement = new Group(), scene = new Scene()
    root.updateMatrixWorld(true)
    const bounds = new Box3().setFromObject(root), center = bounds.getCenter(new Vector3()), radius = bounds.getSize(new Vector3()).length() / 2
    if (!Number.isFinite(radius) || radius <= 1e-10) { this.users--; throw new Error('3D model has no finite visible bounds.') }
    framing.scale.setScalar(1 / radius); framing.position.copy(center).multiplyScalar(-1 / radius); framing.add(root)
    placement.add(framing); scene.add(placement)
    const ambient = new AmbientLight(0xffffff), key = new DirectionalLight(0xffffff)
    key.position.set(3, 5, 4); scene.add(ambient, key)
    const camera = new PerspectiveCamera(), target = new Vector3()
    let disposed = false
    return { bytes,
      draw: (context, data, width, height) => {
        if (disposed) throw new Error('3D resource lease has expired.')
        validateModel(data)
        if (!(width > 0 && height > 0 && width <= MAX_MODEL_BOX_SIDE && height <= MAX_MODEL_BOX_SIDE)) throw new Error(`3D layer size must be 1..${MAX_MODEL_BOX_SIDE} px.`)
        const matrix = context.getTransform(), scale = Math.max(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d))
        const ratio = Math.min(1, 2048 / Math.max(width * scale, height * scale))
        const w = Math.max(1, Math.ceil(width * scale * ratio)), h = Math.max(1, Math.ceil(height * scale * ratio))
        const renderer = this.prepare(w, h)
        placement.position.set(data.position.x, data.position.y, data.position.z)
        placement.rotation.set(...[data.rotation.x, data.rotation.y, data.rotation.z].map(MathUtils.degToRad) as [number, number, number]); placement.scale.setScalar(data.scale)
        const c = data.camera, yaw = MathUtils.degToRad(c.yaw), pitch = MathUtils.degToRad(c.pitch)
        target.set(c.targetX, c.targetY, c.targetZ)
        camera.position.set(c.distance * Math.sin(yaw) * Math.cos(pitch), c.distance * Math.sin(pitch), c.distance * Math.cos(yaw) * Math.cos(pitch)).add(target)
        camera.fov = c.fov; camera.aspect = w / h; camera.near = .001; camera.far = 10000; camera.lookAt(target); camera.updateProjectionMatrix()
        ambient.intensity = data.lighting.ambient; key.intensity = data.lighting.key
        if (renderer.getContext().isContextLost()) throw new Error('3D WebGL context was lost. Reload the model view before exporting.')
        renderer.render(scene, camera)
        context.drawImage(renderer.domElement, 0, 0, width, height)
      },
      dispose: () => {
        if (disposed) return
        disposeModelTrees(allScenes, extras); scene.clear(); disposed = true
        if (--this.users === 0) this.dispose()
      },
    }
  }
  /** Reserve/resize before native allocation. One bounded drawing surface is
   * reused across models. Construction failure releases its reservation. */
  private prepare(width: number, height: number): WebGLRenderer {
    const bytes = width * height * 16
    if (!this.storage) this.storage = editorResourceBudget.reserve('gpu', bytes) ?? undefined
    if (!this.storage || !this.storage.resize(bytes)) throw new Error('3D render surface exceeds the managed resource budget.')
    try {
      if (!this.renderer) {
        this.renderer = new WebGLRenderer({ alpha: true, antialias: true })
        this.renderer.setClearColor(0, 0); this.renderer.setPixelRatio(1)
        this.storage.commit()
      }
      this.renderer.setSize(width, height, false)
      return this.renderer
    } catch (error) { this.dispose(); throw error }
  }
  /** Destruction precedes uncharging. Called only after final model release or
   * construction failure; no frame can borrow the surface after this call. */
  private dispose(): void {
    this.renderer?.dispose(); this.renderer?.forceContextLoss()
    if (this.renderer) { this.renderer.domElement.width = 0; this.renderer.domElement.height = 0 }
    this.renderer = undefined; this.storage?.release(); this.storage = undefined
  }
}

/** Destroy unique shared geometries, materials and textures across all parsed
 * scenes, including unused scenes and native ImageBitmaps. Idempotent Three
 * dispose calls are deduplicated; source URLs belong to the asset source pool. */
export function disposeModelTrees(roots: readonly Object3D[], extras: readonly unknown[] = []): void {
  const geometries = new Set<BufferGeometry>(), materials = new Set<Material>(), textures = new Set<Texture>(), images = new Set<unknown>()
  const collect = (object: Object3D) => object.traverse(node => {
    if (node instanceof Mesh || node instanceof Line || node instanceof Points) {
      geometries.add(node.geometry)
      const list: Material[] = Array.isArray(node.material) ? node.material : [node.material]
      list.forEach(material => materials.add(material))
    }
  })
  roots.forEach(collect)
  extras.forEach(value => {
    if (value instanceof Object3D) collect(value)
    if (value instanceof Material) materials.add(value)
    if (value instanceof Texture) textures.add(value)
  })
  materials.forEach(material => Object.values(material).forEach(value => { if (value instanceof Texture) textures.add(value) }))
  geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose())
  textures.forEach(value => { const image: unknown = value.source?.data; if (image) images.add(image); value.dispose() })
  images.forEach(value => { if (value && typeof value === 'object' && 'close' in value && typeof value.close === 'function') value.close() })
}
