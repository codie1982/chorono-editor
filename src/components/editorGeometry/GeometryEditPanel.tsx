'use client'

import { useMemo, useState, type ReactNode } from 'react'
import Mesh2DSourcePanel, { type Mesh2DSettingsSection } from '@/components/PropertiesPanel/Mesh2DSourcePanel'
import SchemaPanel from '@/components/PropertiesPanel/SchemaPanel'
import type { SplineModelingPanelProps } from '@/components/panels/SplineModelingPanel'
import { geometryModifierRegistry, modifierOutputReadOnly } from '@/lib/modifiers'
import type { Layer } from '@/lib/types'
import { SplineSourceHistory } from './SplineSourceHistory'
import ModifierStackPanel from './ModifierStackPanel'
import type { GeometryEditMode } from './useGeometryEditMode'
import { meshTopologyActions } from '../canvas/mesh2d/topologyActions'
import { ComponentLayoutControls,type EditPivotProps } from './ComponentLayoutControls'
import { MeshComponentSelection } from '@/lib/geometry/mesh2d/selection/MeshComponentSelection'
import { componentLayout } from '@/lib/geometry/componentLayout'
import { makeMeshLayoutCmd } from '@/lib/editor/modifiers/commands'
import { Matrix2D } from '@/lib/geometry/Matrix2D'
import { resolveLayerWorldMatrix } from '@/lib/geometry/resolveLayerWorldMatrix'
import type { OverrideMap } from '@/lib/evaluator'
import { MeshFaceTopology } from '@/lib/geometry/mesh2d/selection/MeshFaceTopology'
import { MESH_EDIT_LEVELS, meshFaceSourceHint, type MeshSelectionSummary } from '../canvas/mesh2d/meshEditSelection'

export interface GeometryEditPanelProps extends Omit<SplineModelingPanelProps, 'operation'>, EditPivotProps {
  componentFrame?: 'local'|'scene'
  editTime?:number
  editOverrides?:OverrideMap
  readonly selectedPointIds?: readonly string[]
  readonly selectedContourIds?: readonly string[]
  readonly selectedObjectIds?: readonly string[]
  readonly selectedIds?: readonly string[]
  readonly conversionDisabled?: boolean
  readonly onLayerChange: (layer: Layer) => void
  /** Optional canvas point inspector with its timeline and numeric context. */
  readonly splineSourceSettings?: ReactNode
  /** Shared mode toggles stay above the modifier picker and long properties. */
  readonly splineModeControls?: ReactNode
  /** Active context-menu tool preview; separate from persisted modifiers. */
  readonly splineToolPreview?: ReactNode
  /** Host-owned transient source-edit session; modifiers remain available outside it. */
  readonly editMode?: GeometryEditMode
  readonly meshSelection?: MeshSelectionSummary | null
  /** Restore sub-object focus after Bake within an already active Edit session. */
  readonly onSplineSourceBaked?: (layerId: string) => void
}

/** Edit dock exposes the selected layer's ordered modifiers independently of
 * the transient source-edit session. Only active sessions mount native geometry
 * tools; toggling Edit retains modifier selection/drafts. Scene/history remain
 * editor-owned, and Bake outside Edit never starts a sub-object session. */
export default function GeometryEditPanel(props: GeometryEditPanelProps) {
  const { layer } = props
  const multiple = (props.selectedIds?.length ?? 1) > 1
  const supported = layer && ['shape', 'spline', 'mesh2d'].includes(layer.type)
  const editing = !props.editMode || props.editMode.active
  return <div className="h-full min-h-0 space-y-4 overflow-auto bg-gray-900 p-3 text-xs text-gray-200" data-panel="geometry-edit">
    {supported && <header className="flex items-center justify-between gap-2">
      <h2 className="truncate font-semibold" title={layer.name}>{multiple ? `${props.selectedIds!.length} objects selected` : layer.name}</h2>
      {!multiple && <span className="shrink-0 text-gray-400">{layer.type === 'shape' ? 'Basic Shape' : layer.type === 'spline' ? 'Spline' : '2D Mesh'}</span>}
    </header>}
    {!multiple && layer?.type === 'spline' && layer.spline && <SplineSettings key={layer.id} {...props} layer={layer}
      onSplineSourceBaked={editing ? props.onSplineSourceBaked : undefined} />}
    {!multiple && layer?.type === 'mesh2d' && layer.mesh2d && <MeshSettings key={layer.id} {...props} layer={layer} />}
    {!multiple && layer?.type === 'shape' && layer.modifierStack && <ModifierStackPanel {...props} layer={layer} />}
    {!multiple && layer?.type === 'shape' && <p className="text-gray-400">Basic Shape parameters are in Properties. Select a Spline or 2D Mesh for geometry editing.</p>}
    {!supported && <p className="text-gray-400">Select a Spline or 2D Mesh to edit its geometry.</p>}
  </div>
}

