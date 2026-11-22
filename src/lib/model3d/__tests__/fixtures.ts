/** Tiny self-contained model fixtures for real loader/GPU tests. Geometry is
 * source-authored test data, not a mocked GLTFLoader or screenshot substitute. */
export function triangleDocument(): Record<string, any> {
  const positions = new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0])
  const bytes = new Uint8Array(positions.buffer)
  const encoded = btoa(String.fromCharCode(...Array.from(bytes)))
  return { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'Test triangle', mesh: 0 }],
    buffers: [{ uri: `data:application/octet-stream;base64,${encoded}`, byteLength: bytes.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bytes.length }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-1, -1, 0], max: [1, 1, 0] }],
    materials: [{ doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [1, .1, .02, 1], metallicFactor: .1, roughnessFactor: .5 } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }] }
}
/** UTF-8 source bytes; callers may mutate the detached JSON before encoding. */
export function modelBytes(json = triangleDocument()): ArrayBuffer { return new TextEncoder().encode(JSON.stringify(json)).buffer }
/** GLB fixture uses embedded JSON for equivalence; actual container/chunk
 * lengths and alignment are emitted so malformed-header tests are meaningful. */
export function glbBytes(): ArrayBuffer {
  const json = new Uint8Array(modelBytes()), padded = Math.ceil(json.length / 4) * 4
  const bytes = new Uint8Array(20 + padded), view = new DataView(bytes.buffer)
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.length, true)
  view.setUint32(12, padded, true); view.setUint32(16, 0x4e4f534a, true); bytes.fill(32, 20); bytes.set(json, 20)
  return bytes.buffer
}

/** Standard GLB with a separate BIN chunk and no data URI in buffers. The
 * default mesh is nested under a transformed parent to exercise node loading. */
export function binaryGlbBytes(): ArrayBuffer {
  const document = triangleDocument(), binary = new Uint8Array(new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]).buffer)
  document.buffers = [{ byteLength: binary.length }]
  document.nodes.push({ name: 'Imported parent', translation: [3, 2, 1], children: [0] }); document.scenes[0].nodes = [1]
  const json = new Uint8Array(modelBytes(document)), padded = Math.ceil(json.length / 4) * 4
  const bytes = new Uint8Array(28 + padded + binary.length), view = new DataView(bytes.buffer)
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.length, true)
  view.setUint32(12, padded, true); view.setUint32(16, 0x4e4f534a, true); bytes.fill(32, 20, 20 + padded); bytes.set(json, 20)
  view.setUint32(20 + padded, binary.length, true); view.setUint32(24 + padded, 0x004e4942, true); bytes.set(binary, 28 + padded)
  return bytes.buffer
}
