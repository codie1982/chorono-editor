import type { Asset, ShapeStroke } from '@/lib/types'
import { strokeType, withStrokeType } from '@/lib/paint/paintSource'
import ColorInput from '../inputs/ColorInput'
import GradientInput from '../inputs/GradientInput'
import { ImagePaintControls, PaintNumber, paintSelectClass } from './ImagePaintControls'
import { StrokeDashControls } from './StrokeDashControls'

/** Shared source stroke editor. Paint/geometry are independent of Fill; all
 * inactive values remain. Open paths explicitly use Center alignment. Width,
 * dash/gap are local px, opacity percent; the host owns native Undo and assets. */
export function SplineStrokeControls({ value, assets, onChange, closed = true }: {
  value?: ShapeStroke; assets: readonly Asset[]; onChange(value: ShapeStroke): void; closed?: boolean
}) {
  const type = strokeType(value), stroke = value ?? withStrokeType(undefined, 'solid')
  const update = (patch: Partial<ShapeStroke>) => onChange({ ...stroke, ...patch })
  return <section aria-label="Spline Stroke" className="space-y-2 border-t border-gray-700 pt-2">
    <h4 className="font-medium">Stroke</h4>
    <label className="block space-y-1">Stroke Fill<select aria-label="Spline Stroke Type" value={type} className={paintSelectClass}
      onChange={event => onChange(withStrokeType(value, event.target.value as NonNullable<ShapeStroke['type']>))}>
      <option value="none">None</option><option value="solid">Solid</option><option value="gradient">Gradient</option><option value="pattern">Pattern</option>
    </select></label>
    {type !== 'none' && <>
      {type === 'solid' && <ColorInput fieldLabel="Spline stroke color" value={stroke.color} onChange={color => update({ color })} />}
      {type === 'gradient' && <GradientInput value={stroke.gradient} onChange={gradient => update({ gradient })} />}
      {type === 'pattern' && stroke.image && <ImagePaintControls value={stroke.image} assets={assets} onChange={image => update({ image: { ...image, repeat: true } })} />}
      <div className="grid grid-cols-2 gap-2">
        <PaintNumber label="Spline stroke width" unit="px" min={0} value={stroke.width} onChange={width => update({ width })} />
        <PaintNumber label="Spline stroke opacity" unit="%" min={0} max={100} value={stroke.opacity ?? 100} onChange={opacity => update({ opacity })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">Stroke Align<select aria-label="Spline stroke alignment" value={closed ? stroke.alignment ?? 'center' : 'center'} disabled={!closed} className={paintSelectClass}
          onChange={event => update({ alignment: event.target.value as ShapeStroke['alignment'] })}>
          <option value="inside">Inside</option><option value="center">Center</option><option value="outside">Outside</option>
        </select></label>
        <label className="block space-y-1">Stroke Caps<select aria-label="Spline stroke caps" value={stroke.lineCap ?? 'butt'} className={paintSelectClass}
          onChange={event => update({ lineCap: event.target.value as ShapeStroke['lineCap'] })}>
          <option value="butt">Butt</option><option value="round">Round</option><option value="square">Square</option>
        </select></label>
        <label className="block space-y-1">Stroke Corners<select aria-label="Spline stroke corners" value={stroke.lineJoin ?? 'miter'} className={paintSelectClass}
          onChange={event => update({ lineJoin: event.target.value as ShapeStroke['lineJoin'] })}>
          <option value="miter">Miter</option><option value="round">Round</option><option value="bevel">Bevel</option>
        </select></label>
      </div>
      {!closed && <p className="text-xs text-gray-400">Open or mixed contours use Center alignment.</p>}
      <StrokeDashControls stroke={stroke} onChange={onChange} />
    </>}
  </section>
}
