import { useEffect, useMemo, useState, type RefObject } from 'react'
import type { Layer, ChronoScene } from '@/lib/types'
import type { OverrideMap } from '@/lib/evaluator'
import { MeshComponentSelection, type MeshComponentMode } from '@/lib/geometry/mesh2d/selection/MeshComponentSelection'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import { transformAxisFrame, type TransformSpace } from '@/lib/canvas/math/transformAxes'
import { makeTransformMeshGeometryCmd } from '@/lib/editor/modifiers/commands'
import type { EditorStateReturn } from '@/app/hooks/useEditorState'
import type { UseCanvasDragReturn } from '../hooks/useCanvasDrag'
import type { SelectionRegion, SelectionMode } from '@/lib/selection/selectionGesture'
import { meshFaceSourceHint, type MeshSelectionSummary } from './meshEditSelection'

/** Mesh component selection and native geometry gesture adapter. Mode/banks
 * are transient, topology/document-owned; shared vertices transform once in the
 * existing tail Edit Mesh, one Undo per gesture. The old private-host Object
 * level remains admitted; normal Mesh UI now uses Vertex/Edge/Face. */
export function useMeshViewportEditing(options: {
  active: boolean; mode: MeshComponentMode | 'object'; layer: Layer | null; scene: ChronoScene; editor: EditorStateReturn
  timeMs: number; overrides?: OverrideMap; zoom: number; transformSpace: TransformSpace; toolMode?: string
  canvasRef: RefObject<HTMLCanvasElement>; drag: Pick<UseCanvasDragReturn, 'dragRef' | 'startDrag'>; modifierId: string | null
  warning(message: string): void
  onSelectionChange?(summary: MeshSelectionSummary | null): void
}) {
  const { layer, mode, editor } = options, mesh = layer?.mesh2d
  const active = options.active && layer?.type === 'mesh2d' && !!mesh && mode !== 'object'
  const matrix = useMemo(() => active && layer ? resolveLayerWorldMatrix(layer, options.scene, options.timeMs, options.overrides) : null,
    [active, layer, options.scene, options.timeMs, options.overrides])
  const hint = layer ? meshFaceSourceHint(layer) : undefined
  const model = useMemo(() => matrix && mesh ? new MeshComponentSelection(mesh.geometry, matrix, hint) : null, [matrix, mesh?.geometry, hint])
  const [bank, setBank] = useState<Record<MeshComponentMode, string[]>>({ point: [], edge: [], face: [] })
  useEffect(() => { setBank({ point: [], edge: [], face: [] }) }, [layer?.id, mesh?.geometry.topology.topologyHash, editor.getDocumentSignal(), options.active])
  const level = mode as MeshComponentMode, ids = active ? bank[level] : [], vertices = model?.vertices(level, ids) ?? []
  const select = (incoming: ReadonlySet<string>, policy: SelectionMode) => setBank(before => {
    const next = new Set(policy === 'replace' ? [] : before[level])
    for (const id of Array.from(incoming)) policy === 'subtract' ? next.delete(id) : next.add(id)
    return { ...before, [level]: Array.from(next) }
  })
  const clear = () => setBank(before => ({ ...before, [level]: [] }))
  const selectionKey = JSON.stringify([active, layer?.id, level, ids, model?.points.length, model?.edges.length, model?.faces.length])
  useEffect(() => {
    options.onSelectionChange?.(active && layer && model ? { layerId: layer.id, mode: level, selected: ids.length,
      vertices: model.points.length, edges: model.edges.length, faces: model.faces.length, quads: model.faces.filter(face => face.kind === 'quad').length } : null)
    // Stable value key avoids publishing a new report during position-only drag
    // frames or parent rerenders. Connectivity/mode/selection changes publish.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey, options.onSelectionChange])
  const selectAll = () => { if (model) select(new Set(level === 'point' ? model.points.map(p => p.id) : level === 'edge' ? model.edges.map(e => e.id) : model.faces.map(f => f.id)), 'replace') }
  const pointerDown = (x: number, y: number, event: React.PointerEvent): boolean => {
    if (!active || !model || !matrix || !layer || !options.modifierId) return false
    const hit = model.pick(level, { x, y }, 8 / options.zoom)
    if (!hit) return false
    event.preventDefault(); event.stopPropagation()
    const toggle = event.shiftKey || event.ctrlKey || event.metaKey
    if (toggle) { select(new Set([hit]), ids.includes(hit) ? 'subtract' : 'add'); return true }
    const chosen = ids.includes(hit) ? ids : [hit]
    if (!ids.includes(hit)) select(new Set(chosen), 'replace')
    if (!['select', 'move', 'rotate', 'scale', undefined].includes(options.toolMode) || editor.isTransactionActive() || options.drag.dragRef.current) return true
    try {
      const vertexIds = model.vertices(level, chosen), pivot = model.pivot(vertexIds)
      if (!pivot || Math.abs(matrix.determinant()) < 1e-9) return true
      const operation = options.toolMode === 'rotate' ? 'rotate' : options.toolMode === 'scale' ? 'scale' : 'move'
      const inverse = matrix.invert(), startLocal = inverse.applyToPoint({ x, y })
      if (operation !== 'move' && Math.hypot(startLocal.x - pivot.x, startLocal.y - pivot.y) < 1e-6) return true
      makeTransformMeshGeometryCmd(editor.getScene(), layer.id, options.modifierId,
        { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: pivot.x, pivotY: pivot.y }, vertexIds)
      editor.beginTransaction()
      options.drag.dragRef.current = { kind: 'meshGeometry', layerId: layer.id, originalLayer: layer, modifierId: options.modifierId,
        vertexIds, operation, pivot, startLocal, worldToLocal: inverse, axisFrame: transformAxisFrame(options.transformSpace, matrix),
        startClientX: event.clientX, startClientY: event.clientY }
      options.drag.startDrag(event)
    } catch (error) { options.warning(error instanceof Error ? error.message : String(error)) }
    return true
  }
  return { active, model, mode: level, ids, vertices, clear, select, selectAll, pointerDown,
    query: (region: SelectionRegion, containment: 'inside' | 'touching') => model?.query(level, region, containment) ?? new Set<string>() }
}
