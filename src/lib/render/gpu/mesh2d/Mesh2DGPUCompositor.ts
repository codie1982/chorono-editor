/** Composites a full-backing transparent GPU pass without applying the layer transform twice. */
export class Mesh2DGPUCompositor {
  static composite(source: HTMLCanvasElement, destination: CanvasRenderingContext2D): void {
    const operation = destination.globalCompositeOperation
    destination.save()
    try {
      destination.setTransform(1, 0, 0, 1, 0, 0)
      destination.globalAlpha = 1
      destination.filter = 'none'
      destination.globalCompositeOperation = operation
      destination.drawImage(source, 0, 0)
    } finally {
      destination.restore()
    }
  }
}
