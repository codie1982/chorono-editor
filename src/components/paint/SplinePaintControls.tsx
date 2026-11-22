'use client'
import type { Asset, ShapeStyle } from '@/lib/types'
import { SplineStrokeControls } from './SplineStrokeControls'
import ColorInput from '../inputs/ColorInput'
import GradientInput from '../inputs/GradientInput'
import { ImagePaintControls, PaintNumber, paintSelectClass } from './ImagePaintControls'
import { splineFillChoice, withSplineFillChoice, type SplineFillChoice } from '@/lib/paint/splineFillChoice'

/** Shared layer paint for every SubShape; fill is drawn only for closed
 * contours, stroke also covers open ones. Modes retain inactive channels and
 * their keys. This UI owns no resources; existing Assets supplies image data.
 * The host guards writers and makes one native style command per change. */
export function SplinePaintControls({ style, assets, onChange, disabled, closed = true }: {
  style: ShapeStyle; assets: readonly Asset[]; onChange(style: ShapeStyle): void; disabled?: boolean; closed?: boolean
}) {
  const fill = style.fill
  return <fieldset disabled={disabled} className="space-y-2 border-t border-gray-700 pt-2">
    <legend className="pt-2">Shared Fill / Stroke</legend>
    <p className="text-gray-400">Applies to every object in this layer. Only closed contours show a fill.</p>
    <label className="block space-y-1">Fill<select aria-label="Spline Fill Type" className={paintSelectClass} value={splineFillChoice(fill)} onChange={event => onChange({ ...style, fill: withSplineFillChoice(fill, event.target.value as SplineFillChoice) })}>
      <option value="none">No Fill</option><option value="solid">Solid Color</option><option value="gradient">Linear Gradient</option>
      <option value="radial">Radial Gradient</option><option value="angle">Angle Gradient</option><option value="reflected">Reflected Gradient</option>
      <option value="diamond">Diamond Gradient</option><option value="pattern">Pattern Fill</option><option value="image">Image Fill</option>
    </select></label>
    {fill?.type === 'solid' && <ColorInput value={fill.color ?? '#3B82F6'} onChange={color => onChange({ ...style, fill: { ...fill, color } })} />}
    {fill?.type === 'gradient' && <GradientInput value={fill.gradient} onChange={gradient => onChange({ ...style, fill: { ...fill, gradient } })} />}
    {fill?.type === 'image' && fill.image && <ImagePaintControls value={fill.image} assets={assets} onChange={image => onChange({ ...style, fill: { ...fill, image } })} />}
    {fill && fill.type !== 'none' && <PaintNumber label="Spline fill opacity" unit="%" min={0} max={100} value={fill.opacity ?? 100}
      onChange={opacity => onChange({ ...style, fill: { ...fill, opacity } })} />}
    <SplineStrokeControls value={style.stroke} assets={assets} closed={closed} onChange={stroke => onChange({ ...style, stroke })} />
  </fieldset>
}
