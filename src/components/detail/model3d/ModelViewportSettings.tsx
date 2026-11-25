'use client'
import { useState, type ReactNode } from 'react'
import type { ModelMeasurementSettings } from '@/lib/model3d/measurement/modelMeasurement'
import { fromModelMeters, toModelMeters } from '@/lib/model3d/measurement/modelMeasurement'
import type { ViewportFrame } from '@/lib/model3d/inspection/viewportFrame'
import { ModelNumber } from './ModelNumber'
import type { ModelSceneCamera } from '@/lib/model3d/source/modelSceneObjects'

type SectionId = 'camera' | 'guides' | 'frame' | 'depth' | 'units' | 'geometry'
const initialOpen = new Set<SectionId>(['camera', 'guides'])
const selectClass = 'w-full min-w-0 rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-slate-100 focus-visible:outline-2 focus-visible:outline-cyan-300'
const actionClass = 'w-full rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-left text-xs text-slate-100 hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-40'

/** A keyboard-accessible collapsible group. Mounting only expanded controls
 * keeps focus order aligned with the visible compact overlay menu. */
function SettingsSection({ id, title, expanded, onToggle, children }: {
  id: SectionId; title: string; expanded: boolean; onToggle(): void; children: ReactNode
}) {
  const contentId = `model3d-settings-${id}`
  return <div className="border-t border-slate-700 pt-1">
    <h3><button type="button" aria-expanded={expanded} aria-controls={contentId} onClick={onToggle}
      className="flex min-h-7 w-full items-center gap-2 rounded px-1 text-left text-xs font-semibold text-slate-200 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-cyan-300">
      <span aria-hidden="true" className="w-3 text-slate-400">{expanded ? '⌄' : '›'}</span>{title}
    </button></h3>
    {expanded && <div id={contentId} className="space-y-2 px-2 pb-3 pt-2">{children}</div>}
  </div>
}

/** View-local camera/overlay controls and source-owned measurement controls.
 * Sections expose only capabilities with real consumers; unavailable geometry
 * LOD is described as status rather than an inert select. */
