import { Matrix2D } from '@/lib/geometry/Matrix2D'
import { computeMesh2DLocalBounds } from '@/lib/geometry/mesh2d'
import { resolveFitRect, type ExtendedObjectFit } from '@/lib/render/media/resolveFitRect'
import type { Mesh2DGeometry, Mesh2DTextureTransform } from '@/lib/types/mesh2d'
import type { Vec2 } from '@/lib/geometry/CoordinateSystem'

/** Historical Mesh2D UV behavior, used when legacy scenes omit placement. */
export const DEFAULT_MESH2D_TEXTURE_TRANSFORM: Mesh2DTextureTransform = Object.freeze({
  schemaVersion: 1,
  fit: 'stretch',
  offsetX: 0,
  offsetY: 0,
  scaleX: 1,
  scaleY: 1,
  rotationDeg: 0,
  pivotU: 0.5,
  pivotV: 0.5,
  flipX: false,
  flipY: false,
})

export interface Mesh2DTexturePlacement {
  /** Converts source-image pixels into layer-local composition pixels. */
  readonly sourceToLocal: Matrix2D
  /** Converts canonical layer-local UV positions back into source pixels. */
  readonly localToSource: Matrix2D
  readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  readonly corners: readonly [Vec2, Vec2, Vec2, Vec2]
  readonly pivot: Vec2
}

/**
 * Returns a complete validated texture transform.
 *
 * Absence resolves to the legacy stretch contract. Persisted values are never
 * silently clamped: malformed imports throw so authoring can report an error
 * and rendering can use its explicit solid fallback.
 */
export function resolveMesh2DTextureTransform(
  value?: Mesh2DTextureTransform,
): Mesh2DTextureTransform {
  const resolved = value ?? DEFAULT_MESH2D_TEXTURE_TRANSFORM
  if (resolved.schemaVersion !== 1) throw new Error('Unsupported Mesh2D texture transform version')
  if (!['stretch', 'contain', 'cover', 'fitX', 'fitY', 'original'].includes(resolved.fit)) {
    throw new Error(`Unsupported Mesh2D texture fit: ${String(resolved.fit)}`)
  }
  const finite = [resolved.offsetX, resolved.offsetY, resolved.scaleX, resolved.scaleY,
    resolved.rotationDeg, resolved.pivotU, resolved.pivotV]
  if (!finite.every(Number.isFinite)) throw new RangeError('Mesh2D texture transform values must be finite')
  if (resolved.scaleX <= 0 || resolved.scaleY <= 0) throw new RangeError('Mesh2D texture scale must be positive')
  if (resolved.pivotU < 0 || resolved.pivotU > 1 || resolved.pivotV < 0 || resolved.pivotV > 1) {
    throw new RangeError('Mesh2D texture pivot must stay between 0 and 1')
  }
  if (typeof resolved.flipX !== 'boolean' || typeof resolved.flipY !== 'boolean') {
    throw new TypeError('Mesh2D texture flip values must be booleans')
  }
  return { ...resolved }
}

/**
 * Builds source/local matrices shared by Canvas rendering and editor handles.
 *
 * UVs address the mesh's undeformed local bounds; destination triangle
 * positions may be rest or deformed positions. This keeps appearance editing
 * independent from topology and lets the same UV placement follow deformation.
 * Returns `null` for missing bounds or invalid source dimensions.
 */
export function resolveMesh2DTexturePlacement(
  geometry: Mesh2DGeometry,
  sourceWidth: number,
  sourceHeight: number,
  value?: Mesh2DTextureTransform,
): Mesh2DTexturePlacement | null {
  const bounds = computeMesh2DLocalBounds(geometry)
  if (!bounds || !Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight)
      || sourceWidth <= 0 || sourceHeight <= 0) return null
  const transform = resolveMesh2DTextureTransform(value)
  const fit = textureFitToObjectFit(transform.fit)
  const fitted = resolveFitRect(fit, bounds.width, bounds.height, sourceWidth, sourceHeight)
  if (!fitted) return null
  const base = Matrix2D.translation(bounds.x + fitted.dx, bounds.y + fitted.dy)
    .scale(fitted.dw / sourceWidth, fitted.dh / sourceHeight)
  const sourcePivot = { x: transform.pivotU * sourceWidth, y: transform.pivotV * sourceHeight }
  const basePivot = base.applyToPoint(sourcePivot)
  const sx = transform.scaleX * (transform.flipX ? -1 : 1)
  const sy = transform.scaleY * (transform.flipY ? -1 : 1)
  const sourceToLocal = Matrix2D.translation(transform.offsetX, transform.offsetY)
    .multiply(Matrix2D.translation(basePivot.x, basePivot.y))
    .multiply(Matrix2D.rotation(transform.rotationDeg))
    .multiply(Matrix2D.scale(sx, sy))
    .multiply(Matrix2D.translation(-basePivot.x, -basePivot.y))
    .multiply(base)
  let localToSource: Matrix2D
  try { localToSource = sourceToLocal.invert() } catch { return null }
  const corners = [
    sourceToLocal.applyToPoint({ x: 0, y: 0 }),
    sourceToLocal.applyToPoint({ x: sourceWidth, y: 0 }),
    sourceToLocal.applyToPoint({ x: sourceWidth, y: sourceHeight }),
    sourceToLocal.applyToPoint({ x: 0, y: sourceHeight }),
  ] as const
  return { sourceToLocal, localToSource, bounds, corners, pivot: sourceToLocal.applyToPoint(sourcePivot) }
}

/** Returns decoded image/video dimensions without retaining the media object. */
export function mesh2DTextureSourceDimensions(
  source: CanvasImageSource,
): { width: number; height: number } | null {
  const candidate = source as CanvasImageSource & {
    naturalWidth?: number; naturalHeight?: number; videoWidth?: number; videoHeight?: number; width?: number; height?: number
  }
  const width = candidate.naturalWidth ?? candidate.videoWidth ?? candidate.width ?? 0
  const height = candidate.naturalHeight ?? candidate.videoHeight ?? candidate.height ?? 0
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? { width, height } : null
}

function textureFitToObjectFit(fit: Mesh2DTextureTransform['fit']): ExtendedObjectFit {
  if (fit === 'stretch') return 'fill'
  if (fit === 'original') return 'none'
  return fit
}
