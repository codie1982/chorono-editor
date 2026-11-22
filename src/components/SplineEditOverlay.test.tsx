import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { newSplineLayerFromData } from '@/lib/defaults'
import { createRectangleSpline } from '@/lib/spline/primitives/createRectangleSpline'
import { emptySplineSelection } from '@/lib/spline/selection'
import { Matrix2D } from '@/lib/geometry/Matrix2D'
import type { SplineEditController } from './splineEdit/useSplineEditSelection'
import { SplineModeControls } from './splineEdit/SplineModeControls'
import SplineEditOverlay from './SplineEditOverlay'

const layer = newSplineLayerFromData(createRectangleSpline({ width: 80, height: 50 }))
/** UI-only controller fixture: source/history are never needed by overlays. */
function controller(mode: 'point' | 'edge' | 'object', active = true): SplineEditController {
  return { nonDestructive: false, setNonDestructive: vi.fn(), sourceGhosts: [], focusResult: vi.fn(), layerId: layer.id, mode, active, bank: emptySplineSelection(), ids: [], attaching: false, setAttaching: vi.fn(), attachOperation: 'union', setAttachOperation: vi.fn(), enter: vi.fn(), select: vi.fn(), clear: vi.fn(), exit: vi.fn() }
}

describe('Spline edit presentation', () => {
  it('hides sub-object chrome outside edit mode', () => {
    expect(renderToStaticMarkup(<SplineEditOverlay layer={layer} zoom={1} worldMatrix={Matrix2D.identity()} selection={controller('point', false)} />)).toBe('')
  })
  it.each(['point', 'edge'] as const)('shows orange boundaries and a red selected %s even on hover', mode => {
    const id = Object.keys(mode === 'point' ? layer.spline!.points : layer.spline!.segments)[0]
    const selection = { ...controller(mode), ids: [id] }
    const html = renderToStaticMarkup(<SplineEditOverlay layer={layer} zoom={.5} worldMatrix={new Matrix2D(1.5, 0, 0, .75, 40, 20)}
      selection={selection} hover={{ kind: mode, id }} />)
    expect(html).toContain('data-spline-edit-boundary="true"')
    expect(html).toContain('stroke="#FDBA74"')
    expect(html).toContain('matrix(0.75 0 0 0.375 20 10)')
    expect(html).toContain(mode === 'point' ? 'fill="#EF4444"' : 'stroke="#EF4444"')
    expect(html).not.toContain('#2563EB')
  })
  it('announces the active mode and exposes exactly one pressed button', () => {
    const html = renderToStaticMarkup(<SplineModeControls controller={controller('edge')} />)
    expect(html).toContain('Editing · Edge')
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(html).toContain('Click the active mode again')
  })
})
