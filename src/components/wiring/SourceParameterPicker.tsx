'use client'
// ── SourceParameterPicker (BL-05) ─────────────────────────────────────────────
// Hierarchical tree picker for choosing a ParameterRef — used by the
// WireParameterModal for both source and target sides. Tree structure:
//
//   ▼ Scene Parameters
//      • slider1 (number)
//   ▼ Layers
//     ▼ Rectangle 1
//        • opacity
//        • transform.rotationDeg
//        • ...
//     ▶ Circle 1 (collapsed)
//
// Free-text search across labels filters the tree in real time; matched
// parents auto-expand so the hit is visible. Items whose valueType is
// incompatible with `expectedType` render disabled.

import { useMemo, useState } from 'react'
import type { ChronoScene, ParameterRef, ParameterValueType } from '@/lib/types'
import {
  listLayerParameterRefs, listSceneParameterRefs,
  formatParameterRef, paramRefKey, areTypesCompatible,
} from '@/lib/wiring/helpers'

interface Props {
  scene: ChronoScene
  value: ParameterRef | null
  onChange: (ref: ParameterRef) => void
  /** Hide one specific ref — used by the modal to prevent self-wiring. */
  excludeRef?: ParameterRef | null
  /** Items not type-compatible with `expectedType` are greyed-out but still
   *  visible (helps users learn what's available). When omitted, no greying. */
  expectedType?: ParameterValueType
  /** Accent color (matches Source vs. Target column tinting in the modal). */
  accentClass?: string
}

