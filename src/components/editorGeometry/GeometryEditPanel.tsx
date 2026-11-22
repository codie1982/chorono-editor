'use client'

import { useState, type ReactNode } from 'react'
import Mesh2DSourcePanel, { type Mesh2DSettingsSection } from '@/components/PropertiesPanel/Mesh2DSourcePanel'
import SchemaPanel from '@/components/PropertiesPanel/SchemaPanel'
import SplineModelingPanel, {
  SPLINE_MODELING_OPERATIONS,
  type SplineModelingOperation,
  type SplineModelingPanelProps,
} from '@/components/panels/SplineModelingPanel'
import type { Layer } from '@/lib/types'
import ConversionStackPanel from './ConversionStackPanel'
import { ModifierPicker } from './ModifierPicker'

const SPLINE_MODIFIER_HELP: Record<SplineModelingOperation, string> = {
  offset: 'Create a parallel copy of a contour.',
  outline: 'Turn a contour into a border shape.',
  chamfer: 'Cut selected corners with straight edges.',
  fillet: 'Round selected corners with curves.',
}
export interface GeometryEditPanelProps extends Omit<SplineModelingPanelProps, 'operation'> {
  /** Page-owned worker previews remain authoritative for native modifiers. */
  readonly splineModifierSettings?: Partial<Record<SplineModelingOperation, ReactNode>>
  readonly activeSplineModifier?: SplineModelingOperation
  readonly onSplineModifierSelect?: (operation: SplineModelingOperation | '') => void
  readonly selectedIds?: readonly string[]
  readonly conversionDisabled?: boolean
  readonly onLayerChange: (layer: Layer) => void
  /** Optional canvas point inspector with its timeline and numeric context. */
  readonly splineSourceSettings?: ReactNode
  /** Shared mode toggles stay above the modifier picker and long properties. */
  readonly splineModeControls?: ReactNode
  /** Creates a separate Mesh2D using the existing source-preserving command. */
  readonly onCreateMeshFromSpline?: () => void
}

/** Edit dock separates mode/selection properties, type-specific modifier
 * pickers and conversion history. Mode controls stay ahead of advanced tools;
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
    {!multiple && layer?.geometryConversion && <ConversionStackPanel
      key={`${layer.id}:${layer.type}:${layer.geometryConversion?.stages.length ?? 0}`} {...props} layer={layer} />}
    {!multiple && layer?.type === 'shape' && <p className="text-gray-400">Basic Shape parameters are in Properties. Select a Spline or 2D Mesh for geometry editing.</p>}
    {!supported && <p className="text-gray-400">Select a Spline or 2D Mesh to edit its geometry.</p>}
  </div>
}

/** Spline-only modifier choices never expose Mesh controls. The supplied native
 * inspector owns Point/Edge/Object selection and stays visible above the list. */
function SplineSettings({ layer, splineModeControls, splineSourceSettings, splineModifierSettings, activeSplineModifier, onSplineModifierSelect, ...props }: GeometryEditPanelProps & { layer: Layer }) {
  const [localModifier, setModifier] = useState<SplineModelingOperation | ''>('')
  const modifier = activeSplineModifier ?? localModifier
  const modifierControls = <section aria-label="Spline modifiers" className="space-y-2 border-t border-gray-700 pt-3">
      <ModifierPicker kind="Spline" selected={modifier} disabled={props.conversionDisabled || layer.locked || layer.frozen || !!layer.instanceOf}
        items={SPLINE_MODELING_OPERATIONS} onSelect={value => { if (value && value === modifier) return; setModifier(value); onSplineModifierSelect?.(value) }} />
      <p className="text-gray-400">{modifier ? SPLINE_MODIFIER_HELP[modifier] : 'Choose a modifier to open its settings and preview the result.'}</p>
      {modifier && (splineModifierSettings?.[modifier] ?? <SplineModelingPanel {...props} layer={layer} operation={modifier} />)}
    </section>
  return <>
    {splineModeControls ? <section className="space-y-2" aria-label="Spline editing mode"><h3 className="font-semibold">Edit mode</h3>{splineModeControls}</section> : splineSourceSettings}
    {modifierControls}
    {splineModeControls && splineSourceSettings}
    {!splineSourceSettings && <p className="text-gray-400">Choose Point, Edge or Object to edit this Spline in the viewport.</p>}
  </>
}

/** Mesh-only modifier list and separate source/texture/pin settings. Deformation
 * Clip is the currently supported Mesh modifier; appearance is not mislabeled
 * as a Spline modifier. Native mesh controls retain their command contracts. */
function MeshSettings({ layer, ...props }: GeometryEditPanelProps & { layer: Layer }) {
  const [selected, setSelected] = useState<Mesh2DSettingsSection>('source')
  const scene = props.getScene()
  return <section aria-label="Mesh editing" className="space-y-3">
    <ModifierPicker kind="Mesh" selected={selected === 'deformation' ? selected : ''} disabled={props.conversionDisabled || layer.locked || layer.frozen || !!layer.instanceOf}
      items={[{ id: 'deformation', label: 'Deformation Clip' }]} onSelect={value => setSelected(value || 'source')} />
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Mesh settings">
      {([{ id: 'source', label: 'Geometry' }, { id: 'texture', label: 'Texture' }, { id: 'pins', label: 'Pins' }] as const).map(item =>
        <button key={item.id} type="button" aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}
          className={`min-h-8 rounded border px-2 py-1.5 focus-visible:outline focus-visible:outline-orange-300 ${selected === item.id ? 'border-orange-400/70 bg-orange-500/10 text-orange-100' : 'border-gray-700 bg-gray-800'}`}>{item.label}</button>)}
    </div>
    {!(layer.geometryConversion && selected === 'source') && <Mesh2DSourcePanel key={selected} layer={layer} allLayers={scene.layers}
      allAssets={scene.assets} onLayerChange={props.onLayerChange} section={selected} />}
    {selected === 'source' && (layer.geometryConversion && layer.mesh2d ? <p className="text-gray-400">
      {layer.mesh2d.geometry.positions.length / 2} vertices · {layer.mesh2d.geometry.topology.triangleIndices.length / 3} triangles.
      Open Conversion history below to change the source or curve sampling.
    </p> : <SchemaPanel layer={layer} onLayerChange={props.onLayerChange} filterGroup={group => group.title === 'Geometry'} />)}
  </section>
}
