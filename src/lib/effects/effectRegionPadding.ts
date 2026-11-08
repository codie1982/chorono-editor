/** Conservative guard for native CSS and GPU Gaussian paths, in composition
 * pixels. GPU support is ceil(3*sigma), capped at 95 taps; CSS uses a browser
 * kernel. Six sigma plus two pixels also guards sequential resampling and
 * alpha quantization. Nonfinite/negative parameters preserve the full domain.
 * This only bounds transparent local effects, never full-rect inverse fills. */
export function gaussianRegionPadding(radius: number): number | null {
  return Number.isFinite(radius) && radius >= 0 ? Math.ceil(6 * radius) + 2 : null
}

/** Offset shadow retains the original and shifted blur. Symmetric padding
 * includes fractional-image interpolation. Pure; invalid values opt out. */
export function shadowRegionPadding(blur: number, x: number, y: number): number | null {
  const halo = gaussianRegionPadding(blur)
  return halo !== null && Number.isFinite(x) && Number.isFinite(y)
    ? halo + Math.ceil(Math.max(Math.abs(x), Math.abs(y))) + 2 : null
}
