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
import { SplineObjectInterpolationControls } from '../SplineObjectInterpolationControls'

let captured: MenuItem[] = []
vi.mock('@/components/ui/ContextMenu', () => ({ default: ({ items }: { items: MenuItem[] }) => { captured = items; return <div role="menu">{items.map((item, i) => item.kind === 'action' ? <button key={i} disabled={item.disabled}>{item.label}</button> : null)}</div> } }))

/** Real panel/menu/native command orchestration with a disposable source. No
 * browser, OS input or renderer is mocked as proof of a pixel-level result. */
function fixture() {
  const line = createPolylineSpline([{ x: 0, y: 0 }, { x: 100, y: 0 }], false), cutter = createPolylineSpline([{ x: 50, y: -20 }, { x: 50, y: 20 }], false)
  const layer = newSplineLayerFromData(mergeSplineData(line, cutter)), scene = emptyScene(); scene.layers = [layer]
  const edge = Object.keys(line.segments)[0], controller: SplineEditController = {
    active: true, layerId: layer.id, mode: 'edge', ids: [edge], bank: { point: [], edge: [edge], object: [] }, edgeTool: null, setEdgeTool: vi.fn(), vertexType: 'preserve', setVertexType: vi.fn(), simplifyTolerancePx: .5, setSimplifyTolerancePx: vi.fn(), subdivideParts: 2, setSubdivideParts: vi.fn(),
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
  it('arms repeated Add Vertex from all menu type choices without writing source before the next pick', () => {
    const { scene, layer, edge, controller } = fixture(), dispatch = vi.fn(), close = vi.fn()
    renderToStaticMarkup(<SplineEditMenu x={0} y={0} target={{ kind: 'edge', id: edge, t: .25 }} layer={layer} controller={controller} getScene={() => scene} dispatch={dispatch} warning={vi.fn()} close={close} />)
    const menu = captured.find(item => item.kind === 'submenu' && item.label === 'Add Vertex')!
    expect(menu.kind).toBe('submenu')
    if (menu.kind !== 'submenu') throw new Error('Missing insertion choices')
    expect(menu.items).toHaveLength(5)
    for (const [index, type] of Array.from(['preserve', 'corner', 'smooth', 'bezier', 'bezierCorner'].entries())) {
      const item = menu.items[index]; if (item.kind === 'action') item.onSelect()
      expect(controller.setVertexType).toHaveBeenLastCalledWith(type)
      expect(controller.setEdgeTool).toHaveBeenLastCalledWith('addVertex')
    }
    expect(dispatch).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledTimes(5)
    const perform = vi.fn(), tools = splineComponentTools({ scene, layer, mode: 'edge', ids: [], active: true, perform, copy: vi.fn(), pickEdgeTool: controller.setEdgeTool })
    tools.find(tool => tool.id === 'addVertex')!.run(); expect(perform).not.toHaveBeenCalled()
    const html = renderToStaticMarkup(<SplineTopologyControls scene={scene} layer={layer} controller={{ ...controller, edgeTool: 'addVertex' }} actions={{ componentTools: tools, canDetach: false, perform }} />)
    expect(html).toContain('Preserve curve'); expect(html).toContain('Each click has its own Undo')
  })
  it('Add Vertex viewport pick inserts exactly once at the clicked interior parameter', () => {
    const { scene, layer, controller } = fixture(), dispatch = vi.fn(), warning = vi.fn(), startDrag = vi.fn()
    const editor = { getScene: () => scene, dispatchCommand: dispatch, isTransactionActive: () => false, getDocumentSignal: () => new AbortController().signal } as unknown as EditorStateReturn
    let viewport: ReturnType<typeof useSplineViewportEditing> | undefined
    function Viewport() {
      viewport = useSplineViewportEditing({ scene, layer, controller: { ...controller, edgeTool: 'addVertex' }, editor, canvasRef: { current: null }, enabled: true,
        timeMs: 0, zoom: 1, panMode: false, toolMode: 'select', containment: 'touching', drag: { dragRef: { current: null }, startDrag }, warning })
      return null
    }
    renderToStaticMarkup(<Viewport />)
    const world = resolveLayerWorldMatrix(layer, scene, 0).applyToPoint({ x: 25, y: 0 })
    viewport!.pointerDown(world.x, world.y, { preventDefault: vi.fn(), stopPropagation: vi.fn() } as any)
    expect(dispatch).toHaveBeenCalledOnce(); expect(startDrag).not.toHaveBeenCalled(); expect(controller.select).not.toHaveBeenCalled()
    const command = dispatch.mock.calls[0][0], next = command.execute(scene)
    expect(Object.values(next.layers[0].spline!.points).some((p: any) => p.x === 25 && p.y === 0)).toBe(true)
    expect(command.undo(next)).toEqual(scene)
  })
  it('Object panel/menu share selection guards and Simplify tolerance; both native actions have one Undo', () => {
    const { scene, layer, controller } = fixture(), ids = Object.keys(layer.spline!.subShapes)
    const objectController = { ...controller, mode: 'object' as const, ids, simplifyTolerancePx: .125 }
    const perform = vi.fn(), tools = splineComponentTools({ scene, layer, ids, mode: 'object', active: true, simplifyTolerancePx: .125, perform, copy: vi.fn() })
    expect(tools.map(tool => tool.label)).toEqual(['Simplify', 'Smooth', 'Subdivide', 'Interpolation'])
    tools[0].run(); expect(perform).toHaveBeenCalledWith({ kind: 'simplify', tolerancePx: .125 })
    tools[1].run(); expect(perform).toHaveBeenCalledWith({ kind: 'smooth' })
    const html = renderToStaticMarkup(<SplineTopologyControls scene={scene} layer={layer} controller={objectController} actions={{ componentTools: tools, canDetach: false, perform }} />)
    expect(html).toContain('Simplify tolerance (local px)'); expect(html).toContain('Smooth')
    const empty = splineComponentTools({ scene, layer, ids: [], mode: 'object', active: true, perform, copy: vi.fn() })
    expect(empty.every(tool => tool.disabled && tool.reason === 'Select Objects first.')).toBe(true)
    const dispatch = vi.fn()
    renderToStaticMarkup(<SplineEditMenu x={0} y={0} target={{ kind: 'object', id: ids[0] }} layer={layer} controller={objectController} getScene={() => scene} dispatch={dispatch} warning={vi.fn()} close={vi.fn()} />)
    const smooth = captured.find(item => item.kind === 'action' && item.label === 'Smooth')!
    if (smooth.kind === 'action') smooth.onSelect()
    expect(dispatch).toHaveBeenCalledOnce(); const command = dispatch.mock.calls[0][0], next = command.execute(scene)
    expect(command.undo(next)).toEqual(scene)
    layer.locked = true
    expect(splineComponentTools({ scene, layer, ids, mode: 'object', active: true, perform, copy: vi.fn() }).every(tool => tool.disabled)).toBe(true)
  })
  it('Object Subdivide uses shared parts and Interpolation menu writes only metadata with one exact Undo', () => {
    const { scene, layer, controller } = fixture(), ids = Object.keys(layer.spline!.subShapes), perform = vi.fn()
    const tools = splineComponentTools({ scene, layer, ids, mode: 'object', active: true, subdivideParts: 4, perform, copy: vi.fn() })
    tools.find(tool => tool.id === 'subdivide')!.run(); expect(perform).toHaveBeenCalledWith({ kind: 'subdivide', parts: 4 })
    const dispatch = vi.fn(), objectController = { ...controller, mode: 'object' as const, ids, subdivideParts: 4 }
    renderToStaticMarkup(<SplineEditMenu x={0} y={0} target={{ kind: 'object', id: ids[0] }} layer={layer} controller={objectController} getScene={() => scene} dispatch={dispatch} warning={vi.fn()} close={vi.fn()} />)
    const subdivide = captured.find(item => item.kind === 'action' && item.label === 'Subdivide')!
    if (subdivide.kind === 'action') subdivide.onSelect()
    const division = dispatch.mock.calls[0][0], divided = division.execute(scene)
    expect(Object.keys(divided.layers[0].spline!.points)).toHaveLength(10); expect(division.undo(divided)).toEqual(scene)
    dispatch.mockClear()
    const menu = captured.find(item => item.kind === 'submenu' && item.label === 'Interpolation')!
    expect(menu.kind).toBe('submenu')
    if (menu.kind !== 'submenu') throw new Error('Missing interpolation presets')
    const preset = menu.items.find(item => item.kind === 'action' && item.label === '0.1 local px')!
    if (preset.kind === 'action') preset.onSelect()
    const apply = dispatch.mock.calls[0][0], next = apply.execute(scene), data = next.layers[0].spline!
    expect(data.points).toBe(layer.spline!.points); expect(data.contours).toBe(layer.spline!.contours)
    for (const id of ids) expect(data.subShapes[id].interpolation).toEqual({ version: 1, tolerancePx: .1 })
    expect(apply.undo(next)).toEqual(scene)
    const html = renderToStaticMarkup(<SplineObjectInterpolationControls data={data} ids={ids} tool={tools.find(tool => tool.id === 'interpolation')} />)
    expect(html).toContain('Apply interpolation'); expect(html).toContain('Use default interpolation'); expect(html).toContain('Current: 0.1 local px')
  })
})
