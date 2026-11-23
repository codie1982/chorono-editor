import { SplineBandControls } from '../band/SplineBandControls'
import type { SplineBandController } from '../band/useSplineBand'
import type { SplineEditMode } from '@/lib/spline/selection'
import { SplineChamferControls } from '../chamfer/SplineChamferControls'
import type { SplineChamferController } from '../chamfer/useSplineChamfer'
import { SplineFilletControls } from '../fillet/SplineFilletControls'
import type { SplineFilletController } from '../fillet/useSplineFillet'
import { SplineOutlineControls } from '../outline/SplineOutlineControls'
import type { SplineOutlineController } from '../outline/useSplineOutline'
import type { SplineToolAction } from './splineEditTools'

/** Mode-owned preview forms. The shared action supplies admission and opening;
 * existing controllers retain settings, cancellation, workers and Apply/Undo. */
export function SplineEditToolbox({ mode, actions, chamfer, fillet, outline, band }: {
  mode: SplineEditMode; actions: readonly SplineToolAction[]; chamfer?: SplineChamferController
  band?: SplineBandController; fillet?: SplineFilletController; outline?: SplineOutlineController
}) {
  if (!actions.length) return null
  const form = <T extends { disabled: boolean; eligible: boolean; selectionReason?: string; open(): void }>(controller: T, action: SplineToolAction): T =>
    ({ ...controller, disabled: action.disabled, eligible: !action.disabled, selectionReason: action.reason ?? controller.selectionReason, open: action.run })
  return <section aria-label={`${mode} geometry tools`} className="space-y-2">
    <h4 className="font-semibold">{mode === 'point' ? 'Point' : mode === 'edge' ? 'Edge' : 'Object'} geometry tools</h4>
    {actions.map(action => <div key={action.id} data-spline-tool={action.id}>
      {action.id === 'chamfer' && chamfer && <SplineChamferControls controller={form(chamfer, action)} />}
      {action.id === 'fillet' && fillet && <SplineFilletControls controller={form(fillet, action)} />}
      {action.id === 'band' && band && <SplineBandControls controller={form(band, action)} />}
      {action.id === 'offset' && outline && <SplineOutlineControls controller={form(outline, action)} />}
    </div>)}
  </section>
}
