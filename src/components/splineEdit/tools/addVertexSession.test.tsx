import { useState } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { emptyScene, newSplineLayerFromData } from '@/lib/defaults'
import { createPolylineSpline } from '@/lib/spline'
import { useEditorState, type EditorStateReturn } from '@/app/hooks/useEditorState'
import { useSplineEditSelection, type SplineEditController } from '../useSplineEditSelection'
import { useSplineTopologyActions, type SplineTopologyActions } from '../useSplineTopologyActions'
import { useSplineViewportEditing } from '../useSplineViewportEditing'

vi.mock('@/lib/shortcuts/keyboardScope', () => ({ hasVisibleKeyboardScope: () => false }))
let root: ReactTestRenderer | undefined
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; vi.unstubAllGlobals() })

/** Real React owner/history/viewport hooks, with an EventTarget-only platform.
 * This checks source adoption and keyboard cancellation, not browser pixels. */
function mount(objectTools = false) {
  const scene = emptyScene(), layer = newSplineLayerFromData(createPolylineSpline(objectTools ? [{ x: 0, y: 0 }, { x: 20, y: .05 }, { x: 40, y: 0 }, { x: 60, y: 15 }, { x: 90, y: 10 }] : [{ x: 0, y: 0 }, { x: 100, y: 0 }], false)); scene.layers = [layer]
  const window = new EventTarget(); vi.stubGlobal('window', window); vi.stubGlobal('Element', class {}); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  let live: { editor: EditorStateReturn; controller: SplineEditController; actions: SplineTopologyActions; warning: string }
  function Host() {
    const editor = useEditorState(scene), current = editor.scene.layers[0], controller = useSplineEditSelection(current, editor.getDocumentSignal()), [warning, setWarning] = useState('')
    const actions = useSplineTopologyActions({ layer: current, controller, getScene: editor.getScene, dispatch: editor.dispatchCommand, warning: setWarning })
    useSplineViewportEditing({ controller, layer: current, scene: editor.scene, editor, timeMs: 0, zoom: 1, canvasRef: { current: null }, enabled: true,
      panMode: false, toolMode: 'select', containment: 'touching', drag: { dragRef: { current: null }, startDrag: () => {} }, warning: setWarning, getContext: () => 'canvas' })
    live = { editor, controller, actions, warning }; return null
  }
  act(() => { root = create(<Host />) })
  return { get: () => live!, scene, window }
}
describe('persistent Add Vertex session', () => {
  it('stays armed through repeated additions and independent Undo/Redo, and Esc cancels without clearing selection', () => {
    const host = mount()
    act(() => host.get().controller.enter('edge'))
    act(() => host.get().actions.componentTools.find(tool => tool.id === 'addVertex')!.run())
    expect(host.get().controller.edgeTool).toBe('addVertex'); expect(host.get().editor.canUndo).toBe(false)
    for (let i = 0; i < 2; i++) {
      const edgeId = Object.keys(host.get().editor.getScene().layers[0].spline!.segments).at(-1)!
      act(() => host.get().actions.perform({ kind: 'addVertex', edgeId, t: .5, pointType: host.get().controller.vertexType }))
      expect(host.get().controller.edgeTool).toBe('addVertex'); expect(host.get().controller.mode).toBe('edge')
      expect(host.get().controller.bank.point).toHaveLength(1); expect(host.get().warning).toBe('')
    }
    expect(Object.keys(host.get().editor.getScene().layers[0].spline!.points)).toHaveLength(4)
    act(() => host.get().editor.undo()); expect(Object.keys(host.get().editor.getScene().layers[0].spline!.points)).toHaveLength(3)
    expect(host.get().controller.edgeTool).toBe('addVertex')
    act(() => host.get().editor.undo()); expect(host.get().editor.getScene()).toEqual(host.scene)
    act(() => host.get().editor.redo()); expect(host.get().controller.edgeTool).toBe('addVertex')
    const selected = host.get().controller.ids
    const escape = new Event('keydown', { cancelable: true }); Object.defineProperty(escape, 'key', { value: 'Escape' })
    act(() => { host.window.dispatchEvent(escape) })
    expect(host.get().controller.edgeTool).toBeNull(); expect(host.get().controller.active).toBe(true); expect(host.get().controller.ids).toEqual(selected)
  })
  it('changes insertion type without a command and clears the tool on mode/document changes', () => {
    const host = mount(); act(() => host.get().controller.enter('edge')); act(() => host.get().controller.setEdgeTool('addVertex'))
    act(() => host.get().controller.setVertexType('bezierCorner'))
    expect(host.get().editor.getScene()).toEqual(host.scene); expect(host.get().editor.canUndo).toBe(false)
    expect(host.get().controller.edgeTool).toBe('addVertex'); expect(host.get().controller.vertexType).toBe('bezierCorner')
    act(() => host.get().controller.enter('point')); expect(host.get().controller.edgeTool).toBeNull()
    act(() => host.get().controller.enter('edge')); act(() => host.get().controller.setEdgeTool('addVertex'))
    act(() => host.get().editor.resetScene(structuredClone(host.scene)))
    expect(host.get().controller.active).toBe(false); expect(host.get().controller.vertexType).toBe('preserve')
  })
})

describe('Object tool session history', () => {
  it('keeps tolerance UI-only and each Simplify/Smooth activation as an independent Undo without moving the layer', () => {
    const host = mount(true), ids = Object.keys(host.scene.layers[0].spline!.subShapes)
    act(() => host.get().controller.enter('object', ids))
    act(() => host.get().controller.setSimplifyTolerancePx(.2))
    expect(host.get().editor.canUndo).toBe(false)
    act(() => host.get().actions.componentTools.find(tool => tool.id === 'simplify')!.run())
    const simplified = host.get().editor.getScene()
    expect(Object.keys(simplified.layers[0].spline!.points)).toHaveLength(4)
    expect(host.get().controller.simplifyTolerancePx).toBe(.2); expect(host.get().controller.ids).toEqual(ids)
    act(() => host.get().actions.componentTools.find(tool => tool.id === 'smooth')!.run())
    const smoothed = host.get().editor.getScene()
    expect(Object.values(smoothed.layers[0].spline!.points).map(p => [p.x, p.y])).toEqual(Object.values(simplified.layers[0].spline!.points).map(p => [p.x, p.y]))
    expect(smoothed.layers[0].transform).toEqual(host.scene.layers[0].transform)
    act(() => host.get().editor.undo()); expect(host.get().editor.getScene()).toEqual(simplified)
    act(() => host.get().editor.undo()); expect(host.get().editor.getScene()).toEqual(host.scene)
    act(() => host.get().editor.redo()); act(() => host.get().editor.redo()); expect(host.get().editor.getScene()).toEqual(smoothed)
    act(() => host.get().actions.componentTools.find(tool => tool.id === 'smooth')!.run())
    act(() => host.get().editor.undo()); expect(host.get().editor.getScene()).toEqual(simplified) // identical Smooth did not add history
  })
})
