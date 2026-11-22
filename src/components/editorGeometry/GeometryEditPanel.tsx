'use client'

import { useState, type ReactNode } from 'react'
import Mesh2DSourcePanel, { type Mesh2DSettingsSection } from '@/components/PropertiesPanel/Mesh2DSourcePanel'
import SchemaPanel from '@/components/PropertiesPanel/SchemaPanel'
import type { SplineModelingPanelProps } from '@/components/panels/SplineModelingPanel'
import { modifierOutputReadOnly } from '@/lib/modifiers'
import type { Layer } from '@/lib/types'
import ModifierStackPanel from './ModifierStackPanel'

export interface GeometryEditPanelProps extends Omit<SplineModelingPanelProps, 'operation'> {
  readonly selectedPointIds?: readonly string[]
  readonly selectedContourIds?: readonly string[]
  readonly selectedIds?: readonly string[]
  readonly conversionDisabled?: boolean
  readonly onLayerChange: (layer: Layer) => void
  /** Optional canvas point inspector with its timeline and numeric context. */
  readonly splineSourceSettings?: ReactNode
  /** Shared mode toggles stay above the modifier picker and long properties. */
  readonly splineModeControls?: ReactNode
  /** Active context-menu tool preview; separate from persisted modifiers. */
  readonly splineToolPreview?: ReactNode
}

/** Edit dock separates mode/selection properties and a persistent ordered stack. Mode controls stay ahead of advanced tools;
 * only the selected modifier mounts its settings. Scene/history remain editor-owned. */
export default function GeometryEditPanel(props: GeometryEditPanelProps) {
  const { layer } = props
  const multiple = (props.selectedIds?.length ?? 1) > 1
  const supported = layer && ['shape', 'spline', 'mesh2d'].includes(layer.type)
  return <div className="h-full min-h-0 space-y-4 overflow-auto bg-gray-900 p-3 text-xs text-gray-200" data-panel="geometry-edit">
    {supported && <header className="flex items-center justify-between gap-2">
      <h2 className="truncate font-semibold" title={layer.name}>{multiple ? `${props.selectedIds!.length} objects selected` : layer.name}</h2>
      {!multiple && <span className="shrink-0 text-gray-400">{layer.type === 'shape' ? 'Basic Shape' : layer.type === 'spline' ? 'Spline' : '2D Mesh'}</span>}
    </header>}
    {!multiple && layer?.type === 'spline' && layer.spline && <SplineSettings key={layer.id} {...props} layer={layer} />}
    {!multiple && layer?.type === 'mesh2d' && layer.mesh2d && <MeshSettings key={layer.id} {...props} layer={layer} />}
    {!multiple && layer?.type === 'shape' && layer.modifierStack && <ModifierStackPanel {...props} layer={layer} />}
    {!multiple && layer?.type === 'shape' && <p className="text-gray-400">Basic Shape parameters are in Properties. Select a Spline or 2D Mesh for geometry editing.</p>}
    {!supported && <p className="text-gray-400">Select a Spline or 2D Mesh to edit its geometry.</p>}
  </div>
}

/** Mode controls and point editing remain separate from the persistent stack. */
function SplineSettings({ layer, splineModeControls, splineSourceSettings, splineToolPreview, ...props }: GeometryEditPanelProps & { layer: Layer }) {
  return <>
    {splineModeControls ? <section className="space-y-2" aria-label="Spline editing mode"><h3 className="font-semibold">Edit mode</h3>{splineModeControls}</section> : splineSourceSettings}
    {splineToolPreview}
    <ModifierStackPanel {...props} layer={layer} />
    {splineModeControls && splineSourceSettings}
    {!splineSourceSettings && !modifierOutputReadOnly(layer) && <p className="text-gray-400">Choose Point, Edge or Object to edit this Spline in the viewport.</p>}
  </>
}

/** Mesh-only modifier list and separate source/texture/pin settings. Deformation
 * Clip is the currently supported Mesh modifier; appearance is not mislabeled
 * as a Spline modifier. Native mesh controls retain their command contracts. */
function MeshSettings({ layer, ...props }: GeometryEditPanelProps & { layer: Layer }) {
  const [selected, setSelected] = useState<Mesh2DSettingsSection>('source')
  const scene = props.getScene()
  return <section aria-label="Mesh editing" className="space-y-3">
    <ModifierStackPanel {...props} layer={layer} />
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
  </section>
}
