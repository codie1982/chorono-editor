import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModelAssetService } from './resources/ModelAssetService'
import { binaryGlbBytes, triangleDocument } from './__tests__/fixtures'
import { readFile } from 'node:fs/promises'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

/** Actual GLTFLoader and ownership stack, with only the unavailable Node native
 * bitmap decoder replaced by controllable settlement. No GPU/context is used. */
describe('3D failed preparation ownership', () => {
  it('prepares the shipped self-contained robot using the actual loader and releases it', async () => {
    vi.stubGlobal('ProgressEvent', class extends Event { constructor(type: string, init: object) { super(type); Object.assign(this, init) } })
    const bytes = await readFile(new URL('../../../examples/3d/chorono-robot.glb', import.meta.url)), service = new ModelAssetService()
    const pin = await service.acquire({ id: 'robot', name: 'chorono-robot.glb', type: 'model3d', url: `data:model/gltf-binary;base64,${bytes.toString('base64')}` })
    try { expect(pin.value.bytes).toBeGreaterThan(bytes.length) }
    finally { pin.release(); service.clearIdle() }
    expect(service.getSnapshot().residency.chargedBytes).toBe(0)
  })
  it('prepares a GLB BIN chunk with transformed parent hierarchy through the actual loader', async () => {
    vi.stubGlobal('ProgressEvent', class extends Event { constructor(type: string, init: object) { super(type); Object.assign(this, init) } })
    const bytes = new Uint8Array(binaryGlbBytes()), service = new ModelAssetService()
    const url = 'data:model/gltf-binary;base64,' + btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))
    const pin = await service.acquire({ id: 'binary', name: 'binary.glb', type: 'model3d', url })
    try { expect(pin.value.bytes).toBeGreaterThan(bytes.length); expect(service.getSnapshot().residency.chargedBytes).toBeGreaterThan(0) }
    finally { pin.release(); service.clearIdle() }
    expect(service.getSnapshot().residency.chargedBytes).toBe(0)
  })
  it('retains reservation until other image work settles, then closes partial bitmaps and texture URLs', async () => {
    vi.stubGlobal('self', { URL })
    vi.stubGlobal('ProgressEvent', class extends Event { constructor(type: string, init: object) { super(type); Object.assign(this, init) } })
    let finishGood!: (value: unknown) => void, goodStarted!: () => void, badStarted!: () => void
    const good = new Promise<unknown>(resolve => { finishGood = resolve })
    const startedGood = new Promise<void>(resolve => { goodStarted = resolve })
    const startedBad = new Promise<void>(resolve => { badStarted = resolve })
    const close = vi.fn(), revoke = vi.spyOn(URL, 'revokeObjectURL')
    vi.stubGlobal('createImageBitmap', async (blob: Blob) => {
      if (blob.size === 33) { badStarted(); throw new Error('Test native bitmap decode failed') }
      goodStarted(); return good
    })
    const json = triangleDocument()
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ8kAAAAASUVORK5CYII='), char => char.charCodeAt(0))
    for (const data of [png, png.subarray(0, 33)]) {
      const index = json.buffers.length
      json.buffers.push({ uri: 'data:application/octet-stream;base64,' + btoa(Array.from(data, byte => String.fromCharCode(byte)).join('')), byteLength: data.length })
      json.bufferViews.push({ buffer: index, byteLength: data.length })
    }
    json.images = [{ bufferView: 1, mimeType: 'image/png' }, { bufferView: 2, mimeType: 'image/png' }]
    json.textures = [{ source: 0 }, { source: 1 }]
    const pbr = json.materials[0].pbrMetallicRoughness
    pbr.baseColorTexture = { index: 0 }
    json.materials.push({ pbrMetallicRoughness: { ...pbr, baseColorTexture: { index: 1 } } })
    json.meshes[0].primitives.push({ attributes: { POSITION: 0 }, material: 1 })
    const service = new ModelAssetService()
    let settled = false
    const pending = service.acquire({ id: 'broken', name: 'broken.gltf', type: 'model3d', url: 'data:model/gltf+json;base64,' + btoa(JSON.stringify(json)) })
    pending.then(() => { settled = true }, () => { settled = true })
    await Promise.all([startedGood, startedBad])
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(settled).toBe(false)
    expect(service.getSnapshot().residency.reservedBytes).toBeGreaterThan(0)
    finishGood({ width: 1, height: 1, close })
    await expect(pending).rejects.toThrow('failed to decode')
    expect(close).toHaveBeenCalledTimes(1)
    expect(new Set(revoke.mock.calls.map(([url]) => url)).size).toBeGreaterThanOrEqual(2)
    expect(service.getSnapshot().residency.chargedBytes).toBe(0)
  })
})
