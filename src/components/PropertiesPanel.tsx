'use client'
import { useEffect, useRef, useState } from 'react'
import type {
  Layer, Composition,
  PathStrokeData, PathShapeType, PathTrimMode, StrokeCap,
  SceneParameter, PathAnchor,
  ChronoScene, ParameterWire, ParameterRef,
  FontWeight, FontStyle,
} from '@/lib/types'
import {
  togglePathClosed, reversePath,
} from '@/lib/path/pathOps'
import SchemaPanel from '@/components/PropertiesPanel/SchemaPanel'
import ParamBindButton from '@/components/PropertiesPanel/ParamBindButton'
import ScrubInput  from '@/components/inputs/ScrubInput'
import ColorInput  from '@/components/inputs/ColorInput'
import GradientInput from '@/components/inputs/GradientInput'
import { findWireForProperty, formatParameterRef } from '@/lib/wiring/helpers'
import { makeBakeMotionBlurCmd, makeUnbakeMotionBlurCmd } from '@/lib/editor/commands-motionblur'
import { DEFAULT_MOTION_BLUR } from '@/lib/defaults'
import { syncTextLayerSize } from '@/lib/text/measureText'

// ── Tab definitions ──────────────────────────────────────────────────────────
type PropTab = 'properties' | 'effects' | 'motion' | 'interact'

const TABS: Array<{ id: PropTab; label: string; icon: string }> = [
  { id: 'properties', label: 'Properties', icon: '🎨' },
  { id: 'effects',    label: 'Effects',    icon: '✨' },
  { id: 'motion',     label: 'Motion',     icon: '🎬' },
  { id: 'interact',   label: 'Interact',   icon: '🖱' },
]

// Canvas composite operations the user typically picks from for blending.
const BLEND_MODES: Array<[GlobalCompositeOperation, string]> = [
  ['source-over', 'Normal'],
  ['multiply',    'Multiply'],
  ['screen',      'Screen'],
  ['overlay',     'Overlay'],
  ['darken',      'Darken'],
  ['lighten',     'Lighten'],
  ['color-dodge', 'Color Dodge'],
  ['color-burn',  'Color Burn'],
  ['hard-light',  'Hard Light'],
  ['soft-light',  'Soft Light'],
  ['difference',  'Difference'],
  ['exclusion',   'Exclusion'],
  ['hue',         'Hue'],
  ['saturation',  'Saturation'],
  ['color',       'Color'],
  ['luminosity',  'Luminosity'],
]

interface Props {
  layer: Layer | null
  composition: Composition
  onLayerChange: (layer: Layer) => void
  onCompositionChange: (comp: Composition) => void
  /** Available scene parameters for property binding popovers. */
  parameters?: SceneParameter[]
  /** All scene layers — needed for Mask picker + Path Motion picker. */
  allLayers?: Layer[]
  /** Scene timelines — exposed for the Drag scrubs-timeline picker. */
  allTimelines?: Array<{ id: string; durationMs: number }>
  /** BL-17 Faz 1 — Convert shape layer to editable BezierPath. Button is
   *  hidden when callback isn't wired (eg. text/image/group selected). */
  onConvertToSpline?: () => void
  /** BL-05 — Full scene reference for wire lookups (sources / labels). */
  scene?: ChronoScene
  /** Dispatch an EditorCommand (undo-safe). Used by motion blur bake buttons. */
  dispatchCommand?: (cmd: import('@/lib/editor/commands-keyframe').EditorCommand) => void
  /** BL-05 — Currently-defined parameter wires (scene.parameterWires). */
  parameterWires?: ParameterWire[]
  /** BL-05 — Open WireParameterModal pre-filled with a new wire targeting `target`. */
  onRequestNewWire?: (target: ParameterRef) => void
  /** BL-05 — Open WireParameterModal in edit mode for an existing wire. */
  onEditWire?: (wire: ParameterWire) => void
}

// ── BL-05 + BL-69: Wireable + paramBindable field wrapper ─────────────────
// Renders a property input with up to two binding affordances next to its
// label:
//   🔗 (BL-05) — opens the wire editor for expression-based mappings
//   📎 (BL-69) — opens a parameter picker for direct paramBindings
// They are independent features that can coexist on the same property.
// Pill priority when both are active: wire wins (it overrides paramBinding
// at runtime via mergeOverrides ordering), so the wire pill is shown.

