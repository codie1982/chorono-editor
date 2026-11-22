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

const MESH_SETTINGS = [
  { id: 'texture', label: 'Texture' },
  { id: 'deformation', label: 'Deformation Clip' },
  { id: 'pins', label: 'Pins' },
] as const
const SOURCE = { id: 'source', label: 'Source' } as const
type SettingsId = SplineModelingOperation | Mesh2DSettingsSection

export interface GeometryEditPanelProps extends Omit<SplineModelingPanelProps, 'operation'> {
  readonly onLayerChange: (layer: Layer) => void
  /** Optional canvas point inspector with its timeline and numeric context. */
  readonly splineSourceSettings?: ReactNode
  /** Creates a separate Mesh2D using the existing source-preserving command. */
  readonly onCreateMeshFromSpline?: () => void
}

/**
 * Dock content for one selected spline or Mesh2D. Scene data and undo remain
 * owned by the editor. Changing selection disposes the panel's local draft.
 */
export default function GeometryEditPanel(props: GeometryEditPanelProps) {
  const { layer } = props
  return (
    <div className="h-full min-h-0 overflow-hidden bg-gray-900 p-3 text-xs text-gray-200" data-panel="geometry-edit">
      {layer?.type === 'spline' && layer.spline ? (
        <GeometrySettings key={`spline:${layer.id}`} {...props} layer={layer} kind="spline" />
      ) : layer?.type === 'mesh2d' && layer.mesh2d ? (
        <GeometrySettings key={`mesh2d:${layer.id}`} {...props} layer={layer} kind="mesh2d" />
      ) : (
        <p className="text-gray-400">Select a spline or Mesh2D layer to edit its geometry.</p>
      )}
    </div>
  )
}

interface GeometrySettingsProps extends GeometryEditPanelProps {
  layer: Layer
  kind: 'spline' | 'mesh2d'
}

/** Shows one source or operation's controls at a time. The upper picker and
 * lower settings scroll independently, so long editors cannot hide the list. */
function GeometrySettings({ layer, kind, splineSourceSettings, onCreateMeshFromSpline, ...props }: GeometrySettingsProps) {
  const [selected, setSelected] = useState<SettingsId>('source')
  const isSpline = kind === 'spline'
  const items = isSpline ? SPLINE_MODELING_OPERATIONS : MESH_SETTINGS
  const listLabel = isSpline ? 'Modeling operations' : 'Mesh settings'
  const scene = isSpline ? null : props.getScene()

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="shrink-0 truncate font-semibold" title={layer.name}>{layer.name}</div>
      <div className="grid max-h-[45%] shrink-0 gap-1.5 overflow-auto">
        {[SOURCE, ...items].map((item, index) => (
          <div key={item.id} className="grid gap-1.5">
            {index === 1 && <div className="mt-1 text-gray-400">{listLabel}</div>}
            <button type="button" aria-pressed={selected === item.id}
              onClick={() => setSelected(item.id)}
              className={`min-h-8 rounded border px-2.5 py-1.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 ${selected === item.id
                ? 'border-blue-600 bg-blue-950 text-blue-100'
                : 'border-gray-700 bg-gray-800 hover:bg-gray-700'}`}>
              {item.label}
            </button>
          </div>
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto border-t border-gray-700 pt-3">
        {scene && <Mesh2DSourcePanel key={selected} layer={layer} allLayers={scene.layers}
          allAssets={scene.assets} onLayerChange={props.onLayerChange} section={selected as Mesh2DSettingsSection} />}
        {scene && selected === 'source' && (
          <SchemaPanel layer={layer} onLayerChange={props.onLayerChange} filterGroup={group => group.title === 'Geometry'} />
        )}
        {isSpline && selected === 'source' && (
          <>
            {onCreateMeshFromSpline && <button type="button" onClick={onCreateMeshFromSpline}
              className="min-h-9 w-full rounded border border-cyan-700 px-3 py-2 text-left text-cyan-200 hover:bg-cyan-900/30">
              Create Mesh2D from closed spline
            </button>}
            {splineSourceSettings ?? <p className="text-gray-400">Select a spline point on the canvas to edit the source path.</p>}
          </>
        )}
        {isSpline && selected !== 'source' && (
          <SplineModelingPanel {...props} layer={layer} operation={selected as SplineModelingOperation} />
        )}
      </div>
    </div>
  )
}