export function ModelViewportSettings({ settings, showGrid, gridAvailable, onShowGrid, onChange, disabled, cameraPreview, onCameraPreview,
  cameras, safeArea, onSafeArea, clipNear, clipFar, onClipNear, onClipFar, frame, onFrame, onUseView, onFrameSelection }: {
  settings: ModelMeasurementSettings; showGrid: boolean; gridAvailable: boolean; onShowGrid(value: boolean): void
  onChange(patch: Partial<ModelMeasurementSettings>): void; disabled: boolean
  cameraPreview: string; onCameraPreview(value: string): void; cameras: readonly ModelSceneCamera[]
  safeArea: boolean; onSafeArea(value: boolean): void
  clipNear: number; clipFar: number; onClipNear(value: number): void; onClipFar(value: number): void
  frame: ViewportFrame; onFrame(value: ViewportFrame): void
  onUseView(): void; onFrameSelection(): void
}) {
  const [open, setOpen] = useState<ReadonlySet<SectionId>>(() => new Set(initialOpen))
  const section = (id: SectionId, title: string, children: ReactNode) => <SettingsSection id={id} title={title} expanded={open.has(id)}
    onToggle={() => setOpen(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next })}>{children}</SettingsSection>
  const grid = fromModelMeters(settings.gridBaseMeters, settings)
  return <section aria-label="3D viewport settings" className="absolute left-12 top-2 z-20 max-h-[min(33rem,calc(100%-1rem))] w-[min(19rem,calc(100%-3.5rem))] overflow-y-auto rounded border border-slate-600 bg-[#111827] p-2 text-xs text-slate-200 shadow-2xl">
    <h2 className="px-1 pb-2 text-xs font-semibold text-cyan-300">Viewport settings</h2>
    {section('camera', 'Camera', <>
      <label className="block space-y-1"><span>Preview camera</span>
        <select className={selectClass} aria-label="Camera preview" value={cameraPreview} onChange={event => onCameraPreview(event.target.value as 'inspection' | 'output')}>
          <option value="inspection">Inspection camera</option>{cameras.map(camera => <option key={camera.id} value={camera.id}>{camera.name}</option>)}
        </select></label>
      <p className="text-[11px] leading-4 text-slate-400">Choose a scene camera for preview. Orbiting its preview returns to the inspection camera.</p>
      <button type="button" disabled={disabled} className={actionClass} onClick={onUseView}>Use view for output</button>
      <button type="button" className={actionClass} onClick={onFrameSelection}>Frame selection · Z</button>
    </>)}
    {section('guides', 'Guides', <>
      <label className="flex items-center gap-2"><input type="checkbox" checked={showGrid && gridAvailable} disabled={!gridAvailable} onChange={event => onShowGrid(event.target.checked)} />Grid on viewport floor</label>
      {!gridAvailable && <p className="text-[11px] text-slate-400">The Render workspace hides the editor grid.</p>}
      <fieldset disabled={disabled} className="space-y-2">
        <ModelNumber key={`grid-${settings.unit}-${settings.pixelsPerInch}`} label={`Base grid spacing (${settings.unit})`} value={grid}
          min={fromModelMeters(.0001, settings)} max={fromModelMeters(1000, settings)}
          onChange={value => onChange({ gridBaseMeters: toModelMeters(value, settings) })} />
        <ModelNumber label="Grid subdivisions" value={settings.subdivisions} step={1} min={1} max={20}
          onChange={value => { if (Number.isInteger(value)) onChange({ subdivisions: value }) }} />
      </fieldset>
      <p className="text-[11px] leading-4 text-slate-400">Major spacing grows with zoom. Subdivisions split each major square; both use real scene units.</p>
    </>)}
    {section('frame', 'Framing', <>
      <label className="flex items-center gap-2"><input type="checkbox" checked={safeArea} onChange={event => onSafeArea(event.target.checked)} />90% safe area guide</label>
      <label className="block space-y-1"><span>Viewport shape</span>
        <select className={selectClass} aria-label="Viewport shape" value={frame} onChange={event => onFrame(event.target.value as ViewportFrame)}>
          <option value="fill">Fill window</option><option value="square">Square</option><option value="output">Output aspect ratio</option>
        </select></label>
      <p className="text-[11px] leading-4 text-slate-400">Output aspect ratio uses the composition width and height. The safe area is an editor guide only.</p>
    </>)}
    {section('depth', 'View depth', <>
      <div className="grid grid-cols-2 gap-2">
        <ModelNumber layout="column" label="Near clip (m)" value={clipNear} min={.001} max={clipFar - .001} step={.001} onChange={onClipNear} />
        <ModelNumber layout="column" label="Far clip (m)" value={clipFar} min={clipNear + .001} max={100000} step={1} onChange={onClipFar} />
      </div>
      <p className="text-[11px] leading-4 text-slate-400">Objects outside this camera distance are clipped in the editor view. Export keeps its own camera limits.</p>
    </>)}
    {section('units', 'Measurement units', <>
      <fieldset disabled={disabled} className="space-y-2">
        <label className="block space-y-1"><span>Display unit</span>
          <select aria-label="3D display unit" className={selectClass} value={settings.unit}
            onChange={event => onChange({ unit: event.target.value as ModelMeasurementSettings['unit'] })}>
            <option value="m">Metres (m)</option><option value="cm">Centimetres (cm)</option><option value="in">Inches (in)</option><option value="px">Design pixels (px)</option>
          </select></label>
        {settings.unit === 'px' && <ModelNumber label="Design pixels per inch" value={settings.pixelsPerInch} step={1} min={24} max={1200}
          onChange={value => { if (Number.isInteger(value)) onChange({ pixelsPerInch: value }) }} />}
      </fieldset>
      <p className="text-[11px] leading-4 text-slate-400">1 scene unit = 1 m. Unit changes affect displayed values; design px uses the density above.</p>
    </>)}
    {section('geometry', 'Geometry', <p className="text-[11px] leading-4 text-slate-400">Full detail is shown. LOD selection will be available when models contain generated LOD meshes.</p>)}
  </section>
}
