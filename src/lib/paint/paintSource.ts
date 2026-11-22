import type { Composition, ImagePaint, ShapeFill, ShapeStroke } from '../types'

/** Retain inactive paint payloads and remember the last active mode on None.
 * Re-enabling removes the remembered mode; no input or keyframes are changed. */
export function withFillType(fill: ShapeFill | undefined, type: ShapeFill['type']): ShapeFill {
  const { disabledType, ...payload } = fill ?? {}
  const remembered = fill?.type === 'none' ? disabledType : fill?.type
  return { ...payload, type, ...(type === 'none' && remembered ? { disabledType: remembered } : {}),
    ...(type === 'solid' && !fill?.color ? { color: '#3B82F6' } : {}),
    ...(type === 'gradient' && !fill?.gradient ? { gradient: { type: 'linear' as const, angle: 90, stops: [{ offset: 0, color: fill?.color ?? '#3B82F6' }, { offset: 1, color: '#EC4899' }] } } : {}),
    ...(type === 'image' && !fill?.image ? { image: { version: 1 as const, assetId: '', fit: 'cover' as const, scale: 1 } } : {}) }
}
/** Missing fill/stroke retains the old absence contract; explicit None keeps
 * inactive authored channels so frame evaluation cannot accidentally revive it. */
export function imagePaint(fill: ShapeFill | undefined): ImagePaint | undefined { return fill?.type === 'image' ? fill.image : undefined }
/** Active assets only for renderer demand. Asset usage additionally indexes
 * inactive payloads so switching paint does not turn a retained source orphan. */
export function imagePaintAssetIds(fill: ShapeFill | undefined): readonly string[] { const id = imagePaint(fill)?.assetId; return id ? [id] : [] }
/** Legacy stroke gradients remain active until an explicit type overrides them. */
export function strokeType(stroke: ShapeStroke | undefined): 'solid' | 'gradient' | 'none' { return !stroke ? 'none' : stroke.type ?? (stroke.gradient ? 'gradient' : 'solid') }
/** Legacy composition fields are read through one adapter; no source migration. */
export function compositionFill(composition: Composition): ShapeFill {
  return composition.backgroundFill ?? (composition.backgroundGradient ? { type: 'gradient', gradient: composition.backgroundGradient }
    : { type: 'solid', color: composition.backgroundColor })
}
/** Basic exported/runtime scenes must not carry an editor-only background into
 * old players. Source is immutable. Explicit raster backgrounds bypass this. */
export function compositionForOutput(composition: Composition): Composition {
  return composition.backgroundInExport === false
    ? { ...composition, backgroundFill: { type: 'none' }, backgroundColor: 'transparent', backgroundGradient: undefined } : composition
}
/** Explicit stroke modes retain all inactive values and keys. */
export function withStrokeType(stroke: ShapeStroke | undefined, type: NonNullable<ShapeStroke['type']>): ShapeStroke {
  const next: ShapeStroke = { color: '#FFFFFF', width: 2, ...stroke, type }
  if (type === 'gradient' && !next.gradient) next.gradient = { type: 'linear', angle: 90, stops: [{ offset: 0, color: next.color }, { offset: 1, color: '#FFFFFF' }] }
  return next
}
