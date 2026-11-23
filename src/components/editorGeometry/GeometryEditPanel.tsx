'use client'

import { useState, type ReactNode } from 'react'
import Mesh2DSourcePanel, { type Mesh2DSettingsSection } from '@/components/PropertiesPanel/Mesh2DSourcePanel'
import SchemaPanel from '@/components/PropertiesPanel/SchemaPanel'
import type { SplineModelingPanelProps } from '@/components/panels/SplineModelingPanel'
import { geometryModifierRegistry, modifierOutputReadOnly } from '@/lib/modifiers'
import type { Layer } from '@/lib/types'
import { SplineSourceHistory } from './SplineSourceHistory'
import ModifierStackPanel from './ModifierStackPanel'
import type { GeometryEditMode } from './useGeometryEditMode'

export interface GeometryEditPanelProps extends Omit<SplineModelingPanelProps, 'operation'> {
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
    {!multiple && supported && layer.type !== 'shape' && props.editMode && <button type="button"
      disabled={!editing && (props.conversionDisabled || layer.locked || layer.hidden || layer.frozen || !!layer.instanceOf)}
      onClick={() => editing ? props.editMode!.exit() : props.editMode!.enter()}
      className="min-h-9 rounded border border-orange-400/60 bg-orange-500/10 px-3 py-1.5 text-orange-100 focus-visible:outline focus-visible:outline-orange-300 disabled:opacity-50">
      {editing ? 'Exit edit mode' : 'Enter edit mode'}
    </button>}
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
  return <section aria-label="Mesh editing" className="space-y-3">
    {editing && props.editMode && <div role="group" aria-label="Mesh selection mode" className="grid grid-cols-3 gap-1.5">
      {(['point', 'edge', 'object'] as const).map((mode, index) => <button type="button" key={mode}
        aria-label={`Mesh ${mode} mode`} aria-pressed={props.editMode!.active && props.editMode!.mode === mode} aria-keyshortcuts={String(index + 1)}
        onClick={() => props.editMode!.enter(mode)} className={`min-h-9 rounded border px-2 py-1.5 focus-visible:outline focus-visible:outline-orange-300 ${props.editMode!.mode === mode ? 'border-orange-400 bg-orange-500/20 text-orange-100' : 'border-gray-600 bg-gray-800'}`}>
        {mode[0].toUpperCase() + mode.slice(1)} <kbd className="ml-1 text-xs opacity-60">{index + 1}</kbd>
      </button>)}
    </div>}
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
