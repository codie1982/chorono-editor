'use client'
import type {
  Layer, Composition,
  PathStrokeData, PathShapeType, PathTrimMode, StrokeCap,
  SceneParameter,
} from '@/lib/types'

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
}

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
  return (
    <input
      type="number"
      value={value}
      min={min} max={max} step={step}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200
                 focus:outline-none focus:border-blue-500 [appearance:textfield]
                 [&::-webkit-inner-spin-button]:appearance-none"
    />
  )
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-8 h-7 rounded border border-gray-600 bg-transparent cursor-pointer p-0.5"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200
                   focus:outline-none focus:border-blue-500 font-mono uppercase"
        maxLength={7}
      />
    </div>
  )
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
  parameters = [],
}: Props) {

  const update = (partial: Partial<Layer>) => layer && onLayerChange({ ...layer, ...partial })
  const updateTransform = (key: keyof Layer['transform'], val: number) =>
    layer && update({ transform: { ...layer.transform, [key]: val } })

  return (
    <aside className="flex flex-col flex-1 min-h-0 bg-gray-900 overflow-y-auto">
      <div className="px-3 py-2 border-b border-gray-700 shrink-0">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {layer ? `Layer: ${layer.id}` : 'Properties'}
        </span>
      </div>

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
            <Field label="Bg Color">
              <ColorInput value={composition.backgroundColor}
                onChange={(v) => onCompositionChange({ ...composition, backgroundColor: v })} />
            </Field>
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
            <Section title="Transform">
              <Row2>
                <Field label="X">
                  <NumInput value={layer.transform.x} onChange={(v) => updateTransform('x', v)} />
                </Field>
                <Field label="Y">
                  <NumInput value={layer.transform.y} onChange={(v) => updateTransform('y', v)} />
                </Field>
              </Row2>
              <Row2>
                <Field label="Scale X">
                  <NumInput value={layer.transform.scaleX} step={0.01} min={0.01}
                    onChange={(v) => updateTransform('scaleX', v)} />
                </Field>
                <Field label="Scale Y">
                  <NumInput value={layer.transform.scaleY} step={0.01} min={0.01}
                    onChange={(v) => updateTransform('scaleY', v)} />
                </Field>
              </Row2>
              <Field label="Rotation (deg)">
                <NumInput value={layer.transform.rotationDeg} min={-360} max={360}
                  onChange={(v) => updateTransform('rotationDeg', v)} />
              </Field>
              <Row2>
                <Field label="Anchor X">
                  <NumInput value={layer.transform.anchorX}
                    onChange={(v) => updateTransform('anchorX', v)} />
                </Field>
                <Field label="Anchor Y">
                  <NumInput value={layer.transform.anchorY}
                    onChange={(v) => updateTransform('anchorY', v)} />
                </Field>
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
              <Field label="Opacity">
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
              </Field>
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
                <Field label="Fill Color">
                  <ColorInput value={layer.style.fill?.color ?? '#000000'}
                    onChange={(v) => update({
                      style: {
                        ...layer.style!,
                        fill: { type: 'solid', ...layer.style!.fill, color: v },
                      },
                    })} />
                </Field>
                {layer.shape === 'rect' && (
                  <Field label="Corner Radius">
                    <NumInput value={layer.style.cornerRadius ?? 0} min={0}
                      onChange={(v) => update({ style: { ...layer.style!, cornerRadius: v } })} />
                  </Field>
                )}
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
            {layer.type === 'text' && layer.text && (
              <Section title="Text">
                <Field label="Content">
                  <input
                    type="text"
                    value={layer.text.value}
                    onChange={(e) => update({ text: { ...layer.text!, value: e.target.value } })}
                    className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200
                               focus:outline-none focus:border-blue-500"
                  />
                </Field>
                <Row2>
                  <Field label="Font Size">
                    <NumInput value={layer.text.fontSize} min={4}
                      onChange={(v) => update({ text: { ...layer.text!, fontSize: v } })} />
                  </Field>
                  <Field label="Color">
                    <input type="color" value={layer.text.color}
                      onChange={(e) => update({ text: { ...layer.text!, color: e.target.value } })}
                      className="w-full h-7 rounded border border-gray-600 bg-transparent cursor-pointer p-0.5" />
                  </Field>
                </Row2>
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

            {/* ── Interactive Runtime ───────────────────────────────── */}
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

              {parameters.length > 0 && (
                <ParamBindingsEditor
                  layer={layer}
                  parameters={parameters}
                  onChange={(paramBindings) => update({ paramBindings })}
                />
              )}
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
