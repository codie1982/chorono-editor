import type { MeshCorner, MeshSnapshot } from './meshSnapshot'

export interface MeshRenderTriangle { readonly faceId: string; readonly corners: readonly [MeshCorner, MeshCorner, MeshCorner] }

/** Derive GPU triangles from logical convex primitive faces. Fan diagonals are
 * render-only and never inserted into MeshSnapshot.edges. Concave Edit Poly
 * faces require a separate triangulation strategy in the geometry phase. */
export function triangulateConvexMesh(mesh: MeshSnapshot): readonly MeshRenderTriangle[] {
  const triangles: MeshRenderTriangle[] = []
  for (const face of mesh.faces) for (let i = 1; i < face.corners.length - 1; i++) {
    triangles.push({ faceId: face.id, corners: [face.corners[0], face.corners[i], face.corners[i + 1]] })
  }
  return triangles
}