export default function SourceParameterPicker({
  scene, value, onChange, excludeRef, expectedType,
  accentClass = 'text-sky-300',
}: Props) {
  const [search, setSearch] = useState('')
  // Layers collapsed by default — saves vertical space for big scenes.
  const [collapsedLayers, setCollapsedLayers] = useState<Set<string>>(() => new Set(scene.layers.map(layer => layer.id)))
  const [paramsCollapsed, setParamsCollapsed] = useState(false)

  const excludeKey = excludeRef ? paramRefKey(excludeRef) : null

  // Filter the entire tree against the search query (case-insensitive on
  // either the layer name or the property path).
  const q = search.trim().toLowerCase()
  const isMatch = (label: string) => q === '' || label.toLowerCase().includes(q)

  // ── Scene parameters ──────────────────────────────────────────────────
  const sceneParamRefs = useMemo(() => listSceneParameterRefs(scene), [scene])
  const filteredParams = sceneParamRefs.filter((ref) => {
    const p = scene.parameters.find((pp) => pp.id === ref.propertyPath)
    return isMatch(p?.name ?? ref.propertyPath)
  })

  // ── Layer properties ──────────────────────────────────────────────────
  // Pre-build a list of (layer, refs) tuples and filter; track which layers
  // have *any* match so collapsed-expanded state can be auto-overridden.
  const layerSections = useMemo(() => scene.layers.map((layer) => {
    const refs = listLayerParameterRefs(layer)
    const filtered = refs.filter((r) => isMatch(layer.name) || isMatch(r.propertyPath))
    return { layer, refs: filtered, totalRefs: refs.length }
  }).filter((s) => s.refs.length > 0), [scene.layers, q])

  // When searching, auto-expand any layer with matches so hits are visible.
  const forceExpanded = q !== ''

  function toggleLayer(layerId: string) {
    setCollapsedLayers((prev) => {
      const next = new Set(prev)
      if (next.has(layerId)) next.delete(layerId)
      else                   next.add(layerId)
      return next
    })
  }

  return (
    <div className="border border-gray-700 rounded bg-gray-950 flex flex-col max-h-[260px]">
      {/* Search */}
      <div className="border-b border-gray-800 px-2 py-1.5">
        <input
          type="text"
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Search parameters & properties…"
          className="w-full bg-transparent text-[11px] text-gray-100 outline-none placeholder-gray-600"
        />
      </div>

      {/* Tree */}
      <div className="overflow-y-auto flex-1">
        {/* Scene parameters */}
        {sceneParamRefs.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setParamsCollapsed((c) => !c)}
              className="w-full text-left px-2 py-1 text-[10px] uppercase tracking-wider text-gray-500 hover:text-gray-300 flex items-center gap-1"
            >
              <span className="text-gray-600 w-3 inline-block">
                {paramsCollapsed && !forceExpanded ? '▶' : '▼'}
              </span>
              Scene Parameters
            </button>
            {(!paramsCollapsed || forceExpanded) && filteredParams.map((ref) => {
              const p = scene.parameters.find((pp) => pp.id === ref.propertyPath)
              const label = p?.name ?? ref.propertyPath
              return (
                <ItemRow
                  key={paramRefKey(ref)}
                  ref_={ref}
                  label={label}
                  hint={`(${ref.valueType})`}
                  isSelected={value && paramRefKey(value) === paramRefKey(ref)}
                  isExcluded={excludeKey != null && excludeKey === paramRefKey(ref)}
                  isCompatible={!expectedType || areTypesCompatible(ref.valueType, expectedType)}
                  onPick={onChange}
                  accentClass={accentClass}
                />
              )
            })}
          </div>
        )}

        {/* Layers */}
        {layerSections.length > 0 && (
          <div>
            <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-gray-500 border-t border-gray-800">
              Layers
            </div>
            {layerSections.map(({ layer, refs }) => {
              const collapsed = collapsedLayers.has(layer.id) && !forceExpanded
              return (
                <div key={layer.id}>
                  <button
                    type="button"
                    onClick={() => toggleLayer(layer.id)}
                    className="w-full text-left px-2 py-0.5 text-[11px] text-gray-300 hover:bg-gray-800 flex items-center gap-1"
                  >
                    <span className="text-gray-600 w-3 inline-block">{collapsed ? '▶' : '▼'}</span>
                    <span className="truncate">{layer.name}</span>
                    <span className="ml-auto text-[9px] text-gray-600">{refs.length}</span>
                  </button>
                  {!collapsed && refs.map((ref) => (
                    <ItemRow
                      key={paramRefKey(ref)}
                      ref_={ref}
                      label={ref.propertyPath}
                      hint={`(${ref.valueType})`}
                      isSelected={value && paramRefKey(value) === paramRefKey(ref)}
                      isExcluded={excludeKey != null && excludeKey === paramRefKey(ref)}
                      isCompatible={!expectedType || areTypesCompatible(ref.valueType, expectedType)}
                      onPick={onChange}
                      indent
                      accentClass={accentClass}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        )}

        {sceneParamRefs.length === 0 && layerSections.length === 0 && (
          <div className="text-[11px] text-gray-600 text-center py-6 italic">
            {q ? `No matches for "${q}"` : 'No parameters or layers'}
          </div>
        )}
      </div>

      {/* Selection display */}
      {value && (
        <div className="border-t border-gray-800 px-2 py-1.5 text-[10px] flex items-center gap-2">
          <span className="text-gray-500">picked:</span>
          <span className={`font-mono ${accentClass}`}>{formatParameterRef(value, scene)}</span>
        </div>
      )}
    </div>
  )
}

function ItemRow({
  ref_, label, hint, isSelected, isExcluded, isCompatible,
  onPick, indent = false, accentClass,
}: {
  ref_: ParameterRef
  label: string
  hint: string
  isSelected: boolean | null
  isExcluded: boolean
  isCompatible: boolean
  onPick: (ref: ParameterRef) => void
  indent?: boolean
  accentClass: string
}) {
  const disabled = isExcluded || !isCompatible
  const baseColor = disabled ? 'text-gray-600' : (isSelected ? accentClass : 'text-gray-200')
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPick(ref_)}
      title={
        isExcluded ? "Can't wire to the same property (self-wire)" :
        !isCompatible ? `Type mismatch (${ref_.valueType})` :
        undefined
      }
      className={`w-full text-left px-2 py-0.5 text-[11px] hover:bg-gray-800 flex items-center gap-1 ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      } ${isSelected ? 'bg-sky-900/40' : ''}`}
      style={indent ? { paddingLeft: 28 } : undefined}
    >
      <span className={baseColor}>
        {isSelected && '● '}{label}
      </span>
      <span className="text-[9px] text-gray-600 ml-auto">{hint}</span>
    </button>
  )
}
