import { liveOutlineObjectIds } from '../liveOutline/data'
import type { Layer, ShapeStyle } from '../../types'
import type { SplineSubShape } from '../../types/spline'
import { retainSplineContours } from '../topology/records'
import { strokeType } from '../../paint/paintSource'

/** Geometry-band paint is separate from the source line. By default the
 * owning layer's stroke becomes a fill (including gradient/image/alpha), with
 * no second stroke. Properties may replace it with a detached custom style.
 * No layer style is rewritten and no renderer/asset resources are retained. */
export function splineObjectStyle(object: SplineSubShape, style?: ShapeStyle, override?: ShapeStyle | null): ShapeStyle | undefined {
  if (override) return override
  if (override === null) object = { ...object, paint: { version: 1, source: 'stroke' } }
  if (!object.paint) return style
  if (object.paint.source === 'custom') return object.paint.style ?? {}
  const stroke = style?.stroke, type = strokeType(stroke)
  return { fill: { type: type === 'pattern' ? 'image' : type, color: stroke?.color ?? '#000000', opacity: stroke?.opacity ?? 100,
    gradient: stroke?.gradient, image: stroke?.image }, stroke: { type: 'none', color: '#000000', width: 0 } }
}
/** All legacy Objects remain one compound paint group, preserving their old
 * global evenodd/nonzero semantics. Independently painted bands draw afterward
 * in stable Object order, each with its own holes and local paint bounds. */
export function splinePaintGroups(layer: Layer): { layer: Layer; independent: boolean }[] {
  const data = layer.spline
  if (!data || !Object.values(data.subShapes).some(o => o.paint)) return [{ layer, independent: false }]
  const original = Object.values(data.subShapes).filter(o => !o.paint)
  const groups: { layer: Layer; independent: boolean }[] = []
  const make = (objects: SplineSubShape[], independent: boolean) => {
    if (!objects.length) return
    const ids = new Set(objects.flatMap(o => o.contourIds))
    const spline = retainSplineContours({ ...data, subShapes: Object.fromEntries(objects.map(o => [o.id, o])) }, Object.fromEntries(Object.entries(data.contours).filter(([id]) => ids.has(id))))
    groups.push({ layer: { ...layer, spline, style: independent ? splineObjectStyle(objects[0], layer.style, layer.splinePaintOverrides?.objects[objects[0].id]) : layer.style }, independent })
  }
  make(original, false)
  for (const object of Object.values(data.subShapes)) if (object.paint) make([object], true)
  return groups
}
/** Active independent paint styles for resource demand; no dependency on the
 * renderer. Inactive custom paint remains retained by portable asset indexing. */
export function splineObjectStyles(layer: Layer): ShapeStyle[] {
  return Object.values(layer.spline?.subShapes ?? {}).filter(o => o.paint).map(o => splineObjectStyle(o, layer.style, layer.splinePaintOverrides?.objects[o.id]) ?? {})
}

/** Properties paint command adapter. Generated output appearance is owned by
 * the Layer outside the geometry recipe, so disabling an operation cannot
 * discard it. Native/baked Objects keep ordinary versioned Object paint. */
export function withSplineObjectPaint(layer: Layer, objectId: string, style: ShapeStyle | null): Layer {
  const object = layer.spline?.subShapes[objectId]
  if (!object || !object.paint && !liveOutlineObjectIds(layer).includes(objectId)) throw new Error('Select an Outline Object paint target.')
  if (layer.modifierStack) {
    const objects = { ...layer.splinePaintOverrides?.objects }
    objects[objectId] = style
    return { ...layer, splinePaintOverrides: { version: 1, objects } }
  }
  return { ...layer, spline: { ...layer.spline!, subShapes: { ...layer.spline!.subShapes,
    [objectId]: { ...object, paint: style ? { version: 1, source: 'custom', style } : { version: 1, source: 'stroke' } } } } }
}

/** Paint targets for authored source Objects and their live evaluated bands.
 * A virtual paint marker is UI-only; source geometry/metadata is untouched. */
export function splinePaintTargets(layer: Layer): SplineSubShape[] {
  const live = new Set(liveOutlineObjectIds(layer))
  return Object.values(layer.spline?.subShapes ?? {}).flatMap(object => object.paint ? [object]
    : live.has(object.id) ? [{ ...object, paint: { version: 1 as const, source: 'stroke' as const } }] : [])
}
