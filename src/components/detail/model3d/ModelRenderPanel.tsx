'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Model3DData, Model3DResource } from '@/lib/model3d/types'
import type { ModelResourceLookup } from '@/lib/model3d/inspection/types'
import { defaultModelRenderSettings, type ModelRenderSettings } from '@/lib/model3d/renderSettings/modelRenderSettings'
import { ModelNumber } from './ModelNumber'
import { activeSceneCamera } from '@/lib/model3d/source/modelSceneObjects'

const control = 'w-full rounded border border-slate-600 bg-[#1d293b] px-2 py-1.5 text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400'
const card = 'rounded-lg border border-slate-700 bg-[#101a2a] px-3 py-2'
const balanced = { pbrExposure: -.35, pbrAmbient: .5, pbrDirectional: .9, pbrEnvironment: .3 }
const legacy = { pbrExposure: 0, pbrAmbient: 1, pbrDirectional: 1, pbrEnvironment: .5 }

/** Render-only controls for the independent Chorono Render CLI. The panel
 * persists a validated request preset through the model draft, but the preview
 * URL and process status are transient. Exports use the authored output camera
 * and exclude editor overlays. No result is inserted into the 2D composition. */
export function ModelRenderPanel({ data, resource, lookup, onChange, disabled }: {
  data: Model3DData; resource?: Model3DResource; lookup: ModelResourceLookup
  onChange(data: Model3DData): void; disabled?: boolean
}) {
  const value = data.render ?? defaultModelRenderSettings()
  const cameras = data.sceneObjects?.objects.filter(object => object.kind === 'camera') ?? []
  const activeCamera = activeSceneCamera(data)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [serviceState, setServiceState] = useState('checking')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ url: string; name: string } | null>(null)
  const abort = useRef<AbortController | null>(null)
  const resultUrl = useRef<string | null>(null)
  const set = (patch: Partial<ModelRenderSettings>) => onChange({ ...data, render: { ...value, ...patch } })
  const checkConnection = useCallback(() => {
    setServiceState('checking')
    fetch('/api/model3d/render', { cache: 'no-store' }).then(response => response.json()).then(status => {
      setAvailable(status.available === true); setServiceState(status.state || 'error')
      setReason(status.available ? '' : status.reason || 'Chorono Render is not ready.')
    }).catch(() => { setAvailable(false); setServiceState('error'); setReason('Could not check the local renderer.') })
  }, [])
  useEffect(() => {
    checkConnection()
    window.addEventListener('focus', checkConnection)
    return () => { window.removeEventListener('focus', checkConnection); abort.current?.abort(); if (resultUrl.current) URL.revokeObjectURL(resultUrl.current) }
  }, [checkConnection])
  const render = async () => {
    if (!resource?.exportGlb || !activeCamera || busy || disabled) return
    const controller = new AbortController(); abort.current = controller; setBusy(true); setReason('Preparing a portable 3D frame…')
    try {
      const glb = await resource.exportGlb(data, value.width, value.height, lookup)
      if (controller.signal.aborted) return
      const body = new FormData()
      body.set('scene', new Blob([new Uint8Array(glb)], { type: 'model/gltf-binary' }), 'scene.glb')
      body.set('settings', JSON.stringify(value))
      setReason('Rendering with Chorono Render…')
      const response = await fetch('/api/model3d/render', { method: 'POST', body, signal: controller.signal })
      if (!response.ok) { const error = await response.json(); throw new Error(error.error || 'Render failed.') }
      const warnings = decodeURIComponent(response.headers.get('X-Chorono-Render-Warnings') || '')
      const blob = await response.blob()
      if (resultUrl.current) URL.revokeObjectURL(resultUrl.current)
      const url = URL.createObjectURL(blob); resultUrl.current = url
      setResult({ url, name: `chorono-3d.${value.format === 'jpeg' ? 'jpg' : value.format}` }); setReason(warnings || 'Rendered frame ready.')
    } catch (error) { if (!controller.signal.aborted) setReason(error instanceof Error ? error.message : 'Render failed.') }
    finally { if (abort.current === controller) abort.current = null; setBusy(false) }
  }
  const choice = <T extends string>(label: string, field: keyof ModelRenderSettings, options: readonly [T, string][], selected: T) =>
    <label className="block space-y-1"><span className="text-slate-400">{label}</span>
      <select aria-label={label} className={control} value={selected} onChange={event => set({ [field]: event.target.value })}>
        {options.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
      </select>
    </label>
  return <section aria-label="Chorono Render settings" className="space-y-3 text-xs text-slate-300">
    <div className={card}><label className="block space-y-1"><span className="font-medium text-cyan-300">Scene camera</span>
      <select aria-label="Render camera" className={control} value={data.sceneObjects?.activeCameraId ?? ''}
        onChange={event => onChange({ ...data, sceneObjects: { ...data.sceneObjects!, activeCameraId: event.target.value || undefined } })}>
        <option value="">Choose a camera</option>{cameras.map(camera => <option key={camera.id} value={camera.id}>{camera.name}</option>)}
      </select></label>
      {!activeCamera && <p className="mt-2 text-amber-200">Add a Camera in the viewport to render this scene. A camera with output disabled cannot render.</p>}
    </div>
    <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-[#152133] p-3">
      <span><strong className="block text-sm font-medium text-slate-100">Chorono Render</strong><span className="text-slate-400">Local render service</span></span>
      <span role="status" className={`rounded-full px-2 py-1 text-[11px] ${available ? 'bg-emerald-950 text-emerald-300' : available === false ? 'bg-amber-950 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>{serviceState === 'checking' ? 'Checking' : serviceState === 'ready' ? 'Ready' : serviceState === 'busy' ? 'Busy' : serviceState === 'not-running' ? 'Not running' : serviceState === 'incompatible' ? 'Update needed' : 'Unavailable'}</span>
    </div>
    {available === false && <div className={`${card} space-y-2`}><p className="leading-5 text-slate-300">{serviceState === 'not-running' ? 'Open Chorono Render on this computer to create a frame. Your scene stays in the editor until you choose Render frame.' : reason}</p>
      <button type="button" onClick={checkConnection} className="rounded border border-slate-600 px-3 py-1.5 text-slate-100 hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">Check connection</button></div>}
    <div className={card}><h3 className="mb-2 font-medium text-cyan-300">Engine & quality</h3><div className="space-y-2">
      {choice('Device', 'device', [['gpu', 'GPU · WebGL'], ['cpu', 'CPU · Embree']], value.device)}
      {choice('Shader', 'shader', [['pbr', 'PBR'], ['toon', 'Toon']], value.shader)}
      {choice('Anti-aliasing', 'antiAliasing', [['standard', 'Standard'], ['high', 'High']], value.antiAliasing)}
      {value.device === 'cpu' && <><ModelNumber label="Samples per pixel" value={value.samples} min={1} max={256} step={1} onChange={samples => set({ samples })} />
        <ModelNumber label="CPU threads · 0 = auto" value={value.threads} min={0} max={256} step={1} onChange={threads => set({ threads })} /></>}
      {value.device === 'gpu' && value.shader === 'toon' && choice('Toon profile', 'toonProfile', [['ramp', 'Color ramp · v3'], ['material', 'Material contours · v2'], ['legacy', 'Legacy contours · v1']], value.toonProfile)}
    </div></div>
    {value.device === 'gpu' && value.shader === 'pbr' && <details open className={card}><summary className="cursor-pointer py-1 font-medium text-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">PBR studio lighting</summary>
      <div className="space-y-2 border-t border-slate-700 pt-2">
        <label className="block space-y-1"><span>Preset base</span><select aria-label="PBR lighting preset" className={control} value={value.pbrProfile}
          onChange={event => set({ pbrProfile: event.target.value as ModelRenderSettings['pbrProfile'], ...(event.target.value === 'legacy' ? legacy : balanced) })}>
          <option value="balanced">Balanced</option><option value="legacy">Legacy studio</option></select></label>
        <button type="button" onClick={() => set({ pbrProfile: 'balanced', ...balanced })} className="rounded border border-slate-600 px-2 py-1 text-slate-200 hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">Reset to balanced</button>
        <ModelNumber label="Exposure (EV)" value={value.pbrExposure} min={-6} max={6} onChange={pbrExposure => set({ pbrExposure })} />
        <ModelNumber label="Ambient multiplier" value={value.pbrAmbient} min={0} max={4} onChange={pbrAmbient => set({ pbrAmbient })} />
        <ModelNumber label="Directional multiplier" value={value.pbrDirectional} min={0} max={4} onChange={pbrDirectional => set({ pbrDirectional })} />
        <ModelNumber label="Environment strength" value={value.pbrEnvironment} min={0} max={4} onChange={pbrEnvironment => set({ pbrEnvironment })} />
        <p className="text-[11px] leading-4 text-slate-400">Values override the preset base. These controls affect GPU PBR; CPU and Toon use their scene lighting.</p>
      </div>
    </details>}
    <details open className={card}><summary className="cursor-pointer py-1 font-medium text-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">Output image</summary>
      <div className="space-y-2 border-t border-slate-700 pt-2">
        <ModelNumber label="Width (px)" value={value.width} min={32} max={2048} step={1} onChange={width => set({ width })} />
        <ModelNumber label="Height (px)" value={value.height} min={32} max={2048} step={1} onChange={height => set({ height })} />
        {choice('Format', 'format', [['png', 'PNG'], ['jpeg', 'JPEG'], ['webp', 'WebP']], value.format)}
        <p className="text-[11px] text-slate-400">One frame uses the selected scene camera and authored lights. The result is available for download here.</p>
      </div>
    </details>
    <button type="button" onClick={render} disabled={disabled || !available || !resource?.exportGlb || !activeCamera || busy}
      className="w-full rounded-lg bg-cyan-700 px-3 py-2 font-medium text-white hover:bg-cyan-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50">
      {busy ? 'Rendering…' : 'Render frame'}
    </button>
    {busy && <button type="button" onClick={() => abort.current?.abort()} className="w-full rounded border border-slate-600 px-3 py-1.5 hover:bg-slate-800">Cancel render</button>}
    {reason && available !== false && <p role="status" className="text-slate-400">{reason}</p>}
    {result && <div className={card}><img src={result.url} alt="Rendered 3D frame" className="w-full rounded border border-slate-700" />
      <a href={result.url} download={result.name} className="mt-2 inline-block rounded bg-slate-700 px-3 py-1.5 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400">Download {result.name}</a></div>}
  </section>
}
