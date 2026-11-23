import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useEditorState, type EditorStateReturn } from '@/app/hooks/useEditorState'
import { emptyScene, newSplineLayerFromData } from '@/lib/defaults'
import { newStructuredGridMesh2DLayer } from '@/lib/registry/definitions/mesh2d/Mesh2DDefinition'
import { createPolylineSpline, createRectangleSpline, mergeSplineData } from '@/lib/spline'
import { modifierOutputReadOnly } from '@/lib/modifiers'
import { useSplineEditSelection, type SplineEditController } from '@/components/splineEdit/useSplineEditSelection'
import { SplineModeControls } from '@/components/splineEdit/SplineModeControls'
import { useGeometryEditMode, type GeometryEditMode } from './useGeometryEditMode'
import GeometryEditPanel from './GeometryEditPanel'
import type { MenuItem } from '@/components/ui/ContextMenu'

let items: MenuItem[] = [], root: ReactTestRenderer | undefined
vi.mock('@/components/ui/ContextMenu', () => ({ default: ({ items: value }: { items: MenuItem[] }) => { items = value; return null } }))
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; items = []; vi.unstubAllGlobals() })

/** Production editor/selection/session/panel with renderer refs left null. The
 * menu transport is captured; every source write uses actual native commands. */
function mount(kind: 'spline' | 'mesh2d' = 'spline') {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const noise = createPolylineSpline(Array.from({ length: 21 }, (_, i) => ({ x: i * 5, y: Math.sin(i) * .1 })), false), rectangle = createRectangleSpline({ width: 20, height: 10 })
  Object.values(noise.subShapes)[0].name = 'Noise'; Object.values(rectangle.subShapes)[0].name = 'Rectangle'
  const layer = kind === 'mesh2d' ? newStructuredGridMesh2DLayer() : newSplineLayerFromData(mergeSplineData(noise, rectangle)), scene = emptyScene(); scene.layers = [layer]
  let live: { editor: EditorStateReturn; controller: SplineEditController; mode: GeometryEditMode }
  function Host() {
    const editor = useEditorState(scene), current = editor.scene.layers[0], controller = useSplineEditSelection(current, editor.getDocumentSignal()), mode = useGeometryEditMode(current, controller, editor.getDocumentSignal())
    live = { editor, controller, mode }
    return <GeometryEditPanel layer={current} editMode={mode} selectedPointId={controller.mode === 'point' ? controller.ids[0] ?? null : null} selectedIds={[layer.id]}
      selectedPointIds={controller.mode === 'point' ? controller.bank.point : []}
      selectedContourIds={controller.mode === 'object' ? controller.bank.object.flatMap(id => current.spline?.subShapes[id]?.contourIds ?? []) : []}
      selectedObjectIds={controller.mode === 'object' ? controller.bank.object : []} onSplineSourceBaked={id => controller.focusResult({ layerId: id, mode: 'object' })}
      splineModeControls={<SplineModeControls controller={controller} disabled={modifierOutputReadOnly(current)} />}
      splineSourceSettings={controller.layerId === current.id ? <p>Native source controls</p> : undefined}
      getScene={editor.getScene} getRevision={editor.getRevision} getDocumentSignal={editor.getDocumentSignal} isTransactionActive={editor.isTransactionActive}
      dispatchCommand={editor.dispatchCommand} onSelectLayer={() => {}} onClearPoint={controller.clear} onLayerChange={() => {}} />
  }
  act(() => { root = create(<Host />) })
  const button = (label: string) => root!.root.findAllByType('button').find(node => node.props['aria-label'] === label || node.children.join('') === label)!
  const click = (label: string) => act(() => { const node = button(label); expect(node).toBeDefined(); node.props.onClick({ currentTarget: { getBoundingClientRect: () => ({ left: 0, bottom: 20 }) } }) })
  const add = (label: string) => { click(`Add ${kind === 'mesh2d' ? 'Mesh' : 'Spline'} modifiers`); act(() => { const item = items.find(item => item.kind === 'action' && item.label === label)!; expect(item).toBeDefined(); if (item.kind === 'action') item.onSelect() }) }
  return { get: () => live!, scene, noise, rectangle, click, add, button }
}

