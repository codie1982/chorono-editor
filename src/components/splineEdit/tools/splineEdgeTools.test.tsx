import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { emptyScene, newSplineLayerFromData } from '@/lib/defaults'
import { createPolylineSpline, mergeSplineData } from '@/lib/spline'
import { splineComponentTools } from './splineComponentTools'
import { SplineTopologyControls } from '../SplineTopologyControls'
import { SplineEditMenu } from '../SplineEditMenu'
import type { SplineEditController } from '../useSplineEditSelection'
import type { MenuItem } from '@/components/ui/ContextMenu'
import { useSplineViewportEditing } from '../useSplineViewportEditing'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'

let captured: MenuItem[] = []
vi.mock('@/components/ui/ContextMenu', () => ({ default: ({ items }: { items: MenuItem[] }) => { captured = items; return <div role="menu">{items.map((item, i) => item.kind === 'action' ? <button key={i} disabled={item.disabled}>{item.label}</button> : null)}</div> } }))

/** Real panel/menu/native command orchestration with a disposable source. No
 * browser, OS input or renderer is mocked as proof of a pixel-level result. */
function fixture() {
  const line = createPolylineSpline([{ x: 0, y: 0 }, { x: 100, y: 0 }], false), cutter = createPolylineSpline([{ x: 50, y: -20 }, { x: 50, y: 20 }], false)
  const layer = newSplineLayerFromData(mergeSplineData(line, cutter)), scene = emptyScene(); scene.layers = [layer]
  const edge = Object.keys(line.segments)[0], controller: SplineEditController = {
    active: true, layerId: layer.id, mode: 'edge', ids: [edge], bank: { point: [], edge: [edge], object: [] }, edgeTool: null, setEdgeTool: vi.fn(),
    attaching: false, setAttaching: vi.fn(), attachOperation: 'union', setAttachOperation: vi.fn(), nonDestructive: false, setNonDestructive: vi.fn(),
    sourceGhosts: [], focusResult: vi.fn(), enter: vi.fn(), select: vi.fn(), clear: vi.fn(), exit: vi.fn(),
  }
  return { scene, layer, edge, controller }
}
describe('shared Edge tool UI contracts', () => {
  it('routes an armed viewport pick through one native command without starting a move or selection region', () => {
    const { scene, layer, edge, controller } = fixture(), dispatch = vi.fn(), warning = vi.fn(), startDrag = vi.fn(), document = new AbortController().signal
    const editor = { getScene: () => scene, dispatchCommand: dispatch, isTransactionActive: () => false, getDocumentSignal: () => document } as unknown as EditorStateReturn
    let viewport: ReturnType<typeof useSplineViewportEditing> | undefined
    function Viewport() {
      viewport = useSplineViewportEditing({ scene, layer, controller: { ...controller, edgeTool: 'trim' }, editor, canvasRef: { current: null },
        enabled: true, timeMs: 0, zoom: 1, panMode: false, toolMode: 'select', containment: 'touching', drag: { dragRef: { current: null }, startDrag }, warning })
      return null
    }
    renderToStaticMarkup(<Viewport />)
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as any
    const world = resolveLayerWorldMatrix(layer, scene, 0).applyToPoint({ x: 25, y: 0 })
    expect(viewport!.pointerDown(world.x, world.y, event)).toBe(true)
    expect(dispatch).toHaveBeenCalledOnce(); expect(startDrag).not.toHaveBeenCalled(); expect(controller.select).not.toHaveBeenCalled()
    const command = dispatch.mock.calls[0][0], next = command.execute(scene); expect(command.undo(next)).toEqual(scene)
    expect(viewport!.moveGizmo).toBeNull()
    dispatch.mockClear(); expect(viewport!.pointerDown(1000, 1000, event)).toBe(true); expect(dispatch).not.toHaveBeenCalled()
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('Click an edge'))
  })
  it('exposes Trim/Extend only in Edge; a panel activation arms picking without any source command', () => {
    const { scene, layer, edge, controller } = fixture(), perform = vi.fn(), pick = vi.fn()
    const input = { scene, layer, ids: [edge], active: true, perform, copy: vi.fn(), pickEdgeTool: pick }
    const tools = splineComponentTools({ ...input, mode: 'edge', edgeTool: 'trim' })
    tools.find(tool => tool.id === 'trim')!.run(); expect(pick).toHaveBeenCalledWith('trim'); expect(perform).not.toHaveBeenCalled()
    expect(splineComponentTools({ ...input, mode: 'point' }).some(tool => ['trim', 'extend'].includes(tool.id))).toBe(false)
    const html = renderToStaticMarkup(<SplineTopologyControls scene={scene} layer={layer} controller={{ ...controller, edgeTool: 'trim' }} actions={{ componentTools: tools, canDetach: false, perform }} />)
    expect(html).toContain('Trim'); expect(html).toContain('Extend'); expect(html).toContain('aria-pressed="true"'); expect(html).toContain('Cancel edge tool')
  })
  it('context-menu Trim uses the clicked parameter, dispatches one command and retains one exact Undo', () => {
    const { scene, layer, edge, controller } = fixture(), dispatch = vi.fn(), warning = vi.fn(), close = vi.fn()
    renderToStaticMarkup(<SplineEditMenu x={0} y={0} target={{ kind: 'edge', id: edge, t: .25 }} layer={layer} controller={controller} getScene={() => scene} dispatch={dispatch} warning={warning} close={close} />)
    const trim = captured.find(item => item.kind === 'action' && item.label === 'Trim')!
    expect(trim.kind === 'action' && trim.disabled).toBe(false)
    if (trim.kind === 'action') trim.onSelect()
    expect(dispatch).toHaveBeenCalledTimes(1); const command = dispatch.mock.calls[0][0], next = command.execute(scene)
    expect(Object.values(next.layers[0].spline!.points).some((point: any) => Math.abs(point.x) < 1e-9 && Math.abs(point.y) < 1e-9)).toBe(false)
    expect(command.undo(next)).toEqual(scene); expect(close).toHaveBeenCalledOnce(); expect(controller.focusResult).toHaveBeenCalled()
  })
  it('context-menu Extend reports no forward intersection and never dispatches an empty Undo', () => {
    const { scene, layer, edge, controller } = fixture(), dispatch = vi.fn(), warning = vi.fn()
    renderToStaticMarkup(<SplineEditMenu x={0} y={0} target={{ kind: 'edge', id: edge, t: 1 }} layer={layer} controller={controller} getScene={() => scene} dispatch={dispatch} warning={warning} close={() => {}} />)
    const extend = captured.find(item => item.kind === 'action' && item.label === 'Extend')!
    if (extend.kind === 'action') extend.onSelect()
    expect(dispatch).not.toHaveBeenCalled(); expect(warning).toHaveBeenCalledWith(expect.stringContaining('No forward'))
  })
})
