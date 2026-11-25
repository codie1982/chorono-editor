import { triangleDocument, modelBytes } from './fixtures'
/** Real self-contained glTF with animated parent translation and morph weights.
 * Separate unanimated child permits authored node keys beside a native clip. */
export function animatedModelBytes(): ArrayBuffer {
  const json = triangleDocument()
  const add = (values: number[], type: string, count: number) => {
    const bytes = new Uint8Array(new Float32Array(values).buffer), b = json.buffers.length, view = json.bufferViews.length, accessor = json.accessors.length
    json.buffers.push({ uri: `data:application/octet-stream;base64,${btoa(String.fromCharCode(...Array.from(bytes)))}`, byteLength: bytes.length })
    json.bufferViews.push({ buffer: b, byteLength: bytes.length }); json.accessors.push({ bufferView: view, componentType: 5126, count, type })
    return accessor
  }
  json.nodes.push({ name: 'Animated parent', children: [0, 2] }, { name: 'Joint' });
  json.nodes[0].skin = 0
  const joints = new Uint8Array(new Uint16Array(12).buffer), buffer = json.buffers.length, bufferView = json.bufferViews.length, jointAccessor = json.accessors.length
  json.buffers.push({ uri: `data:application/octet-stream;base64,${btoa(String.fromCharCode(...Array.from(joints)))}`, byteLength: joints.length })
  json.bufferViews.push({ buffer, byteLength: joints.length }); json.accessors.push({ bufferView, componentType: 5123, count: 3, type: 'VEC4' })
  json.meshes[0].primitives[0].attributes.JOINTS_0 = jointAccessor
  json.meshes[0].primitives[0].attributes.WEIGHTS_0 = add([1,0,0,0,1,0,0,0,1,0,0,0], 'VEC4', 3)
  json.skins = [{ joints: [2], skeleton: 2, inverseBindMatrices: add([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1], 'MAT4', 1) }]
   json.scenes[0].nodes = [1]
  json.meshes[0].weights = [0]; json.meshes[0].primitives[0].targets = [{ POSITION: add([0,0,0,0,0,0,0,1,0], 'VEC3', 3) }]
  const rotation = add([0,0,0,1,0,0,Math.sin(Math.PI/8),Math.cos(Math.PI/8)], 'VEC4', 2)
  const time = add([0,1], 'SCALAR', 2), translation = add([0,0,0,1,0,0], 'VEC3', 2), weights = add([0,1], 'SCALAR', 2)
  json.animations = [{ name: 'Move and morph', samplers: [{ input: time, output: translation, interpolation: 'LINEAR' }, { input: time, output: weights, interpolation: 'LINEAR' }, { input: time, output: rotation, interpolation: 'LINEAR' }],
    channels: [{ sampler: 0, target: { node: 1, path: 'translation' } }, { sampler: 1, target: { node: 0, path: 'weights' } }, { sampler: 2, target: { node: 2, path: 'rotation' } }] }]
  json.accessors[json.meshes[0].primitives[0].targets[0].POSITION].min = [0,0,0]
  json.accessors[json.meshes[0].primitives[0].targets[0].POSITION].max = [0,1,0]
  return modelBytes(json)
}