/** Persistent Spline stack/history with session-only native source controls. */
function SplineSettings({ layer, splineModeControls, splineSourceSettings, splineToolPreview, ...props }: GeometryEditPanelProps & { layer: Layer }) {
  const editing = !props.editMode || props.editMode.active
  const legacyOnly = !!layer.modifierStack?.modifiers.some(record => geometryModifierRegistry.get(record.type).descriptor.legacySplineTool)
    && !layer.modifierStack.modifiers.some(record => { const descriptor = geometryModifierRegistry.get(record.type).descriptor; return descriptor.category === 'spline' && descriptor.addable && !descriptor.legacySplineTool })
  return <>
    {editing && <>
      {splineModeControls ? <section className="space-y-2" aria-label="Spline editing mode"><h3 className="font-semibold">Edit mode</h3>{splineModeControls}</section> : splineSourceSettings}
      {splineModeControls && splineSourceSettings}
      {!splineSourceSettings && splineToolPreview}
    </>}
    {!legacyOnly && <ModifierStackPanel {...props} layer={layer} />}
    <SplineSourceHistory {...props} layer={layer} showStack={legacyOnly} />
    {editing && !splineSourceSettings && !modifierOutputReadOnly(layer) && <p className="text-gray-400">Choose Point, Edge or Object to edit this Spline in the viewport.</p>}
  </>
}

/** Mesh-only modifier list and separate source/texture/pin settings. Modifier
 * registration owns the available algorithms; native source controls retain
 * their command contracts and are mounted only during an Edit session. */
