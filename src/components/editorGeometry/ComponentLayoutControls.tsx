import { Matrix2D } from '@/lib/geometry/Matrix2D'
import type { Vec2 } from '@/lib/geometry/CoordinateSystem'
import type { ComponentLayout } from '@/lib/geometry/componentLayout'

export interface EditPivotProps {
  pivot?: Vec2 | null
  setPivot?(point: Vec2 | null): void
}

/** Shared Mesh/Spline controls. Pivot lives in transient host state in local
 * pixels; inputs show the active frame and never write layer transform data. */
export function ComponentLayoutControls({
  count,
  frame,
  center,
  pivot,
  setPivot,
  apply,
  disabled,
}: EditPivotProps & {
  count: number
  frame: Matrix2D
  center: Vec2
  apply(action: ComponentLayout): void
  disabled?: boolean
}) {
  const point = frame.applyToPoint(pivot ?? center)
  return (
    <fieldset disabled={disabled || Math.abs(frame.determinant()) < 1e-9} className="space-y-2 rounded border border-gray-700 p-2">
      <legend>Align and distribute</legend>
      <div className="flex flex-wrap gap-1">
        {(['alignX', 'alignY', 'distributeX', 'distributeY'] as const).map((action) => (
          <button
            type="button"
            className="rounded border border-gray-600 px-2 py-1 disabled:opacity-40"
            key={action}
            disabled={count < (action.startsWith('align') ? 2 : 3)}
            onClick={() => apply(action)}
          >
            {action.replace('align', 'Align ').replace('distribute', 'Distribute ')}
          </button>
        ))}
      </div>
      {setPivot && (
        <div className="flex flex-wrap items-center gap-2">
          Edit pivot{' '}
          {(['x', 'y'] as const).map((axis) => (
            <label key={axis}>
              {axis.toUpperCase()}{' '}
              <input
                aria-label={'Edit pivot ' + axis}
                type="number"
                step="any"
                className="w-20 rounded bg-gray-800 p-1"
                value={+point[axis].toFixed(5)}
                onChange={(e) => {
                  if (Number.isFinite(e.target.valueAsNumber))
                    setPivot(frame.invert().applyToPoint({ ...point, [axis]: e.target.valueAsNumber }))
                }}
              />
            </label>
          ))}
          <button type="button" disabled={!pivot} onClick={() => setPivot(null)}>
            Reset pivot
          </button>
        </div>
      )}
    </fieldset>
  )
}
