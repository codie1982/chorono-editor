import { DoubleSide, FrontSide, MeshStandardMaterial } from 'three'

/** Portable, sparse surface options shared by imported and authored meshes.
 * Missing fields preserve the pre-material appearance of older scenes. Texture
 * references belong to the revision-bound imported material record instead. */
export interface PbrSurfaceOptions {
  emissiveColor?: string
  emissiveIntensity?: number
  alphaMode?: 'opaque' | 'mask' | 'blend'
  alphaCutoff?: number
  doubleSided?: boolean
  normalStrength?: number
  aoStrength?: number
}

export interface PbrSurface extends PbrSurfaceOptions {
  color: string
  roughness: number
  metalness: number
  opacity: number
}

export const primitiveSurfaceDefaults = { roughness: .7, metalness: .12, opacity: 1 } as const

/** Validate source-facing PBR factors before any renderer allocation. */
export function validPbrSurface(surface: PbrSurface): boolean {
  const range = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
  return /^#[0-9a-f]{6}$/i.test(surface.color)
    && range(surface.roughness, 0, 1) && range(surface.metalness, 0, 1) && range(surface.opacity, 0, 1)
    && (surface.emissiveColor === undefined || /^#[0-9a-f]{6}$/i.test(surface.emissiveColor))
    && (surface.emissiveIntensity === undefined || range(surface.emissiveIntensity, 0, 20))
    && (surface.alphaMode === undefined || ['opaque', 'mask', 'blend'].includes(surface.alphaMode))
    && (surface.alphaCutoff === undefined || range(surface.alphaCutoff, 0, 1))
    && (surface.doubleSided === undefined || typeof surface.doubleSided === 'boolean')
    && (surface.normalStrength === undefined || range(surface.normalStrength, 0, 4))
    && (surface.aoStrength === undefined || range(surface.aoStrength, 0, 4))
}

/** Apply one validated, metre-independent surface to a pose-owned Three
 * material. This mutates only the material, never shared textures or geometry.
 * The baseline supplies legacy alpha and sidedness defaults on old scenes. */
export function applyPbrSurface(material: MeshStandardMaterial, surface: PbrSurface, baseline?: MeshStandardMaterial): void {
  // Opacity is already a keyable legacy channel. A subunit animated value must
  // still blend even if an imported opaque baseline was explicitly inventoried.
  const alphaMode = surface.alphaMode === 'mask' ? 'mask'
    : surface.opacity < 1 ? 'blend'
    : surface.alphaMode ?? (baseline?.alphaTest ? 'mask' : baseline?.transparent ? 'blend' : 'opaque')
  const doubleSided = surface.doubleSided ?? (baseline?.side === DoubleSide)
  const transparent = alphaMode === 'blend', alphaTest = alphaMode === 'mask' ? surface.alphaCutoff ?? baseline?.alphaTest ?? .5 : 0
  const side = doubleSided ? DoubleSide : FrontSide
  if (material.transparent !== transparent || material.alphaTest !== alphaTest || material.side !== side) material.needsUpdate = true
  material.color.set(surface.color)
  material.roughness = surface.roughness
  material.metalness = surface.metalness
  material.opacity = surface.opacity
  material.emissive.set(surface.emissiveColor ?? baseline?.emissive ?? '#000000')
  material.emissiveIntensity = surface.emissiveIntensity ?? baseline?.emissiveIntensity ?? 1
  material.normalScale.setScalar(surface.normalStrength ?? baseline?.normalScale.x ?? 1)
  material.aoMapIntensity = surface.aoStrength ?? baseline?.aoMapIntensity ?? 1
  material.transparent = transparent
  material.alphaTest = alphaTest
  material.depthWrite = !transparent
  material.side = side
}