function MeshSettings({ layer, ...props }: GeometryEditPanelProps & { layer: Layer }) {
  const [selected, setSelected] = useState<Mesh2DSettingsSection>('source')
  const editing = !props.editMode || props.editMode.active
  const scene = props.getScene()
  const mesh = layer.mesh2d!, hint = meshFaceSourceHint(layer)
  const faces = useMemo(() => new MeshFaceTopology(mesh.geometry, hint).faces, [mesh.geometry.topology, hint])
  const quads = faces.filter(face => face.kind === 'quad').length
  const selection = props.meshSelection?.layerId === layer.id ? props.meshSelection : null
  const [warning, setWarning] = useState('')
  const [percent, setPercent] = useState(50)
  const actions = useMemo(
    () =>
      editing && selection
        ? meshTopologyActions(layer, selection, props.getScene, props.dispatchCommand, setWarning, percent / 100)
        : [],
    [editing, scene, layer, selection, props.getScene, props.dispatchCommand, percent],
  )
  const localModel = useMemo(
    () => (selection?.ids?.length ? new MeshComponentSelection(mesh.geometry, Matrix2D.identity(), hint) : null),
    [mesh.geometry, hint, selection],
  )
  const groups = useMemo(() => {
    if (!localModel || !selection?.ids) return []
    const wanted = new Set(selection.ids)
    if (selection.mode === 'point') return localModel.points.filter((p) => wanted.has(p.id)).map((p) => [p.id])
    const vertices =
      selection.mode === 'edge'
        ? localModel.edges.filter((e) => wanted.has(e.id)).map((e) => [e.a, e.b])
        : localModel.faces.filter((f) => wanted.has(f.id)).map((f) => f.vertices)
    return vertices.map((group) => group.map((i) => localModel.points[i].id))
  }, [selection, localModel])
  const center = localModel?.pivot(groups.flat())
  const frame =
    props.componentFrame === 'scene'
      ? resolveLayerWorldMatrix(layer, scene, props.editTime ?? 0, props.editOverrides)
      : Matrix2D.identity()
  const disabled = !!(props.conversionDisabled || layer.locked || layer.hidden || layer.frozen || layer.instanceOf)
  return <section aria-label="Mesh editing" className="space-y-3">
    {props.editMode && <div role="group" aria-label="Mesh selection mode" className="grid grid-cols-3 gap-1.5">
      {MESH_EDIT_LEVELS.map(({ mode, label, key }) => <button type="button" key={mode} disabled={disabled}
        aria-label={`Mesh ${mode} mode`} aria-pressed={editing && props.editMode!.mode === mode} aria-keyshortcuts={key}
        onClick={() => props.editMode!.enter(mode)} className={`min-h-11 rounded border px-2 py-1.5 focus-visible:outline focus-visible:outline-orange-300 disabled:opacity-40 ${editing && props.editMode!.mode === mode ? 'border-orange-400 bg-orange-500/20 text-orange-100' : 'border-gray-600 bg-gray-800'}`}>
        {label} <kbd className="ml-1 text-xs opacity-60">{key}</kbd>
      </button>)}
    </div>}
    <div className="space-y-1 border-b border-gray-700 pb-3 text-gray-300" role="status" aria-label="Mesh component summary">
      <p>{mesh.geometry.positions.length / 2} vertices · {faces.length} faces ({quads} quads · {faces.length - quads} triangles)</p>
      <p>{editing ? `${props.editMode?.mode === 'point' ? 'Vertices' : props.editMode?.mode === 'edge' ? 'Edges' : 'Faces'} selected: ${selection?.selected ?? 0} · Move / Rotate / Scale · Ctrl/Cmd+A selects all` : 'Choose Vertex, Edge or Face to edit geometry. Modifiers are available below.'}</p>
      <p className="text-gray-400">Component transforms accumulate in Edit Mesh. Smooth and Subdivision process the whole mesh.</p>
    </div>
    {editing && center && localModel && selection?.modifierId && <ComponentLayoutControls count={groups.length}
      frame={frame} center={center} pivot={props.pivot} setPivot={props.setPivot} disabled={disabled} apply={action=>{
        try {
          const deltas=componentLayout(groups,new Map(localModel.points.map(p=>[p.id,p])),frame,action)
          const cmd=makeMeshLayoutCmd(props.getScene(),layer.id,selection.modifierId!,deltas)
          if(cmd)props.dispatchCommand(cmd)
          setWarning('')
        } catch(error){setWarning(error instanceof Error?error.message:String(error))}
      }}/>}
    {warning && <p role="alert">{warning}</p>}
    {actions.length > 0 && <section aria-label="Mesh topology tools" className="space-y-2">
      {selection?.mode === 'edge' && <label>Split position (%) <input type="number" min="0.01" max="99.99" step="any" value={percent}
        className="w-16 rounded bg-gray-800 p-1" onChange={event=>setPercent(event.target.valueAsNumber || 0)} /></label>}
      <div className="flex flex-wrap gap-1">{actions.map(action => <button key={action.label} type="button"
        disabled={action.disabled} title={action.disabledReason} onClick={action.onSelect}
        className="rounded border border-gray-600 px-2 py-1 disabled:opacity-45">{action.label}</button>)}</div>
    </section>}
    <ModifierStackPanel {...props} layer={layer} />
    {editing && <>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Mesh settings">
        {([{ id: 'source', label: 'Geometry' }, { id: 'texture', label: 'Texture' }, { id: 'pins', label: 'Pins' }] as const).map(item =>
          <button key={item.id} type="button" aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}
            className={`min-h-8 rounded border px-2 py-1.5 focus-visible:outline focus-visible:outline-orange-300 ${selected === item.id ? 'border-orange-400/70 bg-orange-500/10 text-orange-100' : 'border-gray-700 bg-gray-800'}`}>{item.label}</button>)}
      </div>
      {!((layer.geometryConversion || layer.modifierStack) && selected === 'source') && <Mesh2DSourcePanel key={selected} layer={layer} allLayers={scene.layers}
        allAssets={scene.assets} onLayerChange={props.onLayerChange} section={selected} />}
      {selected === 'source' && ((layer.geometryConversion || layer.modifierStack) && layer.mesh2d ? <p className="text-gray-400">
        {layer.mesh2d.geometry.positions.length / 2} vertices · {layer.mesh2d.geometry.topology.triangleIndices.length / 3} triangles.
        Select a modifier or Source above to change the geometry.
      </p> : <SchemaPanel layer={layer} onLayerChange={props.onLayerChange} filterGroup={group => group.title === 'Geometry'} />)}
    </>}
  </section>
}