describe('parametric spline panel session', () => {
  it.each([
    ['spline', 'Path Simplify', 'Path Simplify Tolerance', .01, 'tolerancePx'],
    ['mesh2d', 'Smooth', 'Smooth Amount', .5, 'strength'],
  ] as const)('adds/executes/toggles/bakes %s modifiers with Undo outside Edit, without entering it', (kind, label, field, value, setting) => {
    const host = mount(kind)
    expect(host.get().mode.active).toBe(false)
    host.add(label)
    const added = host.get().editor.getScene()
    expect(added.layers[0].modifierStack!.modifiers).toHaveLength(1)
    expect(host.get().mode.active).toBe(false)
    act(() => root!.root.findByProps({ 'aria-label': field }).props.onChange({ currentTarget: { valueAsNumber: value } }))
    expect(host.get().editor.getScene()).toBe(added)
    host.click('Execute stack'); const executed = host.get().editor.getScene()
    expect(executed.layers[0].modifierStack!.modifiers[0].settings[setting]).toBe(value)
    expect(host.get().mode.active).toBe(false)
    act(() => host.get().editor.undo()); expect(host.get().editor.getScene()).toEqual(added)
    act(() => host.get().editor.redo()); expect(host.get().editor.getScene()).toEqual(executed)
    for (const enabled of [false, true]) {
      act(() => root!.root.findByProps({ 'aria-label': `Enable ${label} 1` }).props.onChange({ currentTarget: { checked: enabled } }))
      expect(host.get().mode.active).toBe(false)
    }
    const beforeBake = host.get().editor.getScene()
    host.click('Bake stack')
    expect(host.get().editor.getScene().layers[0].modifierStack).toBeUndefined()
    expect(host.get().mode.active).toBe(false); expect(host.get().controller.active).toBe(false)
    act(() => host.get().editor.undo()); expect(host.get().editor.getScene()).toEqual(beforeBake)
    expect(host.get().mode.active).toBe(false)
    host.click(`Remove ${label} modifier 1`)
    expect(host.get().editor.getScene().layers[0].modifierStack!.modifiers).toHaveLength(0)
    expect(host.get().mode.active).toBe(false)
    act(() => host.get().editor.undo()); expect(host.get().editor.getScene()).toEqual(beforeBake)
  })

  it('retains modifier selection and pending settings through entering and leaving Edit', () => {
    const host = mount(); host.add('Path Simplify')
    const added = host.get().editor.getScene()
    act(() => root!.root.findByProps({ 'aria-label': 'Path Simplify Tolerance' }).props.onChange({ currentTarget: { valueAsNumber: .001 } }))
    act(() => { host.get().mode.enter('object') }); expect(host.get().mode.active).toBe(true)
    act(() => host.get().mode.exit()); expect(host.get().mode.active).toBe(false)
    expect(root!.root.findByProps({ 'aria-label': 'Path Simplify Tolerance' }).props.value).toBe(.001)
    expect(host.get().editor.getScene()).toBe(added)
    host.click('Execute stack')
    expect(host.get().editor.getScene().layers[0].modifierStack!.modifiers[0].settings.tolerancePx).toBe(.001)
    expect(host.get().mode.active).toBe(false)
  })

  it.each([
    ['Offset Path', 'contourIds'], ['Round Corners', 'pointIds'],
    ['Path Simplify', 'objectIds'], ['Path Smoothing', 'objectIds'],
  ] as const)('starts %s with its full input regardless of Point/Object selection', (label, targetKey) => {
    const host = mount()
    act(() => host.get().controller.enter(targetKey === 'pointIds' ? 'point' : 'object'))
    act(() => host.get().controller.select(targetKey === 'pointIds' ? Object.keys(host.rectangle.points).slice(0, 1) : Object.keys(host.rectangle.subShapes)))
    host.add(label)
    const record = host.get().editor.getScene().layers[0].modifierStack!.modifiers[0]
    expect(record.settings[targetKey]).toEqual([])
    expect(record.settings.selectionTopology).toBeUndefined()
  })

  it('keeps the settings session reachable after source becomes generated, stages numeric drafts and commits only on Execute', () => {
    const host = mount(); act(() => { host.get().mode.enter('object') }); act(() => host.get().controller.select(Object.keys(host.noise.subShapes)))
    host.add('Path Simplify')
    expect(items.filter(item => item.kind === 'action').map(item => item.label)).toEqual(['Offset Path', 'Round Corners', 'Path Simplify', 'Path Smoothing', 'Path Resample', 'Zig Zag', 'Pucker & Bloat', 'Repeater', 'Stroke to Path'])
    expect(host.get().mode.active).toBe(true); expect(host.get().controller.active).toBe(false)
    const first = host.get().editor.getScene(), id = first.layers[0].modifierStack!.modifiers[0].id
    expect(Object.keys(first.layers[0].spline!.points).length).toBeLessThan(Object.keys(host.scene.layers[0].spline!.points).length)
    const input = root!.root.findByProps({ 'aria-label': 'Path Simplify Tolerance' })
    act(() => input.props.onChange({ currentTarget: { valueAsNumber: .001 } })); expect(host.get().editor.getScene()).toBe(first)
    host.click('Execute stack'); const fine = host.get().editor.getScene()
    expect(fine.layers[0].modifierStack!.modifiers[0].settings.tolerancePx).toBe(.001)
    expect(Object.keys(fine.layers[0].spline!.points).length).toBeGreaterThan(Object.keys(first.layers[0].spline!.points).length)
    act(() => root!.root.findByProps({ 'aria-label': 'Path Simplify Tolerance' }).props.onChange({ currentTarget: { valueAsNumber: -1 } }))
    host.click('Execute stack'); expect(host.get().editor.getScene()).toBe(fine)
    expect(root!.root.findByProps({ role: 'alert' }).children.join('')).toContain('tolerancePx')
    act(() => host.get().editor.undo()); expect(host.get().editor.getScene()).toEqual(first)
    expect(host.get().editor.getScene().layers[0].modifierStack!.modifiers[0].id).toBe(id)
    act(() => host.get().editor.redo()); expect(host.get().mode.active).toBe(true)
    act(() => root!.root.findByProps({ 'aria-label': 'Enable Path Simplify 1' }).props.onChange({ currentTarget: { checked: false } }))
    expect(host.get().mode.active).toBe(true); expect(host.get().controller.active).toBe(true); expect(host.get().controller.mode).toBe('object')
    act(() => root!.root.findByProps({ 'aria-label': 'Enable Path Simplify 1' }).props.onChange({ currentTarget: { checked: true } }))
    expect(host.get().mode.active).toBe(true); expect(host.get().controller.active).toBe(false)
    act(() => host.get().editor.undo()); act(() => host.get().editor.undo()); act(() => host.get().editor.undo())
    expect(host.get().editor.getScene()).toEqual(first)
    act(() => host.get().editor.undo()); expect(host.get().editor.getScene()).toEqual(host.scene)
  })
  it('scopes Objects from the stage input after generation and Bake re-enters editable Object mode with one Undo', () => {
    const host = mount(); act(() => { host.get().mode.enter('object') }); host.add('Path Smoothing')
    const before = host.get().editor.getScene()
    const target = root!.root.findByProps({ 'aria-label': 'Path Smoothing target Rectangle' })
    act(() => target.props.onChange({ currentTarget: { checked: false } })); expect(host.get().editor.getScene()).toBe(before)
    host.click('Execute stack'); const scoped = host.get().editor.getScene(), record = scoped.layers[0].modifierStack!.modifiers[0]
    expect(record.settings.objectIds).toEqual(Object.keys(host.noise.subShapes)); expect(record.settings.selectionTopology).toBeDefined()
    for (const p of Object.values(host.rectangle.points)) expect(scoped.layers[0].spline!.points[p.id]).toEqual(p)
    host.click('Bake stack'); const baked = host.get().editor.getScene()
    expect(baked.layers[0].modifierStack).toBeUndefined(); expect(baked.layers[0].spline).toEqual(scoped.layers[0].spline)
    expect(host.get().controller.active).toBe(true); expect(host.get().controller.mode).toBe('object'); expect(host.get().mode.active).toBe(true)
    act(() => host.get().editor.undo()); expect(host.get().editor.getScene()).toEqual(scoped)
  })
})
