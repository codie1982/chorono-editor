import { modelFraming } from './modelFraming'
import { WebGLRenderer, BufferGeometry, Material, Texture, Mesh, Line, Points, Object3D, AnimationClip, SRGBColorSpace, ACESFilmicToneMapping, Box3, Vector3 } from 'three'
import type { GLTFParser } from 'three/addons/loaders/GLTFLoader.js'
import { editorResourceBudget, type ResourceReservation } from '../../resources/budget'
import type { Model3DData, Model3DResource } from '../types'
import type { ModelInspection, ModelResourceLookup } from '../inspection/types'
import { MAX_MODEL_BOX_SIDE, validateModelPlacement } from '../source/modelDefaults'
import { prepareModelSource, type ModelPreparedSource } from '../resources/modelInventory'
import { ModelComposition } from './ModelComposition'
import { sceneShadowsEnabled } from '../source/modelSceneObjects'

/** One lazy bounded WebGL2 renderer shared by prepared models. Each resource
 * owns a mutable composition; source geometry/textures remain immutable and shared.
 * Draws settle synchronously. No playback timer or inspection state enters source.
 */
export class ThreeModelBackend {
  private renderer?: WebGLRenderer
  private storage?: ResourceReservation
  private users = 0
  private readonly worlds = new Set<ModelComposition>()
  private readonly sources = new WeakMap<Model3DResource, ModelPreparedSource>()
  /** Adopt parsed ownership; resource disposal destroys its poses before shared
   * trees. Metadata only escapes through inventory. Legacy direct adoption is
   * supported for tests/static callers without loader associations. */
  adopt(root: Object3D, allScenes: readonly Object3D[], bytes: number, extras: readonly unknown[] = [], options: { clips?: readonly AnimationClip[]; parser?: GLTFParser; revision?: string } = {}): Model3DResource {
    const { radius } = modelFraming(root)
    const source = prepareModelSource(root, options.clips ?? [], options.parser, options.revision ?? '0'.repeat(64))
    const world = new ModelComposition(source, r => this.sources.get(r))
    this.users++; this.worlds.add(world)
    let disposed = false
    const configure = (data: Model3DData, width: number, height: number, resources?: ModelResourceLookup, inspection?: ModelInspection) => {
      if (disposed) throw new Error('3D resource lease has expired.')
      validateModelPlacement(data)
      if (!(width > 0 && height > 0 && width <= MAX_MODEL_BOX_SIDE && height <= MAX_MODEL_BOX_SIDE)) throw new Error(`3D layer size must be 1..${MAX_MODEL_BOX_SIDE} px.`)
      world.configure(data, width, height, resources, inspection)
    }
    const resource: Model3DResource = { bytes, inventory: source.inventory, isExplicitEmptyScene: source.root.userData.choronoEmptyScene === true,
      inspector: {
        pick: (data, x, y, w, h, view, lookup) => { configure(data, w, h, lookup, view); return world.pick(x, y, w, h) },
        selectRegion: (data, region, containment, w, h, view, lookup) => { configure(data, w, h, lookup, view); return world.selectRegion(region, containment, w, h) },
        gizmo: (data, w, h, view, lookup) => { configure(data, w, h, lookup, view); return world.gizmo(w, h) },
        measure: (data, selection, view, lookup) => { configure(data, 600, 400, lookup, view); return world.measure(selection) },
        frame: (data, view, lookup) => { configure(data, 1, 1, lookup, view); return world.frame() },
        poly: {
          project: (data, id, w, h, view, lookup) => { configure(data, w, h, lookup, view); return world.projectPoly(id, w, h) },
          pick: (data, id, mode, x, y, w, h, view, lookup) => { configure(data, w, h, lookup, view); return world.pickPoly(id, mode, x, y, w, h) },
        },
      },
      draw: (context, data, width, height, resources, inspection) => {
        configure(data, width, height, resources, inspection)
        const matrix = context.getTransform(), scale = Math.max(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d))
        const ratio = Math.min(1, 2048 / Math.max(width * scale, height * scale))
        const w = Math.max(1, Math.ceil(width * scale * ratio)), h = Math.max(1, Math.ceil(height * scale * ratio))
        const renderer = this.prepare(w, h)
        renderer.shadowMap.enabled = sceneShadowsEnabled(data, !!inspection)
        renderer.toneMapping = data.content ? ACESFilmicToneMapping : 0
        renderer.toneMappingExposure = data.content?.environment.exposure ?? 1
        if (renderer.getContext().isContextLost()) throw new Error('3D WebGL context was lost. Reload the model view before exporting.')
        world.draw(renderer); context.drawImage(renderer.domElement, 0, 0, width, height)
      },
      exportGlb: async (data, width, height, resources) => {
        configure(data, width, height, resources)
        return world.exportGlb()
      },
      dispose: () => {
        if (disposed) return
        disposed = true; world.dispose(); this.worlds.delete(world); this.worlds.forEach(w => w.releaseSource(source)); this.sources.delete(resource); disposeModelTrees(allScenes, extras)
        if (--this.users === 0) this.dispose()
      },
    }
    this.sources.set(resource, source); return resource
  }
  /** Resize admission precedes GPU allocation. Compositions admit their own bounded shadow maps;
   * driver totals remain outside this managed estimate. */
  private prepare(width: number, height: number): WebGLRenderer {
    const bytes = width * height * 16
    if (!this.storage) this.storage = editorResourceBudget.reserve('gpu', bytes) ?? undefined
    if (!this.storage || !this.storage.resize(bytes)) throw new Error('3D render surface exceeds the managed resource budget.')
    try {
      if (!this.renderer) {
        this.renderer = new WebGLRenderer({ alpha: true, antialias: true }); this.renderer.outputColorSpace = SRGBColorSpace
        this.renderer.setClearColor(0, 0); this.renderer.setPixelRatio(1); this.storage.commit()
      }
      this.renderer.setSize(width, height, false); return this.renderer
    } catch (error) { this.dispose(); throw error }
  }
  /** Native destruction precedes budget release; final resource closes context. */
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
