import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry } from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'

/** Node-only Blob adapter required by Three's browser-oriented exporter. This
 * produces a static source asset, never a Chorono scene or authoring script. */
class BlobReader {
  result = null
  onloadend = null
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(value => { this.result = value; this.onloadend?.() }) }
}
globalThis.FileReader = BlobReader

const root = new Group(); root.name = 'Chorono Demo Robot'
const box = new BoxGeometry(1, 1, 1), sphere = new SphereGeometry(1, 16, 12), cylinder = new CylinderGeometry(1, 1, 1, 16)
const material = (color, metalness = .25) => new MeshStandardMaterial({ color, metalness, roughness: .38 })
const shell = material('#e5eef7'), blue = material('#2477ff'), dark = material('#172638'), orange = material('#ff8b35'), glass = material('#33d6ff', .1)

/** Add one named part in parent-local model units. Shared geometry/materials
 * remain single exporter resources; the resulting GLB has no external files. */
function part(parent, name, geometry, surface, position, scale, rotation = [0, 0, 0]) {
  const mesh = new Mesh(geometry, surface); mesh.name = name
  mesh.position.set(...position); mesh.scale.set(...scale); mesh.rotation.set(...rotation); parent.add(mesh)
  return mesh
}
const torso = part(root, 'Body / blue chest', box, blue, [0, 1.85, 0], [.98, 1.08, .55])
part(torso, 'Body / control panel', box, dark, [0, .08, .53], [.65, .45, .06])
part(torso, 'Body / status light', sphere, orange, [.22, .12, .59], [.07, .07, .07])
part(root, 'Neck', cylinder, dark, [0, 2.5, 0], [.14, .25, .14])
const head = part(root, 'Head / shell', box, shell, [0, 2.95, 0], [1.14, .75, .7])
part(head, 'Head / face plate', box, dark, [0, -.01, .52], [.84, .55, .06])
for (const side of [-1, 1]) part(head, `Head / ${side < 0 ? 'left' : 'right'} eye`, sphere, glass, [side * .22, .03, .58], [.09, .11, .05])
part(head, 'Head / smile', box, shell, [0, -.16, .59], [.25, .025, .025])
part(root, 'Antenna / stem', cylinder, dark, [0, 3.47, 0], [.035, .3, .035])
part(root, 'Antenna / orange tip', sphere, orange, [0, 3.65, 0], [.09, .09, .09])
for (const side of [-1, 1]) {
  const name = side < 0 ? 'Left' : 'Right', arm = new Group(); arm.name = `${name} arm`; arm.position.set(side * .7, 2.18, 0); arm.rotation.z = side * .12; root.add(arm)
  part(arm, `${name} shoulder`, sphere, dark, [0, 0, 0], [.2, .2, .2])
  part(arm, `${name} forearm`, box, shell, [side * .03, -.45, 0], [.3, .65, .34])
  part(arm, `${name} hand`, sphere, orange, [side * .03, -.84, 0], [.2, .2, .2])
  const leg = new Group(); leg.name = `${name} leg`; leg.position.set(side * .28, 1.25, 0); root.add(leg)
  part(leg, `${name} hip`, sphere, dark, [0, 0, 0], [.17, .17, .17])
  part(leg, `${name} shin`, box, shell, [0, -.48, 0], [.32, .72, .35])
  part(leg, `${name} boot`, box, dark, [0, -.98, .12], [.44, .24, .7])
}
const output = new URL('../../examples/3d/chorono-robot.glb', import.meta.url)
try {
  const bytes = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true })
  await mkdir(new URL('.', output), { recursive: true }); await writeFile(output, Buffer.from(bytes))
  console.log(`${fileURLToPath(output)} (${bytes.byteLength} bytes)`)
} finally {
  [box, sphere, cylinder].forEach(value => value.dispose());
  [shell, blue, dark, orange, glass].forEach(value => value.dispose())
}
