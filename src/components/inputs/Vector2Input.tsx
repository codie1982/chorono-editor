'use client'
import ScrubInput from './ScrubInput'
import { isVec2, type Vec2 } from '@/lib/geometry/CoordinateSystem'
import { usePropertyExpressionField } from './expressions/usePropertyExpressionField'
import { NumericPropertyProvider, useNumericPropertyInput } from './expressions/NumericPropertyContext'
import { hasNativeExpressionOwner } from '@/lib/editor/inputExpressions/ExpressionAuthoringGuard'

/** Explicit layer-local vector control. The parent owns literal point/handle
 * coupling; a live vector deforms its declared point coordinates. Child scalar
 * inputs do not inherit the whole-vector expression target. */
export function Vector2Input({ value, onChange, propertyPath, label }: { value: Vec2; onChange(value: Vec2): void; propertyPath: string; label: string }) {
  const field = usePropertyExpressionField('vec2', value, propertyPath, label), shown = isVec2(field.value) ? field.value : value
  const input = useNumericPropertyInput(propertyPath, label)
  const keyed = !!input && hasNativeExpressionOwner(input.scene, input.layerId, propertyPath)
  return <div><span className="text-xs text-gray-400">{label}</span><div className="flex gap-1 items-center">
    <NumericPropertyProvider><div key={input?.layerId + ":" + propertyPath} className="grid grid-cols-2 gap-2 flex-1 min-w-0">
      <ScrubInput disableScrub fieldLabel={label + ' X'} value={shown.x} disabled={field.readOnly || keyed} onChange={x => onChange({ ...shown, x })} />
      <ScrubInput disableScrub fieldLabel={label + ' Y'} value={shown.y} disabled={field.readOnly || keyed} onChange={y => onChange({ ...shown, y })} />
    </div></NumericPropertyProvider>{field.button}
  </div>{keyed && <p className="text-xs text-amber-300">Edit keyed coordinates on the timeline.</p>}{field.diagnostics}</div>
}