function WireableField({
  label, layer, propertyPath, valueType = 'number',
  scene, parameterWires, onRequestNewWire, onEditWire,
  parameters, acceptedTypes, onBindParam,
  children,
}: {
  label: string
  layer: Layer | null
  propertyPath: string
  valueType?: 'number' | 'boolean' | 'string' | 'color' | 'vec2'
  scene?: ChronoScene
  parameterWires?: ParameterWire[]
  onRequestNewWire?: (target: ParameterRef) => void
  onEditWire?: (wire: ParameterWire) => void
  parameters?: SceneParameter[]
  acceptedTypes?: import('@/lib/types').SceneParameterType[]
  onBindParam?: (paramId: string | null) => void
  children: React.ReactNode
}) {
  const wire = layer ? findWireForProperty(parameterWires, layer.id, propertyPath) : null
  const canWire = !!layer && (!!onRequestNewWire || !!onEditWire)

  const boundParamId = layer?.paramBindings?.[propertyPath]
  const boundParam = boundParamId && parameters
    ? parameters.find((p) => p.id === boundParamId)
    : undefined
  const canParam = !!layer && !!onBindParam && !!acceptedTypes && !!parameters

  const [paramOpen, setParamOpen] = useState(false)
  const paramPopRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!paramOpen) return
    function onDown(e: MouseEvent) {
      if (paramPopRef.current && !paramPopRef.current.contains(e.target as Node)) setParamOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setParamOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [paramOpen])

  function handleWireClick() {
    if (!layer) return
    if (wire && onEditWire) { onEditWire(wire); return }
    if (!wire && onRequestNewWire) {
      onRequestNewWire({ layerId: layer.id, propertyPath, valueType })
    }
  }

  const compatible = parameters && acceptedTypes
    ? parameters.filter((p) => acceptedTypes.includes(p.type))
    : []

  return (
    // Intentionally a <div>, not a <label> — the popover lives inside this
    // wrapper, and a <label> would re-focus the wrapped input whenever a
    // popover item is clicked.
    <div className="flex flex-col gap-0.5 relative">
      <span className="text-[10px] text-gray-500 uppercase tracking-wide flex items-center gap-1">
        <span className="flex-1">{label}</span>
        {canWire && (
          <button
            type="button"
            onClick={handleWireClick}
            title={wire
              ? `Driven by ${scene ? formatParameterRef(wire.source, scene) : 'wire'} — click to edit`
              : 'Wire this property to a source via expression'}
            className={`text-[10px] leading-none w-4 h-4 flex items-center justify-center rounded transition-colors ${
              wire
                ? 'text-sky-300 bg-sky-900/50 hover:bg-sky-800/70'
                : 'text-gray-600 hover:text-sky-300 hover:bg-gray-800'
            }`}
          >
            🔗
          </button>
        )}
        {canParam && (
          <button
            type="button"
            onClick={() => setParamOpen((v) => !v)}
            title={boundParam
              ? `Bound to ${boundParam.name} — click to change or unbind`
              : 'Bind this property to a parameter'}
            className={`text-[10px] leading-none w-4 h-4 flex items-center justify-center rounded transition-colors ${
              boundParam
                ? 'text-amber-300 bg-amber-900/50 hover:bg-amber-800/70'
                : 'text-gray-600 hover:text-amber-300 hover:bg-gray-800'
            }`}
          >
            📎
          </button>
        )}
      </span>

      {wire ? (
        <button
          type="button"
          onClick={handleWireClick}
          className="text-left bg-sky-900/20 border border-sky-800/40 rounded px-2 py-1 text-[11px] text-sky-200 font-mono truncate hover:bg-sky-900/40"
          title="Click to edit this wire"
        >
          Driven by {scene ? formatParameterRef(wire.source, scene) : 'wire'}
        </button>
      ) : boundParam ? (
        <button
          type="button"
          onClick={() => setParamOpen((v) => !v)}
          className="text-left bg-amber-900/20 border border-amber-800/40 rounded px-2 py-1 text-[11px] text-amber-200 font-mono truncate hover:bg-amber-900/40 flex items-center gap-1.5"
          title="Bound parameter — click to change or unbind"
        >
          <span aria-hidden>📎</span>
          <span className="truncate">{boundParam.name}</span>
          <span className={`ml-auto shrink-0 text-[9px] px-1 rounded ${PARAM_TYPE_BADGE[boundParam.type].bg} ${PARAM_TYPE_BADGE[boundParam.type].fg}`}>
            {boundParam.type}
          </span>
        </button>
      ) : children}

      {paramOpen && canParam && (
        <div
          ref={paramPopRef}
          className="absolute z-50 top-full left-0 right-0 mt-1 bg-gray-900 border border-gray-700 rounded shadow-xl py-1 max-h-64 overflow-y-auto"
        >
          {boundParam && onBindParam && (
            <>
              <button
                type="button"
                onClick={() => { onBindParam(null); setParamOpen(false) }}
                className="w-full text-left px-2 py-1.5 text-[11px] text-red-300 hover:bg-red-900/30 flex items-center gap-1.5"
              >
                <span aria-hidden>✕</span> Unbind parameter
              </button>
              <div className="border-t border-gray-700 my-1" />
            </>
          )}
          {compatible.length === 0 ? (
            <div className="px-2 py-2 text-[10px] text-gray-500 leading-snug">
              No compatible parameters.
              <br />
              Add a{' '}
              <span className="text-gray-300 font-mono">
                {acceptedTypes!.join(' / ')}
              </span>{' '}
              parameter from the Parameters panel.
            </div>
          ) : (
            compatible.map((p) => {
              const isBound = p.id === boundParamId
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { onBindParam!(p.id); setParamOpen(false) }}
                  className={`w-full text-left px-2 py-1.5 text-[11px] flex items-center gap-1.5 transition-colors ${
                    isBound
                      ? 'bg-amber-900/30 text-amber-200'
                      : 'text-gray-300 hover:bg-gray-800'
                  }`}
                >
                  <span className="truncate flex-1 font-mono">{p.name}</span>
                  <span className={`shrink-0 text-[9px] px-1 rounded ${PARAM_TYPE_BADGE[p.type].bg} ${PARAM_TYPE_BADGE[p.type].fg}`}>
                    {p.type}
                  </span>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

const PARAM_TYPE_BADGE: Record<import('@/lib/types').SceneParameterType, { bg: string; fg: string }> = {
  string:  { bg: 'bg-sky-900',     fg: 'text-sky-300'     },
  number:  { bg: 'bg-emerald-900', fg: 'text-emerald-300' },
  boolean: { bg: 'bg-amber-900',   fg: 'text-amber-300'   },
  color:   { bg: 'bg-pink-900',    fg: 'text-pink-300'    },
  image:   { bg: 'bg-violet-900',  fg: 'text-violet-300'  },
}

// ── Text panel option tables (BL-72 Phase 2) ────────────────────────────────
// System / web-safe families only — the app loads no custom fonts, so these are
// guaranteed to render. measureText reflects the chosen family in the browser.
const FONT_FAMILIES: string[] = [
  'sans-serif', 'serif', 'monospace',
  'Arial', 'Helvetica', 'Georgia', 'Times New Roman',
  'Courier New', 'Verdana', 'Trebuchet MS', 'Impact',
]

// Curated weight ramp. Values match the FontWeight union (numeric strings +
// 'normal'/'bold'). drawText injects these straight into the canvas font string.
const FONT_WEIGHTS: [FontWeight, string][] = [
  ['100', '100 · Thin'],
  ['300', '300 · Light'],
  ['normal', '400 · Regular'],
  ['500', '500 · Medium'],
  ['600', '600 · Semibold'],
  ['bold', '700 · Bold'],
  ['800', '800 · Extra'],
  ['900', '900 · Black'],
]

const TEXT_INPUT_CLASS =
  'w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 ' +
  'focus:outline-none focus:border-blue-500'

const DEFAULT_TEXT_STROKE = { color: '#000000', width: 2 }
const DEFAULT_TEXT_SHADOW = { x: 2, y: 2, blur: 4, color: '#000000' }

// ── Genel giriş bileşenleri ─────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</span>
      {children}
    </label>
  )
}

function NumInput({ value, onChange, min, max, step = 1 }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number
}) {
  return <ScrubInput value={value} onChange={onChange} min={min} max={max} step={step} />
}


type PluginEffectType =
  | 'glow' | 'blur' | 'shadow'
  | 'innerShadow' | 'innerGlow' | 'tint' | 'vignette'

function defaultEffectFor(type: PluginEffectType) {
  const id = `effect_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  switch (type) {
    case 'blur':        return { id, type, enabled: true, params: { radius: 4 } }
    case 'glow':        return { id, type, enabled: true, params: { color: '#60A5FA', radius: 8, intensity: 0.8 } }
    case 'shadow':      return { id, type, enabled: true, params: { color: '#000000', blur: 4, offsetX: 2, offsetY: 2, opacity: 0.5 } }
    case 'innerShadow': return { id, type, enabled: true, params: { color: '#000000', blur: 6, offsetX: 2, offsetY: 2, opacity: 0.5 } }
    case 'innerGlow':   return { id, type, enabled: true, params: { color: '#FFFFFF', radius: 10, intensity: 0.8 } }
    case 'tint':        return { id, type, enabled: true, params: { color: '#3B82F6', strength: 0.5, blend: 'overlay' } }
    case 'vignette':    return { id, type, enabled: true, params: { color: '#000000', strength: 0.5, innerStop: 0.4 } }
  }
}

function Row2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pt-1 border-t border-gray-700">
        {title}
      </div>
      {children}
    </div>
  )
}

// ── Ana bileşen ──────────────────────────────────────────────────────────────

export default function PropertiesPanel({
  layer, composition, onLayerChange, onCompositionChange,
  parameters = [], allLayers = [], allTimelines = [],
  onConvertToSpline,
  scene, parameterWires, onRequestNewWire, onEditWire,
  dispatchCommand,
}: Props) {
  // Convenience: bundle the wire-related props so we don't list them on
  // every WireableField call. `parameters` is shared too; `acceptedTypes`
  // and `onBindParam` stay inline since they vary per field.
  const wireProps = { scene, parameterWires, onRequestNewWire, onEditWire, parameters }
  // Shadow `scene` shape for the inline mask + motion path UI below (local
  // — distinct from the BL-05 `scene` prop above).
  const sceneLite = { layers: allLayers }

  const update = (partial: Partial<Layer>) => layer && onLayerChange({ ...layer, ...partial })
  const updateTransform = (key: keyof Layer['transform'], val: number) =>
    layer && update({ transform: { ...layer.transform, [key]: val } })

  // BL-72 — Patch text style AND re-measure the layer's `size` so the
  // selection frame / hit area / rulers track the visible glyphs. Routing
  // content + font-metric edits through here is what fixes the "frame stays
  // the same when fontSize changes" bug. (size-neutral edits like colour can
  // still go through plain `update`.)
  const updateText = (partial: Partial<NonNullable<Layer['text']>>) => {
    if (!layer?.text) return
    onLayerChange(syncTextLayerSize({ ...layer, text: { ...layer.text, ...partial } }))
  }

  // BL-69 — Update the layer's paramBindings map. Null clears the binding.
  // Drops the field entirely when empty so the scene stays JSON-clean.
  const bindParam = (propertyPath: string, paramId: string | null) => {
    if (!layer) return
    const next = { ...(layer.paramBindings ?? {}) }
    if (paramId) next[propertyPath] = paramId
    else          delete next[propertyPath]
    update({ paramBindings: Object.keys(next).length ? next : undefined })
  }

  // Active section tab. Resets to first tab when selection changes layer kind.
  const [activeTab, setActiveTab] = useState<PropTab>('properties')

  return (
    <aside className="flex flex-col flex-1 min-h-0 bg-gray-900 overflow-y-auto">
      <div className="px-3 py-2 border-b border-gray-700 shrink-0">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {layer ? `Layer: ${layer.id}` : 'Properties'}
        </span>
      </div>

      {/* ── Tab bar — only visible when a layer is selected ── */}
      {layer && (
        <div className="flex border-b border-gray-800 shrink-0 bg-gray-950/60">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] uppercase
                tracking-wider transition-colors border-b-2
                ${activeTab === t.id
                  ? 'text-blue-300 border-blue-500 bg-gray-900'
                  : 'text-gray-500 border-transparent hover:text-gray-300 hover:bg-gray-900/40'}`}
              title={t.label}
            >
              <span className="text-[12px]" aria-hidden>{t.icon}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 flex flex-col gap-3 px-3 py-3">

        {/* ── Composition (only when nothing selected — otherwise edit via header modal) */}
        {!layer && (
          <Section title="Composition">
            <Row2>
              <Field label="Width">
                <NumInput value={composition.width}  min={1} max={2048}
                  onChange={(v) => onCompositionChange({ ...composition, width: v })} />
              </Field>
              <Field label="Height">
                <NumInput value={composition.height} min={1} max={2048}
                  onChange={(v) => onCompositionChange({ ...composition, height: v })} />
              </Field>
            </Row2>
            <Field label="Bg Type">
              <select
                value={composition.backgroundGradient ? 'gradient' : 'solid'}
                onChange={(e) => {
                  if (e.target.value === 'gradient') {
                    onCompositionChange({
                      ...composition,
                      backgroundGradient: {
                        type: 'linear', angle: 90,
                        stops: [
                          { offset: 0, color: composition.backgroundColor || '#1E293B' },
                          { offset: 1, color: '#000000' },
                        ],
                      },
                    })
                  } else {
                    const next = { ...composition }
                    delete next.backgroundGradient
                    onCompositionChange(next)
                  }
                }}
                className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
              >
                <option value="solid">Solid</option>
                <option value="gradient">Gradient</option>
              </select>
            </Field>
            {!composition.backgroundGradient && (
              <Field label="Bg Color">
                <ColorInput value={composition.backgroundColor}
                  onChange={(v) => onCompositionChange({ ...composition, backgroundColor: v })} />
              </Field>
            )}
            {composition.backgroundGradient && (
              <Field label="Bg Gradient">
                <GradientInput value={composition.backgroundGradient}
                  onChange={(g) => onCompositionChange({ ...composition, backgroundGradient: g })} />
              </Field>
            )}
            <Field label="Duration (ms)">
              <NumInput value={composition.durationMs} min={100} step={100}
                onChange={(v) => onCompositionChange({ ...composition, durationMs: v })} />
            </Field>
            <p className="text-[10px] text-gray-500 leading-snug pt-1">
              Tip: click <span className="font-mono text-gray-400">{composition.width}×{composition.height}</span> in the header for preset sizes.
            </p>
          </Section>
        )}

        {/* ── Layer özellikleri ──────────────────────────────────────── */}
        {layer && (
          <>
            {/* Schema-driven properties: rendered for layer types that DON'T
                already have a rich hand-written UI (group, repeater).
                particleEmitter has its own dedicated dock tab — see below for
                the redirect hint. Shape / text / media layers keep their
                bespoke sections below. */}
            {(layer.type === 'group' || layer.type === 'repeater') && activeTab === 'properties' && (
              <SchemaPanel layer={layer} onLayerChange={onLayerChange} />
            )}

            {/* Particle emitter — redirect to dedicated panel. We still show
                Transform / Appearance below so the user can position the
                emitter; everything else lives in the Particle tab. */}
            {layer.type === 'particleEmitter' && activeTab === 'properties' && (
              <div className="rounded border border-violet-800/40 bg-violet-950/30 px-3 py-2.5 flex items-start gap-2">
                <span className="text-xl shrink-0" aria-hidden>✨</span>
                <div className="flex flex-col gap-0.5 text-[11px] leading-snug">
                  <span className="text-violet-200 font-semibold">Particle settings live in the “Particle” tab</span>
                  <span className="text-gray-400">
                    Switch to the Particle tab in this dock column to edit
                    emitter, shape, animation, and randomness. Transform &amp;
                    Appearance for this layer stay here.
                  </span>
                </div>
              </div>
            )}

            {layer.type !== 'group' && layer.type !== 'repeater' && activeTab === 'properties' && (<>
            <Section title="Transform">
              <Row2>
                <WireableField label="X" layer={layer} propertyPath="transform.x" {...wireProps}
                  acceptedTypes={['number']} onBindParam={(id) => bindParam('transform.x', id)}>
                  <NumInput value={layer.transform.x} onChange={(v) => updateTransform('x', v)} />
                </WireableField>
                <WireableField label="Y" layer={layer} propertyPath="transform.y" {...wireProps}
                  acceptedTypes={['number']} onBindParam={(id) => bindParam('transform.y', id)}>
                  <NumInput value={layer.transform.y} onChange={(v) => updateTransform('y', v)} />
                </WireableField>
              </Row2>
              <Row2>
                <WireableField label="Scale X" layer={layer} propertyPath="transform.scaleX" {...wireProps}
                  acceptedTypes={['number']} onBindParam={(id) => bindParam('transform.scaleX', id)}>
                  <NumInput value={layer.transform.scaleX} step={0.01} min={0.01}
                    onChange={(v) => updateTransform('scaleX', v)} />
                </WireableField>
                <WireableField label="Scale Y" layer={layer} propertyPath="transform.scaleY" {...wireProps}
                  acceptedTypes={['number']} onBindParam={(id) => bindParam('transform.scaleY', id)}>
                  <NumInput value={layer.transform.scaleY} step={0.01} min={0.01}
                    onChange={(v) => updateTransform('scaleY', v)} />
                </WireableField>
              </Row2>
              <WireableField label="Rotation (deg)" layer={layer} propertyPath="transform.rotationDeg" {...wireProps}
                acceptedTypes={['number']} onBindParam={(id) => bindParam('transform.rotationDeg', id)}>
                <NumInput value={layer.transform.rotationDeg} min={-360} max={360}
                  onChange={(v) => updateTransform('rotationDeg', v)} />
              </WireableField>
              <Row2>
                <ParamBindButton
                  label="Anchor X" layer={layer} propertyPath="transform.anchorX"
                  acceptedTypes={['number']} parameters={parameters}
                  onBind={(id) => bindParam('transform.anchorX', id)}
                >
                  <NumInput value={layer.transform.anchorX}
                    onChange={(v) => updateTransform('anchorX', v)} />
                </ParamBindButton>
                <ParamBindButton
                  label="Anchor Y" layer={layer} propertyPath="transform.anchorY"
                  acceptedTypes={['number']} parameters={parameters}
                  onBind={(id) => bindParam('transform.anchorY', id)}
                >
                  <NumInput value={layer.transform.anchorY}
                    onChange={(v) => updateTransform('anchorY', v)} />
                </ParamBindButton>
              </Row2>
              <button
                onClick={() => {
                  // Layer-local centre: half of size for shapes/images/videos.
                  // For text we approximate from value length × fontSize × 0.55.
                  let cx = 0, cy = 0
                  if (layer.size) {
                    cx = layer.size.width  / 2
                    cy = layer.size.height / 2
                  } else if (layer.text) {
                    cx = (layer.text.value.length * layer.text.fontSize * 0.55) / 2
                    cy = layer.text.fontSize / 2
                  }
                  update({ transform: { ...layer.transform, anchorX: cx, anchorY: cy } })
                }}
                title="Move the anchor to the layer's visual centre (top-left = 0,0)"
                className="w-full text-[11px] py-1 rounded bg-gray-800 hover:bg-gray-700
                           border border-gray-700 text-gray-300"
              >
                ⊕ Centre anchor
              </button>
            </Section>

            <Section title="Appearance">
              <WireableField label="Opacity" layer={layer} propertyPath="opacity" {...wireProps}
                acceptedTypes={['number']} onBindParam={(id) => bindParam('opacity', id)}>
                <div className="flex items-center gap-2">
                  <input
                    type="range" min={0} max={1} step={0.01}
                    value={layer.opacity}
                    onChange={(e) => update({ opacity: Number(e.target.value) })}
                    className="flex-1 accent-blue-500"
                  />
                  <span className="text-xs text-gray-400 w-8 text-right">
                    {(layer.opacity * 100).toFixed(0)}%
                  </span>
                </div>
              </WireableField>
              <Field label="Blend Mode">
                <select
                  value={layer.blendMode ?? 'source-over'}
                  onChange={(e) => update({
                    blendMode: e.target.value === 'source-over' ? undefined : (e.target.value as GlobalCompositeOperation),
                  })}
                  className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200
                             focus:outline-none focus:border-blue-500"
                >
                  {BLEND_MODES.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </Field>
            </Section>

            {/* ── Spline Fill / Stroke / Trim (schema-driven) ──────────────
                Splines declare these groups (incl. the gradient fill option) via
                their LayerDefinition. Transform & Appearance are hand-written
                above, so filter them out here to avoid duplicate sections. */}
            {layer.type === 'spline' && (
              <SchemaPanel
                layer={layer}
                onLayerChange={onLayerChange}
                filterGroup={(g) => g.title !== 'Transform' && g.title !== 'Appearance'}
              />
            )}

            {/* ── Shape özellikleri ──────────────────────────────────── */}
            {layer.type === 'shape' && layer.style && layer.size && (
              <Section title="Shape">
                <Row2>
                  <Field label="Width">
                    <NumInput value={layer.size.width} min={1}
                      onChange={(v) => update({ size: { ...layer.size!, width: v } })} />
                  </Field>
                  <Field label="Height">
                    <NumInput value={layer.size.height} min={1}
                      onChange={(v) => update({ size: { ...layer.size!, height: v } })} />
                  </Field>
                </Row2>
                <Field label="Fill Type">
                  <select
                    value={layer.style.fill?.type ?? 'solid'}
                    onChange={(e) => {
                      const t = e.target.value as 'solid' | 'gradient'
                      if (t === 'gradient') {
                        update({ style: { ...layer.style!, fill: {
                          ...layer.style!.fill,
                          type: 'gradient',
                          gradient: layer.style!.fill?.gradient ?? {
                            type: 'linear', angle: 90,
                            stops: [
                              { offset: 0, color: layer.style!.fill?.color ?? '#3B82F6' },
                              { offset: 1, color: '#EC4899' },
                            ],
                          },
                        } } })
                      } else {
                        update({ style: { ...layer.style!, fill: {
                          ...layer.style!.fill, type: 'solid', color: layer.style!.fill?.color ?? '#3B82F6',
                        } } })
                      }
                    }}
                    className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
                  >
                    <option value="solid">Solid</option>
                    <option value="gradient">Gradient</option>
                  </select>
                </Field>
                {layer.style.fill?.type !== 'gradient' && (
                  <ParamBindButton
                    label="Fill Color"
                    layer={layer}
                    propertyPath="style.fill.color"
                    acceptedTypes={['color']}
                    parameters={parameters}
                    onBind={(id) => bindParam('style.fill.color', id)}
                  >
                    <ColorInput value={layer.style.fill?.color ?? '#000000'}
                      onChange={(v) => update({
                        style: {
                          ...layer.style!,
                          fill: { type: 'solid', ...layer.style!.fill, color: v },
                        },
                      })} />
                  </ParamBindButton>
                )}
                {layer.style.fill?.type === 'gradient' && (
                  <Field label="Fill Gradient">
                    <GradientInput
                      value={layer.style.fill?.gradient}
                      onChange={(g) => update({
                        style: { ...layer.style!, fill: { ...layer.style!.fill!, type: 'gradient', gradient: g } },
                      })}
                    />
                  </Field>
                )}
                {(layer.shapeKind === 'rect' || (!layer.shapeKind && layer.shape === 'rect')) && (
                  <ParamBindButton
                    label="Corner Radius" layer={layer} propertyPath="style.cornerRadius"
                    acceptedTypes={['number']} parameters={parameters}
                    onBind={(id) => bindParam('style.cornerRadius', id)}
                  >
                    <NumInput value={layer.style.cornerRadius ?? 0} min={0}
                      onChange={(v) => update({ style: { ...layer.style!, cornerRadius: v } })} />
                  </ParamBindButton>
                )}
              </Section>
            )}

            {/* ── Convert to Spline kaldırıldı (BL-24 fix) ─────────────────
                Shape nesneleri zaten parametrik. Spline'a dönüştürme
                bezierPath layer'ı içindir, shape'ler için değil. Context menu'den
                gerekirse ayrıca erişilebilir kalır. */}

            {/* ── Geometry (parametric shape params) ─────────────────── */}
            {layer.type === 'shape' && layer.shapeKind && (
              (layer.shapeKind === 'polygon' || layer.shapeKind === 'star' ||
               layer.shapeKind === 'ring'    || layer.shapeKind === 'arc'  ||
               layer.shapeKind === 'line'    || layer.shapeKind === 'arrow' ||
               layer.shapeKind === 'spiral'  || layer.shapeKind === 'wave'  ||
               layer.shapeKind === 'blob')
            ) && (
              <Section title="Geometry">
                {/* Polygon & Star — sides */}
                {(layer.shapeKind === 'polygon' || layer.shapeKind === 'star') && (
                  <ParamBindButton
                    label={layer.shapeKind === 'star' ? 'Points' : 'Sides'}
                    layer={layer} propertyPath="shapeParams.sides"
                    acceptedTypes={['number']} parameters={parameters}
                    onBind={(id) => bindParam('shapeParams.sides', id)}
                  >
                    <NumInput
                      value={layer.shapeParams?.sides ?? (layer.shapeKind === 'star' ? 5 : 6)}
                      min={3} max={12} step={1}
                      onChange={(v) => update({
                        shapeParams: { ...(layer.shapeParams ?? { kind: layer.shapeKind! }), kind: layer.shapeKind!, sides: v },
                      })}
                    />
                  </ParamBindButton>
                )}

                {/* Star — inner / outer radius */}
                {layer.shapeKind === 'star' && (
                  <Row2>
                    <ParamBindButton
                      label="Outer R" layer={layer} propertyPath="shapeParams.outerRadius"
                      acceptedTypes={['number']} parameters={parameters}
                      onBind={(id) => bindParam('shapeParams.outerRadius', id)}
                    >
                      <NumInput value={layer.shapeParams?.outerRadius ?? 60} min={1}
                        onChange={(v) => update({
                          shapeParams: { ...(layer.shapeParams ?? { kind: 'star' }), kind: 'star', outerRadius: v },
                        })} />
                    </ParamBindButton>
                    <ParamBindButton
                      label="Inner R" layer={layer} propertyPath="shapeParams.innerRadius"
                      acceptedTypes={['number']} parameters={parameters}
                      onBind={(id) => bindParam('shapeParams.innerRadius', id)}
                    >
                      <NumInput value={layer.shapeParams?.innerRadius ?? 27} min={1}
                        onChange={(v) => update({
                          shapeParams: { ...(layer.shapeParams ?? { kind: 'star' }), kind: 'star', innerRadius: v },
                        })} />
                    </ParamBindButton>
                  </Row2>
                )}

                {/* Polygon & Star — roundness */}
                {(layer.shapeKind === 'polygon' || layer.shapeKind === 'star') && (
                  <ParamBindButton
                    label="Roundness (0-1)" layer={layer} propertyPath="shapeParams.roundness"
                    acceptedTypes={['number']} parameters={parameters}
                    onBind={(id) => bindParam('shapeParams.roundness', id)}
                  >
                    <NumInput value={layer.shapeParams?.roundness ?? 0} min={0} max={1} step={0.05}
                      onChange={(v) => update({
                        shapeParams: { ...(layer.shapeParams ?? { kind: layer.shapeKind! }), kind: layer.shapeKind!, roundness: v },
                      })} />
                  </ParamBindButton>
                )}

                {/* Ring & Arc — angles */}
                {(layer.shapeKind === 'ring' || layer.shapeKind === 'arc') && (
                  <>
                    <Row2>
                      <ParamBindButton
                        label="Start °" layer={layer} propertyPath="shapeParams.startAngle"
                        acceptedTypes={['number']} parameters={parameters}
                        onBind={(id) => bindParam('shapeParams.startAngle', id)}
                      >
                        <NumInput value={layer.shapeParams?.startAngle ?? (layer.shapeKind === 'arc' ? -90 : 0)}
                          min={-360} max={360} step={1}
                          onChange={(v) => update({
                            shapeParams: { ...(layer.shapeParams ?? { kind: layer.shapeKind! }), kind: layer.shapeKind!, startAngle: v },
                          })} />
                      </ParamBindButton>
                      <ParamBindButton
                        label="End °" layer={layer} propertyPath="shapeParams.endAngle"
                        acceptedTypes={['number']} parameters={parameters}
                        onBind={(id) => bindParam('shapeParams.endAngle', id)}
                      >
                        <NumInput value={layer.shapeParams?.endAngle ?? (layer.shapeKind === 'arc' ? 90 : 360)}
                          min={-360} max={360} step={1}
                          onChange={(v) => update({
                            shapeParams: { ...(layer.shapeParams ?? { kind: layer.shapeKind! }), kind: layer.shapeKind!, endAngle: v },
                          })} />
                      </ParamBindButton>
                    </Row2>
                    {layer.shapeKind === 'ring' && (
                      <Field label="Inner Radius">
                        <NumInput value={layer.shapeParams?.innerRadius ?? 30} min={1}
                          onChange={(v) => update({
                            shapeParams: { ...(layer.shapeParams ?? { kind: 'ring' }), kind: 'ring', innerRadius: v },
                          })} />
                      </Field>
                    )}
                  </>
                )}

                {/* Line & Arrow — endpoint */}
                {(layer.shapeKind === 'line' || layer.shapeKind === 'arrow') && (
                  <>
                    <Row2>
                      <Field label="End X">
                        <NumInput value={layer.shapeParams?.x2 ?? 160}
                          onChange={(v) => update({
                            shapeParams: { ...(layer.shapeParams ?? { kind: layer.shapeKind! }), kind: layer.shapeKind!, x2: v },
                          })} />
                      </Field>
                      <Field label="End Y">
                        <NumInput value={layer.shapeParams?.y2 ?? 0}
                          onChange={(v) => update({
                            shapeParams: { ...(layer.shapeParams ?? { kind: layer.shapeKind! }), kind: layer.shapeKind!, y2: v },
                          })} />
                      </Field>
                    </Row2>
                    {layer.shapeKind === 'arrow' && (
                      <Field label="Arrow Head Size">
                        <NumInput value={layer.shapeParams?.arrowHeadSize ?? 14} min={2} max={60}
                          onChange={(v) => update({
                            shapeParams: { ...(layer.shapeParams ?? { kind: 'arrow' }), kind: 'arrow', arrowHeadSize: v },
                          })} />
                      </Field>
                    )}
                  </>
                )}

                {/* BL-24 — Spiral: turns, startRadius, endRadius, tightness */}
                {layer.shapeKind === 'spiral' && (
                  <>
                    <Field label="Turns">
                      <NumInput value={layer.shapeParams?.turns ?? 3} min={0.5} max={20} step={0.5}
                        onChange={(v) => update({
                          shapeParams: { ...(layer.shapeParams ?? { kind: 'spiral' }), kind: 'spiral', turns: v },
                        })} />
                    </Field>
                    <Row2>
                      <Field label="Inner R">
                        <NumInput value={layer.shapeParams?.startRadius ?? 4} min={0}
                          onChange={(v) => update({
                            shapeParams: { ...(layer.shapeParams ?? { kind: 'spiral' }), kind: 'spiral', startRadius: v },
                          })} />
                      </Field>
                      <Field label="Outer R">
                        <NumInput value={layer.shapeParams?.endRadius ?? 56} min={1}
                          onChange={(v) => update({
                            shapeParams: { ...(layer.shapeParams ?? { kind: 'spiral' }), kind: 'spiral', endRadius: v },
                          })} />
                      </Field>
                    </Row2>
                    <Field label="Tightness">
                      <NumInput value={layer.shapeParams?.tightness ?? 1} min={0.1} max={5} step={0.1}
                        onChange={(v) => update({
                          shapeParams: { ...(layer.shapeParams ?? { kind: 'spiral' }), kind: 'spiral', tightness: v },
                        })} />
                    </Field>
                  </>
                )}

                {/* BL-24 — Wave: amplitude, frequency, phase */}
                {layer.shapeKind === 'wave' && (
                  <>
                    <Field label="Amplitude">
                      <NumInput value={layer.shapeParams?.amplitude ?? 20} min={0}
                        onChange={(v) => update({
                          shapeParams: { ...(layer.shapeParams ?? { kind: 'wave' }), kind: 'wave', amplitude: v },
                        })} />
                    </Field>
                    <Field label="Frequency">
                      <NumInput value={layer.shapeParams?.frequency ?? 2} min={0.1} max={50} step={0.5}
                        onChange={(v) => update({
                          shapeParams: { ...(layer.shapeParams ?? { kind: 'wave' }), kind: 'wave', frequency: v },
                        })} />
                    </Field>
                    <Field label="Phase (rad)">
                      <NumInput value={layer.shapeParams?.phase ?? 0} min={-6.283} max={6.283} step={0.1}
                        onChange={(v) => update({
                          shapeParams: { ...(layer.shapeParams ?? { kind: 'wave' }), kind: 'wave', phase: v },
                        })} />
                    </Field>
                  </>
                )}

                {/* BL-24 — Blob: sides, irregularity, seed */}
                {layer.shapeKind === 'blob' && (
                  <>
                    <Field label="Points">
                      <NumInput value={layer.shapeParams?.sides ?? 8} min={5} max={64} step={1}
                        onChange={(v) => update({
                          shapeParams: { ...(layer.shapeParams ?? { kind: 'blob' }), kind: 'blob', sides: v },
                        })} />
                    </Field>
                    <Field label="Irregularity (0-1)">
                      <NumInput value={layer.shapeParams?.irregularity ?? 0.4} min={0} max={1} step={0.05}
                        onChange={(v) => update({
                          shapeParams: { ...(layer.shapeParams ?? { kind: 'blob' }), kind: 'blob', irregularity: v },
                        })} />
                    </Field>
                    <Field label="Seed">
                      <NumInput value={layer.shapeParams?.seed ?? 42} min={0} step={1}
                        onChange={(v) => update({
                          shapeParams: { ...(layer.shapeParams ?? { kind: 'blob' }), kind: 'blob', seed: v },
                        })} />
                    </Field>
                  </>
                )}
              </Section>
            )}

            {/* ── Stroke (all shapes) ───────────────────────────────── */}
            {layer.type === 'shape' && (
              <Section title="Stroke">
                <Row2>
                  <ParamBindButton
                    label="Color"
                    layer={layer}
                    propertyPath="style.stroke.color"
                    acceptedTypes={['color']}
                    parameters={parameters}
                    onBind={(id) => bindParam('style.stroke.color', id)}
                  >
                    <ColorInput value={layer.style?.stroke?.color ?? '#FFFFFF'}
                      onChange={(v) => update({
                        style: { ...(layer.style ?? {}),
                          stroke: { width: 2, ...(layer.style?.stroke ?? {}), color: v } },
                      })} />
                  </ParamBindButton>
                  <ParamBindButton
                    label="Width" layer={layer} propertyPath="style.stroke.width"
                    acceptedTypes={['number']} parameters={parameters}
                    onBind={(id) => bindParam('style.stroke.width', id)}
                  >
                    <NumInput value={layer.style?.stroke?.width ?? 0} min={0} max={100}
                      onChange={(v) => update({
                        style: { ...(layer.style ?? {}),
                          stroke: { color: '#FFFFFF', ...(layer.style?.stroke ?? {}), width: v } },
                      })} />
                  </ParamBindButton>
                </Row2>
                {layer.style?.stroke && layer.style.stroke.width > 0 && (
                  <Row2>
                    <Field label="Cap">
                      <select
                        value={layer.style.stroke.lineCap ?? 'butt'}
                        onChange={(e) => update({
                          style: { ...layer.style!,
                            stroke: { ...layer.style!.stroke!, lineCap: e.target.value as any } },
                        })}
                        className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
                      >
                        <option value="butt">Butt</option>
                        <option value="round">Round</option>
                        <option value="square">Square</option>
                      </select>
                    </Field>
                    <Field label="Join">
                      <select
                        value={layer.style.stroke.lineJoin ?? 'miter'}
                        onChange={(e) => update({
                          style: { ...layer.style!,
                            stroke: { ...layer.style!.stroke!, lineJoin: e.target.value as any } },
                        })}
                        className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
                      >
                        <option value="miter">Miter</option>
                        <option value="round">Round</option>
                        <option value="bevel">Bevel</option>
                      </select>
                    </Field>
                  </Row2>
                )}
                {/* ── Stroke gradient toggle ── */}
                {layer.style?.stroke && layer.style.stroke.width > 0 && (
                  <div className="border-t border-gray-700 pt-1.5 space-y-1.5">
                    <label className="flex items-center gap-2 text-[10px] text-gray-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!layer.style.stroke.gradient}
                        onChange={(e) => update({
                          style: {
                            ...layer.style!,
                            stroke: {
                              ...layer.style!.stroke!,
                              gradient: e.target.checked
                                ? (layer.style!.stroke!.gradient ?? {
                                    type: 'linear', angle: 90,
                                    stops: [
                                      { offset: 0, color: layer.style!.stroke!.color },
                                      { offset: 1, color: '#FFFFFF' },
                                    ],
                                  })
                                : undefined,
                            },
                          },
                        })}
                        className="accent-blue-500"
                      />
                      Use gradient stroke
                    </label>
                    {layer.style.stroke.gradient && (
                      <>
                        <Row2>
                          <Field label="Type">
                            <select
                              value={layer.style.stroke.gradient.type}
                              onChange={(e) => update({
                                style: { ...layer.style!,
                                  stroke: { ...layer.style!.stroke!,
                                    gradient: { ...layer.style!.stroke!.gradient!, type: e.target.value as 'linear' | 'radial' } } },
                              })}
                              className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
                            >
                              <option value="linear">Linear</option>
                              <option value="radial">Radial</option>
                            </select>
                          </Field>
                          {layer.style.stroke.gradient.type === 'linear' && (
                            <Field label="Angle °">
                              <NumInput value={layer.style.stroke.gradient.angle ?? 90}
                                min={0} max={360} step={1}
                                onChange={(v) => update({
                                  style: { ...layer.style!,
                                    stroke: { ...layer.style!.stroke!,
                                      gradient: { ...layer.style!.stroke!.gradient!, angle: v } } },
                                })} />
                            </Field>
                          )}
                        </Row2>
                        <Row2>
                          <Field label="Start Color">
                            <ColorInput value={layer.style.stroke.gradient.stops[0]?.color ?? '#000000'}
                              onChange={(v) => update({
                                style: { ...layer.style!,
                                  stroke: { ...layer.style!.stroke!,
                                    gradient: { ...layer.style!.stroke!.gradient!,
                                      stops: layer.style!.stroke!.gradient!.stops.map((s, i) => i === 0 ? { ...s, color: v } : s) } } },
                              })} />
                          </Field>
                          <Field label="End Color">
                            <ColorInput value={layer.style.stroke.gradient.stops[layer.style.stroke.gradient.stops.length - 1]?.color ?? '#FFFFFF'}
                              onChange={(v) => update({
                                style: { ...layer.style!,
                                  stroke: { ...layer.style!.stroke!,
                                    gradient: { ...layer.style!.stroke!.gradient!,
                                      stops: layer.style!.stroke!.gradient!.stops.map((s, i) =>
                                        i === layer.style!.stroke!.gradient!.stops.length - 1 ? { ...s, color: v } : s) } } },
                              })} />
                          </Field>
                        </Row2>
                      </>
                    )}
                  </div>
                )}
              </Section>
            )}

            {/* ── Trim Path (only shows when stroke has width) ──────── */}
            {layer.type === 'shape' && (layer.style?.stroke?.width ?? 0) > 0 && (
              <Section title="Trim Path">
                <Row2>
                  <Field label="Start">
                    <NumInput value={layer.style?.stroke?.trim?.start ?? 0} min={0} max={1} step={0.01}
                      onChange={(v) => update({
                        style: { ...layer.style!,
                          stroke: { ...layer.style!.stroke!,
                            trim: { end: 1, offset: 0, ...(layer.style?.stroke?.trim ?? {}), start: v } } },
                      })} />
                  </Field>
                  <Field label="End">
                    <NumInput value={layer.style?.stroke?.trim?.end ?? 1} min={0} max={1} step={0.01}
                      onChange={(v) => update({
                        style: { ...layer.style!,
                          stroke: { ...layer.style!.stroke!,
                            trim: { start: 0, offset: 0, ...(layer.style?.stroke?.trim ?? {}), end: v } } },
                      })} />
                  </Field>
                </Row2>
                <Field label="Offset">
                  <NumInput value={layer.style?.stroke?.trim?.offset ?? 0} min={-1} max={1} step={0.01}
                    onChange={(v) => update({
                      style: { ...layer.style!,
                        stroke: { ...layer.style!.stroke!,
                          trim: { start: 0, end: 1, ...(layer.style?.stroke?.trim ?? {}), offset: v } } },
                    })} />
                </Field>
                <p className="text-[10px] text-gray-500 leading-snug pt-0.5">
                  Animate Trim End from 0→1 to reveal a stroke. Animate Offset for rotating loaders.
                </p>
              </Section>
            )}

            {/* ── Bezier Path (Pen Tool layer) — BL-66 ──────────────── */}
            {layer.type === 'path' && layer.path && (
              <Section title="Path">
                <div className="flex gap-1.5 flex-wrap">
                  <button
                    onClick={() => update({ path: togglePathClosed(layer.path!) })}
                    disabled={layer.path.anchors.length < 2}
                    className="px-2 py-1 text-[10px] rounded bg-gray-800 hover:bg-blue-600 disabled:opacity-40 disabled:hover:bg-gray-800 text-gray-200 transition-colors"
                    title={layer.path.closed ? 'Open path' : 'Close path'}
                  >
                    {layer.path.closed ? '◯ Open' : '◌ Close'}
                  </button>
                  <button
                    onClick={() => update({ path: reversePath(layer.path!) })}
                    disabled={layer.path.anchors.length < 2}
                    className="px-2 py-1 text-[10px] rounded bg-gray-800 hover:bg-blue-600 disabled:opacity-40 disabled:hover:bg-gray-800 text-gray-200 transition-colors"
                    title="Reverse direction"
                  >
                    ⇄ Reverse
                  </button>
                </div>

                <div className="text-[10px] text-gray-500 pt-1.5">
                  {layer.path.anchors.length} anchor{layer.path.anchors.length === 1 ? '' : 's'} ·
                  {' '}{layer.path.closed ? 'closed' : 'open'}
                  {layer.pathRole === 'motion' && (
                    <span className="ml-1 px-1 rounded bg-amber-900 text-amber-300 text-[9px]">MOTION</span>
                  )}
                </div>

                <p className="text-[10px] text-gray-500 leading-snug pt-1">
                  Double-click a path to edit it, or press <kbd className="px-1 bg-gray-800 rounded text-gray-300">P</kbd> for the Pen Tool.
                  Click on the canvas to add anchors, click + drag for smooth curves.
                  Double-click the first anchor to close. Press
                  {' '}<kbd className="px-1 bg-gray-800 rounded text-gray-300">Enter</kbd> when done.
                </p>
              </Section>
            )}

            {/* ── Inner grid (visual aid drawn inside the layer) ─────── */}
            <Section title="Inner Grid">
              <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!layer.internalGrid}
                  onChange={(e) => update({
                    internalGrid: e.target.checked ? { size: layer.internalGrid?.size ?? 10 } : undefined,
                  })}
                  className="accent-blue-500"
                />
                Show grid inside this layer
              </label>
              {layer.internalGrid && (
                <Field label="Cell size (px)">
                  <NumInput
                    value={layer.internalGrid.size}
                    min={2} max={200}
                    onChange={(v) => update({ internalGrid: { size: v } })}
                  />
                </Field>
              )}
              <p className="text-[10px] text-gray-500 leading-snug pt-0.5">
                Independent of the canvas grid. Useful for pixel-precise
                content inside a single shape.
              </p>
            </Section>

            {/* ── Text özellikleri ──────────────────────────────────── */}
            {/* ── Text: Character ───────────────────────────────────── */}
            {layer.type === 'text' && layer.text && (
              <Section title="Text">
                <ParamBindButton
                  label="Content"
                  layer={layer}
                  propertyPath="text.value"
                  acceptedTypes={['string']}
                  parameters={parameters}
                  onBind={(id) => bindParam('text.value', id)}
                >
                  <input
                    type="text"
                    value={layer.text.value}
                    onChange={(e) => updateText({ value: e.target.value })}
                    className={TEXT_INPUT_CLASS}
                  />
                </ParamBindButton>

                <Field label="Font">
                  <select
                    value={layer.text.fontFamily ?? 'sans-serif'}
                    onChange={(e) => updateText({ fontFamily: e.target.value })}
                    className={TEXT_INPUT_CLASS}
                  >
                    {FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </Field>

                <Row2>
                  <Field label="Weight">
                    <select
                      value={String(layer.text.fontWeight ?? 'normal')}
                      onChange={(e) => updateText({ fontWeight: e.target.value as FontWeight })}
                      className={TEXT_INPUT_CLASS}
                    >
                      {FONT_WEIGHTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </Field>
                  <Field label="Style">
                    <select
                      value={layer.text.fontStyle ?? 'normal'}
                      onChange={(e) => updateText({ fontStyle: e.target.value as FontStyle })}
                      className={TEXT_INPUT_CLASS}
                    >
                      <option value="normal">Normal</option>
                      <option value="italic">Italic</option>
                    </select>
                  </Field>
                </Row2>

                <Row2>
                  <ParamBindButton
                    label="Font Size"
                    layer={layer}
                    propertyPath="text.fontSize"
                    acceptedTypes={['number']}
                    parameters={parameters}
                    onBind={(id) => bindParam('text.fontSize', id)}
                  >
                    <NumInput value={layer.text.fontSize} min={4}
                      onChange={(v) => updateText({ fontSize: v })} />
                  </ParamBindButton>
                  <ParamBindButton
                    label="Color"
                    layer={layer}
                    propertyPath="text.color"
                    acceptedTypes={['color']}
                    parameters={parameters}
                    onBind={(id) => bindParam('text.color', id)}
                  >
                    <ColorInput value={layer.text.color}
                      onChange={(v) => updateText({ color: v })} />
                  </ParamBindButton>
                </Row2>

                <Field label="Fill Type">
                  <select
                    value={layer.text.gradient ? 'gradient' : 'solid'}
                    onChange={(e) => {
                      if (e.target.value === 'gradient') {
                        updateText({ gradient: {
                          type: 'linear', angle: 90,
                          stops: [
                            { offset: 0, color: layer.text!.color || '#FFFFFF' },
                            { offset: 1, color: '#EC4899' },
                          ],
                        } })
                      } else {
                        updateText({ gradient: undefined })
                      }
                    }}
                    className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
                  >
                    <option value="solid">Solid</option>
                    <option value="gradient">Gradient</option>
                  </select>
                </Field>
                {layer.text.gradient && (
                  <Field label="Text Gradient">
                    <GradientInput value={layer.text.gradient}
                      onChange={(g) => updateText({ gradient: g })} />
                  </Field>
                )}

                <Field label="Letter Spacing">
                  <NumInput value={layer.text.letterSpacing ?? 0} step={0.5}
                    onChange={(v) => updateText({ letterSpacing: v })} />
                </Field>

                <Row2>
                  <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                    <input type="checkbox" checked={!!layer.text.uppercase}
                      onChange={(e) => updateText({ uppercase: e.target.checked })}
                      className="accent-blue-500" />
                    Uppercase
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                    <input type="checkbox" checked={!!layer.text.underline}
                      onChange={(e) => updateText({ underline: e.target.checked })}
                      className="accent-blue-500" />
                    Underline
                  </label>
                </Row2>
              </Section>
            )}

            {/* ── Text: Stroke (outline) ────────────────────────────── */}
            {layer.type === 'text' && layer.text && (
              <Section title="Text Stroke">
                <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                  <input type="checkbox" checked={!!layer.text.stroke}
                    onChange={(e) => updateText({ stroke: e.target.checked ? (layer.text!.stroke ?? DEFAULT_TEXT_STROKE) : undefined })}
                    className="accent-blue-500" />
                  Enable outline
                </label>
                {layer.text.stroke && (
                  <Row2>
                    <Field label="Color">
                      <ColorInput value={layer.text.stroke.color}
                        onChange={(v) => updateText({ stroke: { ...layer.text!.stroke!, color: v } })} />
                    </Field>
                    <Field label="Width">
                      <NumInput value={layer.text.stroke.width} min={0} step={0.5}
                        onChange={(v) => updateText({ stroke: { ...layer.text!.stroke!, width: v } })} />
                    </Field>
                  </Row2>
                )}
              </Section>
            )}

            {/* ── Text: Shadow ──────────────────────────────────────── */}
            {layer.type === 'text' && layer.text && (
              <Section title="Text Shadow">
                <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                  <input type="checkbox" checked={!!layer.text.shadow}
                    onChange={(e) => updateText({ shadow: e.target.checked ? (layer.text!.shadow ?? DEFAULT_TEXT_SHADOW) : undefined })}
                    className="accent-blue-500" />
                  Enable shadow
                </label>
                {layer.text.shadow && (
                  <>
                    <Row2>
                      <Field label="Color">
                        <ColorInput value={layer.text.shadow.color}
                          onChange={(v) => updateText({ shadow: { ...layer.text!.shadow!, color: v } })} />
                      </Field>
                      <Field label="Blur">
                        <NumInput value={layer.text.shadow.blur} min={0} step={0.5}
                          onChange={(v) => updateText({ shadow: { ...layer.text!.shadow!, blur: v } })} />
                      </Field>
                    </Row2>
                    <Row2>
                      <Field label="Offset X">
                        <NumInput value={layer.text.shadow.x} step={0.5}
                          onChange={(v) => updateText({ shadow: { ...layer.text!.shadow!, x: v } })} />
                      </Field>
                      <Field label="Offset Y">
                        <NumInput value={layer.text.shadow.y} step={0.5}
                          onChange={(v) => updateText({ shadow: { ...layer.text!.shadow!, y: v } })} />
                      </Field>
                    </Row2>
                  </>
                )}
              </Section>
            )}

            {/* ── Image properties ──────────────────────────────────── */}
            {layer.type === 'image' && layer.image && layer.size && (
              <Section title="Image">
                <Row2>
                  <Field label="Width">
                    <NumInput value={layer.size.width} min={1}
                      onChange={(v) => update({ size: { ...layer.size!, width: v } })} />
                  </Field>
                  <Field label="Height">
                    <NumInput value={layer.size.height} min={1}
                      onChange={(v) => update({ size: { ...layer.size!, height: v } })} />
                  </Field>
                </Row2>
                <Field label="Object Fit">
                  <select
                    value={layer.image.objectFit ?? 'contain'}
                    onChange={(e) => update({
                      image: { ...layer.image!, objectFit: e.target.value as 'fill' | 'contain' | 'cover' | 'none' },
                    })}
                    className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200
                               focus:outline-none focus:border-blue-500"
                  >
                    {(['contain', 'cover', 'fill', 'none'] as const).map((v) =>
                      <option key={v} value={v}>{v}</option>
                    )}
                  </select>
                </Field>
              </Section>
            )}

            {/* ── Video properties ──────────────────────────────────── */}
            {layer.type === 'video' && layer.video && layer.size && (
              <Section title="Video">
                <Row2>
                  <Field label="Width">
                    <NumInput value={layer.size.width} min={1}
                      onChange={(v) => update({ size: { ...layer.size!, width: v } })} />
                  </Field>
                  <Field label="Height">
                    <NumInput value={layer.size.height} min={1}
                      onChange={(v) => update({ size: { ...layer.size!, height: v } })} />
                  </Field>
                </Row2>
                <Row2>
                  <Field label="Volume">
                    <NumInput value={layer.video.volume ?? 1} min={0} max={1} step={0.1}
                      onChange={(v) => update({ video: { ...layer.video!, volume: v } })} />
                  </Field>
                  <Field label="Trim Start (ms)">
                    <NumInput value={layer.video.startOffsetMs ?? 0} min={0}
                      onChange={(v) => update({ video: { ...layer.video!, startOffsetMs: v } })} />
                  </Field>
                </Row2>
                <Row2>
                  <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                    <input type="checkbox" checked={!!layer.video.muted}
                      onChange={(e) => update({ video: { ...layer.video!, muted: e.target.checked } })}
                      className="accent-blue-500" />
                    Muted
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                    <input type="checkbox" checked={!!layer.video.loop}
                      onChange={(e) => update({ video: { ...layer.video!, loop: e.target.checked } })}
                      className="accent-blue-500" />
                    Loop
                  </label>
                </Row2>
              </Section>
            )}

            {/* ── Audio properties ──────────────────────────────────── */}
            {layer.type === 'audio' && layer.audio && (
              <Section title="Audio">
                <Row2>
                  <Field label="Volume">
                    <NumInput value={layer.audio.volume ?? 1} min={0} max={1} step={0.1}
                      onChange={(v) => update({ audio: { ...layer.audio!, volume: v } })} />
                  </Field>
                  <Field label="Trim Start (ms)">
                    <NumInput value={layer.audio.startOffsetMs ?? 0} min={0}
                      onChange={(v) => update({ audio: { ...layer.audio!, startOffsetMs: v } })} />
                  </Field>
                </Row2>
                <Row2>
                  <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                    <input type="checkbox" checked={!!layer.audio.muted}
                      onChange={(e) => update({ audio: { ...layer.audio!, muted: e.target.checked } })}
                      className="accent-blue-500" />
                    Muted
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                    <input type="checkbox" checked={!!layer.audio.loop}
                      onChange={(e) => update({ audio: { ...layer.audio!, loop: e.target.checked } })}
                      className="accent-blue-500" />
                    Loop
                  </label>
                </Row2>
              </Section>
            )}

            {/* ── Path Stroke (layer.type === 'pathStroke') ─────────── */}
            {layer.type === 'pathStroke' && layer.pathStroke && (
              <PathStrokeSection
                data={layer.pathStroke}
                onChange={(next) => update({ pathStroke: next })}
              />
            )}
            </>)}{/* end of Properties tab */}

            {/* ── Interactive Runtime (Interact tab) ─────────────────── */}
            {layer.type !== 'group' && layer.type !== 'repeater' && activeTab === 'interact' && (<>
            <Section title="Interactive">
              <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={layer.tappable ?? false}
                  onChange={(e) => update({ tappable: e.target.checked || undefined })}
                  className="accent-blue-500"
                />
                Tappable — fires &apos;click&apos; triggers at runtime
              </label>

              <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={layer.draggable ?? false}
                  onChange={(e) => update({
                    draggable: e.target.checked || undefined,
                    dragConfig: e.target.checked ? (layer.dragConfig ?? { axis: 'both', range: 200 }) : undefined,
                  })}
                  className="accent-blue-500"
                />
                <span className="flex-1">
                  <span className="font-medium">Draggable</span>
                  <span className="block text-[10px] text-gray-500">
                    In preview mode, the layer follows your cursor when dragged.
                  </span>
                </span>
              </label>

              {layer.draggable && (
                <div className="border border-amber-700/50 bg-amber-950/30 rounded p-2 space-y-1.5">
                  {/* ── Scrubs Timeline (THE main feature) ──────────── */}
                  <Field label="🎬 Drag controls Timeline">
                    <select
                      value={layer.dragConfig?.scrubsTimeline ?? ''}
                      onChange={(e) => update({
                        dragConfig: {
                          ...(layer.dragConfig ?? {}),
                          scrubsTimeline: e.target.value || undefined,
                        },
                      })}
                      className="w-full bg-gray-800 border border-amber-600/60 rounded px-1.5 py-1 text-[11px] text-gray-200
                                 focus:outline-none focus:border-amber-500"
                    >
                      <option value="">(none — just follow cursor)</option>
                      {allTimelines.map(t => (
                        <option key={t.id} value={t.id}>{t.id} ({t.durationMs}ms)</option>
                      ))}
                    </select>
                  </Field>

                  {layer.dragConfig?.scrubsTimeline ? (
                    <div className="text-[10px] text-amber-200/90 leading-snug border-t border-amber-800/40 pt-1.5">
                      ✓ <strong>Scrub mode active.</strong> Animate this layer&apos;s
                      <code className="text-amber-100"> transform.x </code>
                      or <code className="text-amber-100">transform.y</code> on the timeline above
                      (e.g. 0 → 200). Click <strong>▶ Preview</strong> in the toolbar, then drag this
                      layer — it moves along its keyframe path AND scrubs the timeline. All other
                      layers&apos; animations on that timeline play in sync.
                    </div>
                  ) : (
                    <div className="text-[10px] text-amber-200/70 leading-snug">
                      💡 Click <strong className="text-amber-100">▶ Preview</strong> in the toolbar,
                      then drag — layer follows your cursor. Pick a timeline above to scrub-control
                      a full keyframe animation instead.
                    </div>
                  )}
                  <details className="text-[10px] text-gray-400">
                    <summary className="cursor-pointer hover:text-gray-300 select-none">⚙ Advanced drag config…</summary>
                    <div className="pt-1.5 space-y-1.5">
                      <Row2>
                        <Field label="Axis">
                          <select
                            value={layer.dragConfig?.axis ?? 'both'}
                            onChange={(e) => update({
                              dragConfig: { ...(layer.dragConfig ?? {}), axis: e.target.value as 'x' | 'y' | 'both' },
                            })}
                            className="w-full bg-gray-800 border border-gray-600 rounded px-1.5 py-1 text-[11px] text-gray-200
                                       focus:outline-none focus:border-blue-500"
                          >
                            <option value="both">Both (X+Y)</option>
                            <option value="x">X only</option>
                            <option value="y">Y only</option>
                          </select>
                        </Field>
                        <Field label={layer.dragConfig?.scrubsTimeline ? 'Range (auto from keyframes)' : 'Range (px → 1.0)'}>
                          <NumInput value={layer.dragConfig?.range ?? 200} min={1} max={2000}
                            onChange={(v) => update({
                              dragConfig: { ...(layer.dragConfig ?? {}), range: v },
                            })} />
                        </Field>
                      </Row2>
                      {parameters.length > 0 && (
                        <Field label="Also sets parameter (optional)">
                          <select
                            value={layer.dragConfig?.setsParameter ?? ''}
                            onChange={(e) => update({
                              dragConfig: {
                                ...(layer.dragConfig ?? {}),
                                setsParameter: e.target.value || undefined,
                              },
                            })}
                            className="w-full bg-gray-800 border border-gray-600 rounded px-1.5 py-1 text-[11px] text-gray-200
                                       focus:outline-none focus:border-blue-500"
                          >
                            <option value="">(none)</option>
                            {parameters.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </Field>
                      )}
                      <p className="text-[9px] text-gray-500 leading-snug">
                        Drag fires <code>dragStart / Move / End</code> trigger events too,
                        so you can author segment-play, parameter changes, etc. via the Events panel.
                      </p>
                    </div>
                  </details>
                </div>
              )}

              {parameters.length > 0 && (
                <ParamBindingsEditor
                  layer={layer}
                  parameters={parameters}
                  onChange={(paramBindings) => update({ paramBindings })}
                />
              )}
            </Section>
            </>)}{/* end of Interact tab */}

            {/* ── Masks + Plugin Effects (Effects tab) ──────────────── */}
            {layer.type !== 'group' && layer.type !== 'repeater' && activeTab === 'effects' && (<>
            <Section title="Masks">
              <div className="text-[10px] text-gray-500 leading-snug pb-1">
                Use another layer&apos;s shape to cut out / reveal this layer.
                Multiple masks composite in array order.
              </div>
              <div className="flex gap-1.5 pb-1.5">
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const maskId = e.target.value
                    if (!maskId) return
                    update({
                      masks: [
                        ...(layer.masks ?? []),
                        { id: `mask_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                          maskLayerId: maskId, mode: 'add', opacity: 1 },
                      ],
                    })
                    e.target.value = ''
                  }}
                  className="flex-1 bg-gray-800 border border-gray-600 rounded px-1.5 py-1 text-[11px] text-gray-200
                             focus:outline-none focus:border-blue-500"
                >
                  <option value="" disabled>+ Add mask from layer…</option>
                  {sceneLite.layers
                    .filter(l => l.id !== layer.id && l.type !== 'audio')
                    .map(l => (
                      <option key={l.id} value={l.id}>{l.name} ({l.type})</option>
                    ))}
                </select>
              </div>
              {(layer.masks ?? []).map((mask, i) => {
                const ml = sceneLite.layers.find(l => l.id === mask.maskLayerId)
                return (
                  <div key={mask.id} className="border border-gray-700 rounded p-1.5 space-y-1.5 mb-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-gray-300 truncate">
                        {ml?.name ?? '(missing layer)'}
                      </span>
                      <button
                        onClick={() => update({
                          masks: layer.masks!.filter((_, idx) => idx !== i),
                        })}
                        className="text-[10px] text-gray-500 hover:text-red-400"
                      >✕</button>
                    </div>
                    <Row2>
                      <Field label="Mode">
                        <select
                          value={mask.mode}
                          onChange={(e) => update({
                            masks: layer.masks!.map((m, idx) => idx === i
                              ? { ...m, mode: e.target.value as 'add'|'subtract'|'intersect' } : m),
                          })}
                          className="w-full bg-gray-800 border border-gray-600 rounded px-1.5 py-1 text-[11px] text-gray-200
                                     focus:outline-none focus:border-blue-500"
                        >
                          <option value="add">Add</option>
                          <option value="subtract">Subtract</option>
                          <option value="intersect">Intersect</option>
                        </select>
                      </Field>
                      <Field label="Opacity">
                        <NumInput value={mask.opacity ?? 1} min={0} max={1} step={0.05}
                          onChange={(v) => update({
                            masks: layer.masks!.map((m, idx) => idx === i ? { ...m, opacity: v } : m),
                          })} />
                      </Field>
                    </Row2>
                    <Row2>
                      <Field label="Feather (px)">
                        <NumInput value={mask.feather ?? 0} min={0} max={50} step={1}
                          onChange={(v) => update({
                            masks: layer.masks!.map((m, idx) => idx === i ? { ...m, feather: v } : m),
                          })} />
                      </Field>
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-gray-500 uppercase tracking-wide">Inverted</span>
                        <label className="flex items-center h-[26px]">
                          <input
                            type="checkbox"
                            checked={!!mask.inverted}
                            onChange={(e) => update({
                              masks: layer.masks!.map((m, idx) => idx === i ? { ...m, inverted: e.target.checked } : m),
                            })}
                            className="accent-blue-500"
                          />
                        </label>
                      </label>
                    </Row2>
                  </div>
                )
              })}
            </Section>

            {/* ── Plugin Effects (Glow / Blur / Shadow / Inner / Tint / Vignette) ─── */}
            <Section title="Plugin Effects">
              <div className="text-[10px] text-gray-500 leading-snug pb-1">
                Effects render in chain order — earlier effects are processed first.
              </div>
              <div className="flex gap-1 flex-wrap pb-1.5">
                {([
                  ['blur',        '💧 Blur'],
                  ['glow',        '✨ Glow'],
                  ['shadow',      '⤵ Shadow'],
                  ['innerShadow', '⌧ Inner Shadow'],
                  ['innerGlow',   '◐ Inner Glow'],
                  ['tint',        '🎨 Tint'],
                  ['vignette',    '⊙ Vignette'],
                ] as Array<[PluginEffectType, string]>).map(([type, label]) => (
                  <button
                    key={type}
                    onClick={() => update({
                      effectsChain: [...(layer.effectsChain ?? []), defaultEffectFor(type)],
                    })}
                    className="px-1.5 py-1 text-[10px] rounded bg-gray-800 hover:bg-blue-600 text-gray-200 transition-colors"
                  >
                    + {label}
                  </button>
                ))}
              </div>
              {(layer.effectsChain ?? []).map((eff, i) => (
                <div key={eff.id} className="border border-gray-700 rounded p-1.5 space-y-1.5 mb-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={eff.enabled}
                        onChange={(e) => update({
                          effectsChain: layer.effectsChain!.map((x, idx) => idx === i ? { ...x, enabled: e.target.checked } : x),
                        })}
                        className="accent-blue-500"
                      />
                      <span className="text-[11px] font-medium capitalize text-gray-300">{eff.type}</span>
                    </div>
                    <button
                      onClick={() => update({
                        effectsChain: layer.effectsChain!.filter((_, idx) => idx !== i),
                      })}
                      className="text-[10px] text-gray-500 hover:text-red-400"
                    >✕</button>
                  </div>
                  {/* Param fields per effect type */}
                  {eff.type === 'blur' && (
                    <Field label="Radius (px)">
                      <NumInput value={(eff.params.radius as number) ?? 4} min={0} max={50}
                        onChange={(v) => update({
                          effectsChain: layer.effectsChain!.map((x, idx) => idx === i
                            ? { ...x, params: { ...x.params, radius: v } } : x),
                        })} />
                    </Field>
                  )}
                  {eff.type === 'glow' && (<>
                    <Row2>
                      <Field label="Color">
                        <ColorInput value={(eff.params.color as string) ?? '#FFFFFF'}
                          onChange={(v) => update({
                            effectsChain: layer.effectsChain!.map((x, idx) => idx === i
                              ? { ...x, params: { ...x.params, color: v } } : x),
                          })} />
                      </Field>
                      <Field label="Radius">
                        <NumInput value={(eff.params.radius as number) ?? 8} min={0} max={50}
                          onChange={(v) => update({
                            effectsChain: layer.effectsChain!.map((x, idx) => idx === i
                              ? { ...x, params: { ...x.params, radius: v } } : x),
                          })} />
                      </Field>
                    </Row2>
                    <Field label="Intensity (0-1)">
                      <NumInput value={(eff.params.intensity as number) ?? 0.8} min={0} max={1} step={0.05}
                        onChange={(v) => update({
                          effectsChain: layer.effectsChain!.map((x, idx) => idx === i
                            ? { ...x, params: { ...x.params, intensity: v } } : x),
                        })} />
                    </Field>
                  </>)}
                  {eff.type === 'shadow' && (<>
                    <Row2>
                      <Field label="Color">
                        <ColorInput value={(eff.params.color as string) ?? '#000000'}
                          onChange={(v) => update({
                            effectsChain: layer.effectsChain!.map((x, idx) => idx === i
                              ? { ...x, params: { ...x.params, color: v } } : x),
                          })} />
                      </Field>
                      <Field label="Blur">
                        <NumInput value={(eff.params.blur as number) ?? 4} min={0} max={50}
                          onChange={(v) => update({
                            effectsChain: layer.effectsChain!.map((x, idx) => idx === i
                              ? { ...x, params: { ...x.params, blur: v } } : x),
                          })} />
                      </Field>
                    </Row2>
                    <Row2>
                      <Field label="Offset X">
                        <NumInput value={(eff.params.offsetX as number) ?? 2} min={-50} max={50}
                          onChange={(v) => update({
                            effectsChain: layer.effectsChain!.map((x, idx) => idx === i
                              ? { ...x, params: { ...x.params, offsetX: v } } : x),
                          })} />
                      </Field>
                      <Field label="Offset Y">
                        <NumInput value={(eff.params.offsetY as number) ?? 2} min={-50} max={50}
                          onChange={(v) => update({
                            effectsChain: layer.effectsChain!.map((x, idx) => idx === i
                              ? { ...x, params: { ...x.params, offsetY: v } } : x),
                          })} />
                      </Field>
                    </Row2>
                    <Field label="Opacity (0-1)">
                      <NumInput value={(eff.params.opacity as number) ?? 0.5} min={0} max={1} step={0.05}
                        onChange={(v) => update({
                          effectsChain: layer.effectsChain!.map((x, idx) => idx === i
                            ? { ...x, params: { ...x.params, opacity: v } } : x),
                        })} />
                    </Field>
                  </>)}
                  {eff.type === 'innerShadow' && (<>
                    <Row2>
                      <Field label="Color">
                        <ColorInput value={(eff.params.color as string) ?? '#000000'}
                          onChange={(v) => update({
                            effectsChain: layer.effectsChain!.map((x, idx) => idx === i
                              ? { ...x, params: { ...x.params, color: v } } : x),
                          })} />
                      </Field>
                      <Field label="Blur">
                        <NumInput value={(eff.params.blur as number) ?? 6} min={0} max={50}
                          onChange={(v) => update({
                            effectsChain: layer.effectsChain!.map((x, idx) => idx === i
                              ? { ...x, params: { ...x.params, blur: v } } : x),
                          })} />
                      </Field>
                    </Row2>
                    <Row2>
                      <Field label="Offset X">
                        <NumInput value={(eff.params.offsetX as number) ?? 2} min={-50} max={50}
                          onChange={(v) => update({
                            effectsChain: layer.effectsChain!.map((x, idx) => idx === i
                              ? { ...x, params: { ...x.params, offsetX: v } } : x),
                          })} />
                      </Field>
                      <Field label="Offset Y">
                        <NumInput value={(eff.params.offsetY as number) ?? 2} min={-50} max={50}
                          onChange={(v) => update({
                            effectsChain: layer.effectsChain!.map((x, idx) => idx === i
                              ? { ...x, params: { ...x.params, offsetY: v } } : x),
                          })} />
                      </Field>
                    </Row2>
                    <Field label="Opacity (0-1)">
                      <NumInput value={(eff.params.opacity as number) ?? 0.5} min={0} max={1} step={0.05}
                        onChange={(v) => update({
                          effectsChain: layer.effectsChain!.map((x, idx) => idx === i
                            ? { ...x, params: { ...x.params, opacity: v } } : x),
                        })} />
                    </Field>
                  </>)}
                  {eff.type === 'innerGlow' && (<>
                    <Row2>
                      <Field label="Color">
                        <ColorInput value={(eff.params.color as string) ?? '#FFFFFF'}
                          onChange={(v) => update({
                            effectsChain: layer.effectsChain!.map((x, idx) => idx === i
                              ? { ...x, params: { ...x.params, color: v } } : x),
                          })} />
                      </Field>
                      <Field label="Radius">
                        <NumInput value={(eff.params.radius as number) ?? 10} min={0} max={80}
                          onChange={(v) => update({
                            effectsChain: layer.effectsChain!.map((x, idx) => idx === i
                              ? { ...x, params: { ...x.params, radius: v } } : x),
                          })} />
                      </Field>
                    </Row2>
                    <Field label="Intensity (0-1)">
                      <NumInput value={(eff.params.intensity as number) ?? 0.8} min={0} max={1} step={0.05}
                        onChange={(v) => update({
                          effectsChain: layer.effectsChain!.map((x, idx) => idx === i
                            ? { ...x, params: { ...x.params, intensity: v } } : x),
                        })} />
                    </Field>
                  </>)}
                  {eff.type === 'tint' && (<>
                    <Row2>
                      <Field label="Color">
                        <ColorInput value={(eff.params.color as string) ?? '#3B82F6'}
                          onChange={(v) => update({
                            effectsChain: layer.effectsChain!.map((x, idx) => idx === i
                              ? { ...x, params: { ...x.params, color: v } } : x),
                          })} />
                      </Field>
                      <Field label="Strength (0-1)">
                        <NumInput value={(eff.params.strength as number) ?? 0.5} min={0} max={1} step={0.05}
                          onChange={(v) => update({
                            effectsChain: layer.effectsChain!.map((x, idx) => idx === i
                              ? { ...x, params: { ...x.params, strength: v } } : x),
                          })} />
                      </Field>
                    </Row2>
                    <Field label="Blend">
                      <select
                        value={(eff.params.blend as string) ?? 'overlay'}
                        onChange={(e) => update({
                          effectsChain: layer.effectsChain!.map((x, idx) => idx === i
                            ? { ...x, params: { ...x.params, blend: e.target.value } } : x),
                        })}
                        className="w-full bg-gray-800 border border-gray-600 rounded px-1.5 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-blue-500"
                      >
                        <option value="multiply">Multiply (darken)</option>
                        <option value="screen">Screen (lighten)</option>
                        <option value="overlay">Overlay (contrast)</option>
                        <option value="color">Color (hue replace)</option>
                      </select>
                    </Field>
                  </>)}
                  {eff.type === 'vignette' && (<>
                    <Row2>
                      <Field label="Color">
                        <ColorInput value={(eff.params.color as string) ?? '#000000'}
                          onChange={(v) => update({
                            effectsChain: layer.effectsChain!.map((x, idx) => idx === i
                              ? { ...x, params: { ...x.params, color: v } } : x),
                          })} />
                      </Field>
                      <Field label="Strength (0-1)">
                        <NumInput value={(eff.params.strength as number) ?? 0.5} min={0} max={1} step={0.05}
                          onChange={(v) => update({
                            effectsChain: layer.effectsChain!.map((x, idx) => idx === i
                              ? { ...x, params: { ...x.params, strength: v } } : x),
                          })} />
                      </Field>
                    </Row2>
                    <Field label="Inner Stop (0-1, where vignette starts)">
                      <NumInput value={(eff.params.innerStop as number) ?? 0.4} min={0} max={1} step={0.05}
                        onChange={(v) => update({
                          effectsChain: layer.effectsChain!.map((x, idx) => idx === i
                            ? { ...x, params: { ...x.params, innerStop: v } } : x),
                        })} />
                    </Field>
                  </>)}
                </div>
              ))}
            </Section>

            {/* ── Motion Blur ──────────────────────────────────────────── */}
            {(() => {
              const mb = layer.motionBlur
              const updateMB = (patch: Partial<import('@/lib/types/effects').MotionBlurConfig>) =>
                update({ motionBlur: { ...(mb ?? DEFAULT_MOTION_BLUR), ...patch } })
              return (
                <Section title="Motion Blur">
                  <Row2>
                    <label className="flex items-center gap-1.5 text-[11px] text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={mb?.enabled ?? false}
                        onChange={(e) => updateMB({ enabled: e.target.checked })}
                        className="accent-blue-500"
                      />
                      Enabled
                    </label>
                  </Row2>
                  {mb?.enabled && (<>
                    <Field label="Trail Count (3–12)">
                      <NumInput value={mb.trailCount} min={3} max={12} step={1}
                        onChange={(v) => updateMB({ trailCount: Math.round(v) })} />
                    </Field>
                    <Field label="Frame Interval ms (0=auto)">
                      <NumInput value={mb.frameInterval} min={0} max={200} step={1}
                        onChange={(v) => updateMB({ frameInterval: v })} />
                    </Field>
                    <Field label="Max Opacity (0–1)">
                      <NumInput value={mb.maxOpacity} min={0} max={1} step={0.05}
                        onChange={(v) => updateMB({ maxOpacity: v })} />
                    </Field>
                    <Field label="Speed Threshold (px)">
                      <NumInput value={mb.velocityThreshold} min={0} max={50} step={0.1}
                        onChange={(v) => updateMB({ velocityThreshold: v })} />
                    </Field>
                    {/* TODO: Bake system incomplete — time-shifted keyframe logic
                        needs further testing before enabling. Re-enable once
                        makeBakeMotionBlurCmd is verified end-to-end. */}
                    <div className="flex flex-col gap-1 pt-1">
                      <button
                        disabled
                        title="Bake system coming soon"
                        className="w-full px-2 py-1 text-[11px] bg-gray-700 text-gray-500 rounded cursor-not-allowed"
                      >
                        Bake Motion Blur (coming soon)
                      </button>
                    </div>
                  </>)}
                </Section>
              )
            })()}
            </>)}{/* end of Effects tab */}

            {/* ── Follow Path + Motion Path (Motion tab) ────────────── */}
            {layer.type !== 'group' && layer.type !== 'repeater' && activeTab === 'motion' && (<>
            <Section title="Follow Path">
              <div className="text-[10px] text-gray-500 leading-snug pb-1">
                Bind this layer&apos;s position to a path layer&apos;s curve.
                Progress is driven by the timeline automatically — keyframe
                <span className="text-gray-400"> followPath.progress</span> to override.
              </div>
              <Field label="Path Layer">
                <select
                  value={layer.followPath?.pathLayerId ?? ''}
                  onChange={(e) => {
                    const id = e.target.value
                    if (!id) {
                      update({ followPath: undefined })
                    } else {
                      update({
                        followPath: {
                          ...layer.followPath,
                          pathLayerId: id,
                          progress: layer.followPath?.progress ?? 0,
                        },
                      })
                    }
                  }}
                  className="w-full bg-gray-800 border border-gray-600 rounded px-1.5 py-1 text-[11px] text-gray-200
                             focus:outline-none focus:border-blue-500"
                >
                  <option value="">(none)</option>
                  {sceneLite.layers
                    .filter(l => l.type === 'path' && l.path && l.id !== layer.id)
                    .map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                </select>
              </Field>
              {layer.followPath?.pathLayerId && (<>
                <Field label="Progress (0-1)">
                  <NumInput value={layer.followPath.progress ?? 0} min={0} max={1} step={0.01}
                    onChange={(v) => update({
                      followPath: { ...layer.followPath!, progress: v },
                    })} />
                </Field>
                <p className="text-[10px] text-gray-500 leading-snug pt-0.5">
                  Animated by the <span className="text-gray-400">followPath.progress</span> track
                  on the timeline — 0 → 1 keyframes are auto-seeded when the path is
                  first assigned. Drag the keyframes to retime the motion.
                </p>
                <Row2>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-gray-500 uppercase tracking-wide">Orient to Path</span>
                    <label className="flex items-center h-[26px]">
                      <input
                        type="checkbox"
                        checked={!!layer.followPath.orientToPath}
                        onChange={(e) => update({
                          followPath: { ...layer.followPath!, orientToPath: e.target.checked },
                        })}
                        className="accent-blue-500"
                      />
                    </label>
                  </label>
                  <Field label="Rotation Offset °">
                    <NumInput value={layer.followPath.rotationOffset ?? 0} min={-360} max={360}
                      onChange={(v) => update({
                        followPath: { ...layer.followPath!, rotationOffset: v },
                      })} />
                  </Field>
                </Row2>
                <Field label="Perpendicular Offset (px)">
                  <NumInput value={layer.followPath.perpendicularOffset ?? 0} min={-200} max={200}
                    onChange={(v) => update({
                      followPath: { ...layer.followPath!, perpendicularOffset: v },
                    })} />
                </Field>
              </>)}
            </Section>

            {/* ── Motion Path ───────────────────────────────────────── */}
            <Section title="Motion Path">
              <Field label="SVG Path (use motionPath.offset track to animate)">
                <textarea
                  value={layer.motionPath?.pathData ?? ''}
                  onChange={(e) => update({
                    motionPath: e.target.value.trim()
                      ? { ...layer.motionPath, pathData: e.target.value, autoRotate: layer.motionPath?.autoRotate }
                      : undefined,
                  })}
                  rows={2}
                  placeholder='e.g. "M 0 0 C 100 50 200 50 300 0"'
                  className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-[11px] text-gray-200
                             focus:outline-none focus:border-blue-500 font-mono resize-none"
                />
              </Field>
              {layer.motionPath && (
                <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!layer.motionPath.autoRotate}
                    onChange={(e) => update({
                      motionPath: { ...layer.motionPath!, autoRotate: e.target.checked },
                    })}
                    className="accent-blue-500"
                  />
                  Auto-rotate to path tangent
                </label>
              )}
            </Section>
            </>)}{/* end of Motion tab */}

            {/* Group / Repeater: helpful tab content reminder */}
            {(layer.type === 'group' || layer.type === 'repeater') && activeTab !== 'properties' && (
              <p className="text-xs text-gray-600 text-center py-8 italic">
                {layer.type === 'group' ? 'Groups' : 'Repeaters'} only use the Properties tab.
              </p>
            )}
          </>
        )}

        {!layer && (
          <p className="text-xs text-gray-600 text-center py-8">
            Canvas'ta bir katman seç<br />veya soldan ekle.
          </p>
        )}
      </div>
    </aside>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PathStroke section
// ─────────────────────────────────────────────────────────────────────────────

const PATH_TYPES: PathShapeType[] = ['ellipse', 'circle', 'rect', 'custom']
const STROKE_CAPS: StrokeCap[]    = ['butt', 'round', 'square']
const TRIM_MODES:  PathTrimMode[] = ['static', 'movingSegment']

function PathStrokeSection({
  data, onChange,
}: {
  data: PathStrokeData
  onChange: (next: PathStrokeData) => void
}) {
  function patchPath  (p: Partial<PathStrokeData['path']>)   { onChange({ ...data, path:   { ...data.path,   ...p } }) }
  function patchStroke(p: Partial<PathStrokeData['stroke']>) { onChange({ ...data, stroke: { ...data.stroke, ...p } }) }
  function patchTrim  (p: Partial<PathStrokeData['trim']>)   { onChange({ ...data, trim:   { ...data.trim,   ...p } }) }

  return (
    <Section title="Path Stroke">
      <Row2>
        <Field label="Path Type">
          <select
            value={data.path.shapeType}
            onChange={(e) => patchPath({ shapeType: e.target.value as PathShapeType })}
            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
          >
            {PATH_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Stroke Cap">
          <select
            value={data.stroke.cap ?? 'round'}
            onChange={(e) => patchStroke({ cap: e.target.value as StrokeCap })}
            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
          >
            {STROKE_CAPS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
      </Row2>

      {data.path.shapeType !== 'custom' ? (
        <Row2>
          <Field label="Width">
            <NumInput value={data.path.width ?? 100} min={1}
              onChange={(v) => patchPath({ width: v })} />
          </Field>
          <Field label="Height">
            <NumInput value={data.path.height ?? 100} min={1}
              onChange={(v) => patchPath({ height: v })} />
          </Field>
        </Row2>
      ) : (
        <Field label="Custom SVG path">
          <textarea
            value={data.path.customPath ?? ''}
            onChange={(e) => patchPath({ customPath: e.target.value })}
            rows={2}
            placeholder='e.g. "M 0 0 Q 50 -40 100 0 T 200 0"'
            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-blue-500 font-mono resize-none"
          />
        </Field>
      )}

      <Row2>
        <Field label="Stroke Width">
          <NumInput value={data.stroke.width} min={0} step={0.5}
            onChange={(v) => patchStroke({ width: v })} />
        </Field>
        <Field label="Stroke Color">
          <ColorInput value={data.stroke.color}
            onChange={(v) => patchStroke({ color: v })} />
        </Field>
      </Row2>

      <Row2>
        <Field label="Trim Mode">
          <select
            value={data.trim.mode}
            onChange={(e) => patchTrim({ mode: e.target.value as PathTrimMode })}
            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
          >
            {TRIM_MODES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Segment Length">
          <NumInput value={data.trim.segmentLength ?? 0.2} min={0} max={1} step={0.01}
            onChange={(v) => patchTrim({ segmentLength: v })} />
        </Field>
      </Row2>

      <Field label="Trim Offset (animate via track)">
        <input
          type="range" min={0} max={1} step={0.001}
          value={data.trim.offset}
          onChange={(e) => patchTrim({ offset: Number(e.target.value) })}
          className="w-full accent-blue-500"
        />
      </Field>

      <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
        <input
          type="checkbox"
          checked={!!data.stroke.glow}
          onChange={(e) => patchStroke({
            glow: e.target.checked ? { color: data.stroke.color, blur: 16 } : undefined,
          })}
          className="accent-blue-500"
        />
        Glow effect
      </label>
      {data.stroke.glow && (
        <Row2>
          <Field label="Glow Color">
            <ColorInput value={data.stroke.glow.color}
              onChange={(v) => patchStroke({ glow: { ...data.stroke.glow!, color: v } })} />
          </Field>
          <Field label="Glow Blur">
            <NumInput value={data.stroke.glow.blur} min={0} max={100}
              onChange={(v) => patchStroke({ glow: { ...data.stroke.glow!, blur: v } })} />
          </Field>
        </Row2>
      )}
    </Section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Parameter bindings editor (property → paramId)
// ─────────────────────────────────────────────────────────────────────────────

function ParamBindingsEditor({
  layer, parameters, onChange,
}: {
  layer:      Layer
  parameters: SceneParameter[]
  onChange:   (next: Record<string, string> | undefined) => void
}) {
  const bindings = layer.paramBindings ?? {}
  const entries  = Object.entries(bindings)

  function add(property: string, paramId: string) {
    const next = { ...bindings, [property]: paramId }
    onChange(next)
  }
  function remove(property: string) {
    const next = { ...bindings }
    delete next[property]
    onChange(Object.keys(next).length ? next : undefined)
  }

  return (
    <div className="mt-2">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
        Parameter Bindings
      </div>
      {entries.length === 0 && (
        <div className="text-[10px] text-gray-600 italic mb-1">
          No bindings yet — link a layer property to a parameter.
        </div>
      )}
      {entries.map(([property, paramId]) => (
        <div key={property} className="flex items-center gap-1 mb-1">
          <span className="text-[10px] text-gray-300 font-mono flex-1 truncate">
            {property} ← {'{' + paramId + '}'}
          </span>
          <button
            className="text-[10px] text-gray-500 hover:text-rose-400"
            onClick={() => remove(property)}
            title="Remove binding"
          >
            ✕
          </button>
        </div>
      ))}

      {/* Quick add row */}
      <div className="flex items-center gap-1 mt-1">
        <input
          placeholder="property (e.g. opacity)"
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-[10px] text-gray-200 outline-none font-mono"
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            const input  = e.currentTarget
            const select = input.parentElement?.querySelector('select') as HTMLSelectElement | null
            const prop   = input.value.trim()
            const pid    = select?.value
            if (prop && pid) {
              add(prop, pid)
              input.value = ''
            }
          }}
        />
        <select className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-200 outline-none">
          <option value="">param…</option>
          {parameters.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="text-[9px] text-gray-600 mt-1">
        Press Enter to add. Numeric params override numeric properties; for text
        use <span className="font-mono">{'{paramId}'}</span> directly in the value.
      </div>
    </div>
  )
}
