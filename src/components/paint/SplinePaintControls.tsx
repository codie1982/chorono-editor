'use client'
import type { Asset, ShapeFill, ShapeStroke, ShapeStyle } from '@/lib/types'
import { withFillType, strokeType, withStrokeType } from '@/lib/paint/paintSource'
import ColorInput from '../inputs/ColorInput'
import GradientInput from '../inputs/GradientInput'
import { ImagePaintControls, PaintNumber, paintSelectClass } from './ImagePaintControls'

/** Shared layer paint for every SubShape; fill is drawn only for closed
 * contours, stroke also covers open ones. Modes retain inactive channels and
 * their keys. This UI owns no resources; existing Assets supplies image data.
 * The host guards writers and makes one native style command per change. */
export function SplinePaintControls({ style, assets, onChange, disabled }: {
  style: ShapeStyle; assets: readonly Asset[]; onChange(style: ShapeStyle): void; disabled?: boolean
}) {
  const fill = style.fill, stroke = style.stroke, type = strokeType(stroke)
  return <fieldset disabled={disabled} className="space-y-2 border-t border-gray-700 pt-2">
    <legend className="pt-2">Shared Fill / Stroke</legend>
    <p className="text-gray-400">Applies to every object in this layer. Only closed contours show a fill.</p>
    <label className="block space-y-1">Fill<select aria-label="Spline Fill Type" className={paintSelectClass} value={fill?.type ?? 'none'} onChange={event => onChange({ ...style, fill: withFillType(fill, event.target.value as ShapeFill['type']) })}>
      <option value="none">None</option><option value="solid">Color</option><option value="gradient">Gradient</option><option value="image">Image</option>
    </select></label>
    {fill?.type === 'solid' && <ColorInput value={fill.color ?? '#3B82F6'} onChange={color => onChange({ ...style, fill: { ...fill, color } })} />}
    {fill?.type === 'gradient' && <GradientInput value={fill.gradient} onChange={gradient => onChange({ ...style, fill: { ...fill, gradient } })} />}
    {fill?.type === 'image' && fill.image && <ImagePaintControls value={fill.image} assets={assets} onChange={image => onChange({ ...style, fill: { ...fill, image } })} />}
    <label className="block space-y-1">Stroke<select aria-label="Spline Stroke Type" className={paintSelectClass} value={type} onChange={event => onChange({ ...style, stroke: withStrokeType(stroke, event.target.value as NonNullable<ShapeStroke['type']>) })}>
      <option value="none">None</option><option value="solid">Color</option><option value="gradient">Gradient</option>
    </select></label>
    {type !== 'none' && <>
      <ColorInput value={stroke?.color ?? '#FFFFFF'} onChange={color => onChange({ ...style, stroke: { ...withStrokeType(stroke, type), color } })} />
      <PaintNumber label="Spline stroke width" unit="px" min={0} value={stroke?.width ?? 2} onChange={width => onChange({ ...style, stroke: { ...withStrokeType(stroke, type), width } })} />
      {type === 'gradient' && <GradientInput value={stroke?.gradient} onChange={gradient => onChange({ ...style, stroke: { ...withStrokeType(stroke, type), gradient } })} />}
    </>}
  </fieldset>
}
