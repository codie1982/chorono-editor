import { describe, expect, it } from 'vitest'
import { Mesh, MeshBasicMaterial, OrthographicCamera, PerspectiveCamera } from 'three'
import { primitiveMeshSnapshot } from './meshSnapshot'
import { PrimitivePolyView } from './PrimitivePolyView'
import { primitiveRenderGeometry } from './PrimitiveRenderGeometry'

describe('poly picking in inspection projections', () => {
  const mesh = primitiveMeshSnapshot({ kind: 'box', width: 1, height: 1, depth: 1 })
  const object = new Mesh(primitiveRenderGeometry(mesh), new MeshBasicMaterial())
  it.each(['perspective', 'orthographic'] as const)('%s selects authored faces and vertices', projection => {
    const camera = projection === 'perspective' ? new PerspectiveCamera(45, 4 / 3, .01, 100)
      : new OrthographicCamera(-2, 2, 1.5, -1.5, .01, 100)
    camera.position.set(0, 0, 3); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true)
    const view = new PrimitivePolyView(object, camera, mesh, 400, 300)
    expect(view.pick('polygon', 200, 150)).toBe('f0')
    expect(view.pick('element', 200, 150)).toBe('f0')
    const corner = view.project().vertices.v6
    expect(view.pick('vertex', corner.x, corner.y)).toBe('v6')
  })
})
