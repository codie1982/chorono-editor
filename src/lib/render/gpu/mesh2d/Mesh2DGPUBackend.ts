/** Canvas-compatible layer-local to backing-pixel affine transform. */
export interface Mesh2DBackingTransform {
  readonly a: number
  readonly b: number
  readonly c: number
  readonly d: number
  readonly e: number
  readonly f: number
}

export interface Mesh2DGPUDrawParams {
  readonly vertices: Float32Array
  readonly triangleCount: number
  readonly texture: CanvasImageSource
  readonly sourceWidth: number
  readonly sourceHeight: number
  readonly sampling: 'linear' | 'nearest'
  readonly backingWidth: number
  readonly backingHeight: number
  readonly localToBacking: Mesh2DBackingTransform
  readonly alpha: number
}

/**
 * Replaceable GPU backend for one textured fixed-topology Mesh2D pass.
 *
 * Implementations own their native context and buffers. `draw` borrows all
 * source inputs synchronously and returns false when hardware/context/media
 * cannot satisfy the contract, authorizing a complete Canvas2D fallback.
 */
export abstract class Mesh2DGPUBackend {
  protected _contextLost = false
  get contextLost(): boolean { return this._contextLost }
  abstract get canvas(): HTMLCanvasElement
  abstract draw(params: Mesh2DGPUDrawParams): boolean
  abstract dispose(): void
}

/** Builds a column-major layer-local to WebGL clip-space matrix. */
export function buildMesh2DAffineTransformMatrix(
  width: number,
  height: number,
  transform: Mesh2DBackingTransform,
): Float32Array {
  if (!(width > 0 && height > 0)
    || ![width, height, transform.a, transform.b, transform.c, transform.d, transform.e, transform.f].every(Number.isFinite)) {
    throw new RangeError('Mesh2D GPU transform requires finite values and positive backing dimensions')
  }
  const x = 2 / width, y = -2 / height
  return Float32Array.from([
    x * transform.a, y * transform.b, 0,
    x * transform.c, y * transform.d, 0,
    x * transform.e - 1, y * transform.f + 1, 1,
  ])
}
