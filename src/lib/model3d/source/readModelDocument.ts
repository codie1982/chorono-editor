import { readImageHeader } from '../../asset/metadata/image/readImageHeader'

export const MAX_MODEL_BYTES = 16 * 1024 ** 2
/** Parsed metadata only. JSON is borrowed during preparation, not stored in
 * runtime/undo. First slice accepts self-contained glTF 2 and GLB 2; unsupported
 * external resources/codecs fail before invoking native texture decoding. */
export interface ModelDocument { json: Record<string, any>; binary?: Uint8Array; estimatedBytes: number; warnings: string[] }

/** Decode an embedded resource after the whole encoded input passed the 16 MiB
 * cap. Only base64 binary data is accepted; URLs never trigger hidden fetches. */
function embedded(uri: unknown): Uint8Array {
  if (typeof uri !== 'string' || !/^data:[^,]*;base64,/.test(uri)) throw new Error('3D import requires embedded resources. Export GLB or embed glTF buffers/textures.')
  const raw = atob(uri.slice(uri.indexOf(',') + 1))
  return Uint8Array.from(raw, char => char.charCodeAt(0))
}

/** Validate container length, workload, node graph and embedded texture headers.
 * This is bounded admission, not a replacement for GLTFLoader schema validation.
 * No network, GPU or native image work occurs. The input remains caller-owned. */
export function readModelDocument(buffer: ArrayBuffer): ModelDocument {
  if (!buffer.byteLength || buffer.byteLength > MAX_MODEL_BYTES) throw new Error('3D input must be at most 16 MiB.')
  const bytes = new Uint8Array(buffer), view = new DataView(buffer)
  let jsonBytes = bytes, binary: Uint8Array | undefined
  if (bytes.length >= 4 && view.getUint32(0, true) === 0x46546c67) {
    if (bytes.length < 20 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length) throw new Error('Invalid GLB 2 container length/version.')
    let offset = 12, found = false
    while (offset < bytes.length) {
      if (offset + 8 > bytes.length) throw new Error('Truncated GLB chunk.')
      const length = view.getUint32(offset, true), kind = view.getUint32(offset + 4, true)
      if (length % 4 || offset + 8 + length > bytes.length) throw new Error('Invalid GLB chunk size.')
      const chunk = bytes.subarray(offset + 8, offset + 8 + length)
      if (!found && kind === 0x4e4f534a && offset === 12) { jsonBytes = chunk; found = true }
      else if (kind === 0x004e4942 && !binary) binary = chunk
      else throw new Error('Unsupported GLB chunk layout.')
      offset += 8 + length
    }
    if (!found) throw new Error('GLB is missing its JSON chunk.')
  }
  if (jsonBytes.length > 12 * 1024 ** 2) throw new Error('3D JSON exceeds the first-slice limit.')
  const json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(jsonBytes).trim())
  if (!json || json.asset?.version !== '2.0') throw new Error('Only glTF 2.0 is supported.')
  for (const extension of json.extensionsRequired ?? []) {
    if (!['KHR_materials_unlit', 'KHR_texture_transform'].includes(extension)) throw new Error(`Required 3D extension is not supported in this slice: ${extension}`)
  }
  for (const name of ['nodes', 'meshes', 'materials', 'accessors', 'bufferViews', 'images', 'buffers', 'animations', 'skins']) {
    if (json[name] !== undefined && (!Array.isArray(json[name]) || json[name].length > 1024)) throw new Error(`3D ${name} limit exceeded.`)
  }
  const nodes: any[] = json.nodes ?? [], parents = new Set<number>()
  const visit = (id: number, chain: Set<number>): void => {
    if (!Number.isInteger(id) || !nodes[id] || chain.has(id) || chain.size > 128) throw new Error('Invalid or cyclic 3D node hierarchy.')
    const next = new Set(chain); next.add(id)
    for (const child of nodes[id].children ?? []) {
      if (parents.has(child)) throw new Error('3D nodes cannot have multiple parents.')
      parents.add(child); visit(child, next)
    }
  }
  // Find roots first; then reject any unvisited cycle component.
  const childIds = new Set<number>(nodes.flatMap(node => node.children ?? []))
  nodes.forEach((_, id) => { if (!childIds.has(id)) visit(id, new Set()) })
  if (nodes.length && parents.size + nodes.filter((_, id) => !childIds.has(id)).length !== nodes.length) throw new Error('Cyclic 3D hierarchy.')
  if (json.scenes && (!Array.isArray(json.scenes) || json.scenes.length > 8)) throw new Error('3D scene count exceeds 8.')
  let meshInstances = 0
  for (const mesh of json.meshes ?? []) if (!Array.isArray(mesh.primitives) || mesh.primitives.length > 64) throw new Error('3D mesh primitive limit exceeded.')
  for (const node of nodes) if (node.mesh !== undefined) {
    const mesh = json.meshes?.[node.mesh]
    if (!mesh) throw new Error('Missing 3D mesh.')
    meshInstances += mesh.primitives.length
  }
  if (meshInstances > 2048) throw new Error('3D draw-object count exceeds 2048.')
  let estimate = buffer.byteLength * 3 + meshInstances * 4096, count = 0
  for (const accessor of json.accessors ?? []) {
    if (!Number.isSafeInteger(accessor.count) || accessor.count < 0) throw new Error('Invalid 3D accessor count.')
    count += accessor.count
    estimate += accessor.count * 16 * 8 // includes expanded/sparse attributes and CPU/GPU copies
  }
  if (count > 2_000_000) throw new Error('3D accessor workload exceeds the first-slice limit.')
  const buffers: Uint8Array[] = (json.buffers ?? []).map((entry: any, id: number) => {
    const data = entry.uri ? embedded(entry.uri) : id === 0 ? binary : undefined
    if (!data || !Number.isSafeInteger(entry.byteLength) || entry.byteLength < 0 || data.length < entry.byteLength) throw new Error('Missing or truncated 3D buffer.')
    return data
  })
  for (const entry of json.bufferViews ?? []) {
    const data = buffers[entry.buffer], start = entry.byteOffset ?? 0
    if (!data || !Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(entry.byteLength) || entry.byteLength < 0 || start + entry.byteLength > data.length) throw new Error('Invalid 3D buffer view.')
  }
  for (const image of json.images ?? []) {
    const b = json.bufferViews?.[image.bufferView]
    const data = image.uri ? embedded(image.uri) : b ? buffers[b.buffer].subarray(b.byteOffset ?? 0, (b.byteOffset ?? 0) + b.byteLength) : undefined
    if (!data) throw new Error('Missing 3D texture data.')
    const header = readImageHeader({ data, complete: true })
    if (header.width === null || header.height === null || header.format === 'gif') throw new Error('3D textures require PNG, JPEG or WebP headers.')
    if (header.width > 4096 || header.height > 4096) throw new Error('3D texture dimensions exceed 4096 px.')
    estimate += header.width * header.height * 12 // bitmap + GPU + mip policy estimate
  }
  if (estimate > 96 * 1024 ** 2) throw new Error('3D decoded resource estimate exceeds 96 MiB.')
  const warnings = ['Imported node hierarchy and materials are preserved. This slice uses its own camera/lights and displays the default pose; clip playback/rig editing are later work.']
  return { json, binary, estimatedBytes: Math.max(estimate, 1024), warnings }
}
