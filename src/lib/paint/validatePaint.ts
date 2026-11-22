import type { ChronoScene, ShapeFill } from '../types'

/** Validate the new serializable paint payload, including inactive values.
 * Missing assets remain diagnosable source references; an existing non-image
 * asset cannot masquerade as image paint. Legacy color/gradient fields and
 * extension payloads are untouched. No native decode/URL ownership is acquired. */
export function assertScenePaint(scene: ChronoScene): void {
  const assets = new Map(scene.assets.map(asset => [asset.id, asset]))
  const check = (fill: ShapeFill | undefined) => {
    if (!fill) return
    if (fill.gradient) {
      const gradient = fill.gradient
      if (!['linear', 'radial', 'angle', 'reflected', 'diamond'].includes(gradient.type) || !Array.isArray(gradient.stops) || gradient.stops.length < 2 || gradient.stops.length > 256
        || !Number.isFinite(gradient.angle ?? 0) || gradient.stops.some(stop => !Number.isFinite(stop.offset) || typeof stop.color !== 'string'
          || stop.opacity !== undefined && (!Number.isFinite(stop.opacity) || stop.opacity < 0 || stop.opacity > 100))) throw new Error('Invalid gradient paint or stop alpha.')
    }
    if (fill.disabledType !== undefined && !['solid', 'gradient', 'image'].includes(fill.disabledType)) throw new Error('Invalid inactive fill type.')
    if (fill.type === 'image' && !fill.image) throw new Error('Image paint requires its versioned placement payload.')
    const image = fill.image
    if (!image) return
    if (image.version !== 1 || typeof image.assetId !== 'string' || image.repeat !== undefined && typeof image.repeat !== 'boolean' || image.fit !== undefined && !['cover', 'contain', 'fill'].includes(image.fit)
      || ![image.offsetX ?? 0, image.offsetY ?? 0, image.scale ?? 1, image.rotationDeg ?? 0].every(Number.isFinite) || (image.scale ?? 1) <= 0) throw new Error('Invalid image paint placement.')
    if (image.assetId && assets.has(image.assetId) && assets.get(image.assetId)!.type !== 'image') throw new Error('Image paint must reference an image asset.')
  }
  check(scene.composition.backgroundFill)
  if (scene.composition.backgroundInExport !== undefined && typeof scene.composition.backgroundInExport !== 'boolean') throw new Error('Invalid background export visibility.')
  for (const layer of scene.layers) {
    check(layer.style?.fill)
    const stroke = layer.style?.stroke
    if (stroke?.image) check({ type: 'image', image: stroke.image })
    if (stroke?.type === 'pattern' && !stroke.image) throw new Error('Pattern stroke requires image placement.')
    if (stroke?.gradient) check({ type: 'gradient', gradient: stroke.gradient })
    if (stroke?.dashEnabled !== undefined && typeof stroke.dashEnabled !== 'boolean') throw new Error('Invalid dash enabled value.')
    if (layer.style?.stroke?.type !== undefined && !['solid', 'gradient', 'pattern', 'none'].includes(layer.style.stroke.type)) throw new Error('Invalid stroke paint type.')
  }
}
