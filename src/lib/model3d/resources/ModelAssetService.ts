import type { Asset } from '../../types'
import { ResidentResourceCache, type ResourceLease } from '../../resources/residency'
import { SharedPreparationQueue, editorMediaPreparation, cancelledJobError } from '../../resources/jobs'
import { editorResourceBudget } from '../../resources/budget'
import { BoundedBinaryReader } from '../../resources/io'
import { assetSourcePool } from '../../asset/sources'
import type { Model3DResource } from '../types'
import { MAX_MODEL_BYTES, readModelDocument } from '../source/readModelDocument'
export type ModelLease = ResourceLease<Model3DResource>

/** Parsed model residency over the existing bounded queue/cache/source owners.
 * No scene or React ownership. Source URL identity permits shared immutable
 * model trees; each synchronous draw applies its caller's placement/camera.
 * Decoder imports and WebGL creation are lazy. Cancelled parsing settles before
 * releasing reservations; late results are disposed rather than published. */
export class ModelAssetService {
  private readonly cache = new ResidentResourceCache<Model3DResource>({ category: 'derived', label: '3D model', maxBytes: 128 * 1024 ** 2, maxEntries: 8, budget: editorResourceBudget, dispose: resource => resource.dispose() })
  private readonly reader = new BoundedBinaryReader({ maxBytes: MAX_MODEL_BYTES, budget: editorResourceBudget })
  private readonly queue = new SharedPreparationQueue<ModelLease>({ concurrency: 1, maxQueued: 32, executor: editorMediaPreparation, label: '3D model preparation', release: lease => lease.release(), discard: (key, lease) => { this.cache.invalidate(key, lease.value); lease.release() } })
  private backend?: import('../render/ThreeModelBackend').ThreeModelBackend
  /** Acquire a source-specific pin; consumer abort does not cancel other pins.
   * Acquired resources cannot escape their consumer session's lifetime. */
  async acquire(asset: Asset, options: { signal?: AbortSignal } = {}): Promise<ModelLease> {
    if (asset.type !== 'model3d' || !asset.url) throw new Error('Missing 3D model asset.')
    if (options.signal?.aborted) throw cancelledJobError()
    const cached = this.cache.acquire(asset.url)
    if (cached) return cached
    return this.queue.request(asset.url, signal => this.prepare(asset.url, signal), lease => lease.retain(), options.signal,
      () => { const pin = assetSourcePool.retainUrls([asset.url]); return () => pin.release() })
  }
  /** Readiness inventory only; no decoded objects are exposed to diagnostics. */
  getSnapshot() { return { residency: this.cache.getSnapshot(), preparation: this.queue.getSnapshot() } }
  /** Clear only unused cache data; active consumer pins remain valid. */
  clearIdle(): void { this.cache.clearIdle() }
  /** Prepare bounded source, validate workload, then transfer parsed ownership.
   * The loader's own URI resolution is restricted to embedded data/blob images. */
  private async prepare(url: string, signal: AbortSignal): Promise<ModelLease> {
    const input = await this.reader.readResponse(await fetch(url, { signal }), { signal })
    const textureUrls = new Set<string>()
    let resource: Model3DResource | undefined, ticket: ReturnType<typeof this.cache.reserve> | undefined
    try {
      const document = readModelDocument(input.buffer)
      const digest = await crypto.subtle.digest('SHA-256', input.buffer)
      if (signal.aborted) throw cancelledJobError()
      const revision = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
      ticket = this.cache.reserve(document.estimatedBytes)
      const [{ GLTFLoader }, { LoadingManager, Light }, backend] = await Promise.all([
        import('three/addons/loaders/GLTFLoader.js'), import('three'), import('../render/ThreeModelBackend'),
      ])
      const manager = new LoadingManager()
      let dependencyFailed = false
      // GLTFLoader deliberately substitutes missing textures with null. Import
      // must report incomplete source instead of silently changing its look.
      manager.onError = () => { dependencyFailed = true }
      manager.setURLModifier(value => {
        if (value.startsWith('blob:')) textureUrls.add(value)
        if (!value.startsWith('data:') && !value.startsWith('blob:')) throw new Error('External 3D resource loading is disabled; import a self-contained file.')
        return value
      })
      const loader = new GLTFLoader(manager)
      let parser: import('three/addons/loaders/GLTFLoader.js').GLTFParser | undefined
      const pending = new Set<Promise<unknown>>()
      // Decode bounded native clips without copying tracks into the scene.
      // Observe every dependency so cancellation/failure retains correct ownership.
      loader.register(current => ({ name: 'CHORONO_content', beforeRoot: () => {
        parser = current
        const original = current.getDependency.bind(current)
        current.getDependency = (type, index) => {
          const result = original(type, index)
          pending.add(result); result.then(() => pending.delete(result), () => pending.delete(result))
          return result
        }
        return null
      } }))
      let gltf: Awaited<ReturnType<typeof loader.parseAsync>>
      try { gltf = await loader.parseAsync(input.buffer, '') }
      catch (error) {
        // A rejected root does not mean other native image requests settled.
        // Retain admission/source ownership until every dependency has finished.
        while (pending.size) await Promise.allSettled(Array.from(pending))
        backend.disposeModelTrees([], Array.from(parser?.associations.keys() ?? []))
        throw error
      }
      while (pending.size) await Promise.allSettled(Array.from(pending))
      try {
        if (signal.aborted) throw cancelledJobError()
        if (dependencyFailed) throw new Error('3D texture or buffer failed to decode. Repair the embedded resource before importing.')
        // Use the explicit first-slice lights; imported cameras remain source-only.
        gltf.scene.traverse(object => { if (object instanceof Light) object.visible = false })
        this.backend ??= new backend.ThreeModelBackend()
        resource = this.backend.adopt(gltf.scene, gltf.scenes, document.estimatedBytes, Array.from(parser?.associations.keys() ?? []), { clips: gltf.animations, parser, revision })
      } catch (error) { backend.disposeModelTrees(gltf.scenes, Array.from(parser?.associations.keys() ?? [])); throw error }
      const lease = this.cache.admit(url, resource, resource.bytes, ticket, url)
      resource = undefined; ticket = undefined
      return lease
    } finally {
      textureUrls.forEach(value => URL.revokeObjectURL(value))
      input.release()
      if (resource && ticket) this.cache.discard(resource, ticket, url)
      else ticket?.release()
    }
  }
}
export const modelAssetService = new ModelAssetService()
