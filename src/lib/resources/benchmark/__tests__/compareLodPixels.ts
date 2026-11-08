/** Native browser QA only. Downsamples both full backing frames with the same
 * filter to approximate the requested CSS zoom, then compares opaque displayed
 * colors. Source canvases are never read directly (avoids backend promotion).
 * No pixels or DOM handles escape; metrics cover every displayed pixel. */
export function compareLodPixels(reference: HTMLCanvasElement, actual: HTMLCanvasElement, zoom: number) {
  const width = Math.max(1, Math.round(reference.width * zoom)), height = Math.max(1, Math.round(reference.height * zoom))
  const copies = [reference, actual].map(source => {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })!
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high'
    context.drawImage(source, 0, 0, width, height)
    return { canvas, pixels: context.getImageData(0, 0, width, height).data }
  })
  let sum = 0, squared = 0, maxError = 0, changedPixels = 0, over32 = 0
  try {
    const left = copies[0].pixels, right = copies[1].pixels
    for (let p = 0; p < left.length; p += 4) {
      let pixelMax = 0
      for (let c = 0; c < 4; c++) {
        const delta = Math.abs(left[p + c] - right[p + c])
        sum += delta; squared += delta * delta; pixelMax = Math.max(pixelMax, delta)
      }
      maxError = Math.max(maxError, pixelMax)
      if (pixelMax) changedPixels++
      if (pixelMax > 32) over32++
    }
    const meanAbsoluteError = sum / left.length, rmse = Math.sqrt(squared / left.length)
    return { width, height, changedPixels, maxError, meanAbsoluteError, rmse,
      over32Fraction: over32 / (width * height),
      previewWithinTolerance: rmse <= 2 && over32 / (width * height) <= 0.005 }
  } finally { copies.forEach(copy => { copy.canvas.width = copy.canvas.height = 0 }) }
}
