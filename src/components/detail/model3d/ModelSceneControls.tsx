'use client'
import { useState } from 'react'
import type { Model3DData, Model3DResource } from '@/lib/model3d/types'
import type { ModelSelection } from '@/lib/model3d/inspection/types'
import { MODEL_CONTENT_PATHS } from '@/lib/model3d/animation/modelChannels'
import { modelContentPaths } from '@/lib/model3d/content/modelContent'
import { readPropertyPath } from '@/lib/scene/properties/readPropertyPath'
import { ModelNumber } from './ModelNumber'
import { ModelKeyButton } from './ModelAnimationKeyContext'
import { detailButton } from '../DetailWorkspaceShell'
import type { ModelWorkspace } from './modelWorkspaces'
import { fromModelMeters, modelMeasurement, toModelMeters } from '@/lib/model3d/measurement/modelMeasurement'
/** Scene lighting, imported clip source controls and typed exposed parameters.
 * Native clip controls never create skeleton tracks on the main 2D Timeline.
 * Texture choices use embedded imported UV assets; this is not a UV painter. */
export function ModelSceneControls({ data, resource, selection, onChange, workspace = 'modeling', openLight = false }: { data: Model3DData; resource?: Model3DResource; selection?: ModelSelection; onChange(data: Model3DData): void; workspace?: Exclude<ModelWorkspace, 'material'>; openLight?: boolean }) {
  const [parameterTarget, setTarget] = useState(''), c = data.content, id = selection?.instanceId ?? 'primary', instance = c?.instances[id], clips = resource?.inventory?.clips ?? []
  if (!c || !instance) return null
  const settings = modelMeasurement(data)
  const change = (fn: (next: Model3DData) => void) => { const next = structuredClone(data); fn(next); onChange(next) }, n = instance.native
  return <div className="space-y-3 text-xs">
    {(workspace === 'render' || workspace === 'animation') && <details open={openLight || workspace === 'animation' || undefined}><summary className="cursor-pointer py-2">Light &amp; environment</summary><div className="space-y-2">
      {(['x', 'y', 'z'] as const).map(axis => <ModelNumber key={`${axis}-${settings.unit}-${settings.pixelsPerInch}`} label={`Light ${axis.toUpperCase()} (${settings.unit})`}
        keyPath={`model3d.content.light.position.${axis}`}
        value={fromModelMeters(c.light.position[axis], settings)} min={fromModelMeters(-1e6, settings)} max={fromModelMeters(1e6, settings)}
        onChange={v => change(next => { next.content!.light.position[axis] = toModelMeters(v, settings) })} />)}
      <div className="flex items-center justify-between"><label>Light color<input type="color" aria-label="Light color" value={c.light.color} onChange={e => change(next => { next.content!.light.color = e.target.value })} /></label><ModelKeyButton path="model3d.content.light.color" /></div>
      <label className="flex gap-2"><input type="checkbox" checked={c.light.shadows} onChange={e => change(next => { next.content!.light.shadows = e.target.checked })} />Self shadows · 512 px</label>
      <div className="flex items-center justify-between"><label>Ambient color<input type="color" aria-label="Ambient color" value={c.environment.color} onChange={e => change(next => { next.content!.environment.color = e.target.value })} /></label><ModelKeyButton path="model3d.content.environment.color" /></div>
      <ModelNumber label="Environment intensity" keyPath="model3d.content.environment.intensity" value={c.environment.intensity} onChange={v => change(next => { next.content!.environment.intensity = v })} />
      <ModelNumber label="Exposure" keyPath="model3d.content.environment.exposure" value={c.environment.exposure} onChange={v => change(next => { next.content!.environment.exposure = v })} />
      <ModelNumber key={`${settings.unit}-${settings.pixelsPerInch}`} keyPath="model3d.content.view.orthoHeight" label={`Output ortho height (${settings.unit})`} value={fromModelMeters(c.view.orthoHeight, settings)}
        min={fromModelMeters(.01, settings)} max={fromModelMeters(10000, settings)} onChange={v => change(next => { next.content!.view.orthoHeight = toModelMeters(v, settings) })} />
    </div></details>}
    {workspace === 'animation' && <details open><summary className="cursor-pointer py-2">Native animation · {instance.name}</summary><div className="space-y-2">
      <select aria-label="Native clip" className="w-full bg-gray-800 border border-gray-600 rounded p-1" value={n?.clipId ?? ''} onChange={e => change(next => {
        const clip = clips.find(c => c.id === e.target.value)
        if (!clip) delete next.content!.instances[id].native
        else next.content!.instances[id].native = { clipId: clip.id, inMs: 0, outMs: clip.durationMs, speed: 1, loop: true, mode: 'play', timeMs: 0, channels: structuredClone(clip.channels) }
      })}><option value="">No native clip · rest pose</option>{clips.filter(clip => clip.durationMs > 0).map(clip => <option key={clip.id} value={clip.id}>{clip.name} · {clip.durationMs.toFixed(0)} ms</option>)}</select>
      {n && <>
        <select aria-label="Native playback mode" className="bg-gray-800 border border-gray-600 rounded p-1" value={n.mode} onChange={e => change(next => { next.content!.instances[id].native!.mode = e.target.value as 'play' | 'scrub' })}><option value="play">Follow scene / content time</option><option value="scrub">Authored pose time</option></select>
        {(['inMs', 'outMs', 'speed', 'timeMs'] as const).map(field => <ModelNumber key={field} label={`Native ${field}`} value={n[field]} onChange={v => change(next => { next.content!.instances[id].native![field] = v })} />)}
        <label className="flex gap-2"><input type="checkbox" checked={n.loop} onChange={e => change(next => { next.content!.instances[id].native!.loop = e.target.checked })} />Loop native clip</label>
      </>}
      {!clips.length && <p className="text-gray-400">This asset has no embedded animation clips.</p>}
    </div></details>}
    {(workspace === 'modeling' || workspace === 'render') && <details><summary className="cursor-pointer py-2">Presentation controls</summary><div className="space-y-2">
      <label className="flex gap-2"><input type="checkbox" checked={c.turntable.enabled} onChange={e => change(next => { next.content!.turntable.enabled = e.target.checked })} />Turntable</label>
      <ModelNumber label="Turntable degrees/s" value={c.turntable.speed} onChange={v => change(next => { next.content!.turntable.speed = v })} />
      <ModelNumber label="Explode" disabled={Object.values(c.parameters).some(p => p.target === 'model3d.content.explode')} value={c.explode} onChange={v => change(next => { next.content!.explode = v })} />
      <p className="text-gray-400">Explode moves top-level branches radially; a single shell has no separate parts.</p>
    </div></details>}
    {workspace === 'modeling' && <details><summary className="cursor-pointer py-2">Exposed parameters</summary><div className="space-y-2">
      <select aria-label="Expose content channel" className="w-full bg-gray-800 border border-gray-600 rounded p-1" value={parameterTarget} onChange={e => setTarget(e.target.value)}>
        <option value="">Choose numeric / visibility channel</option>{[...MODEL_CONTENT_PATHS, ...modelContentPaths(c)].map(path => <option key={path} value={path}>{path.replace('model3d.content.', '')}</option>)}
      </select>
      <button className={detailButton} disabled={!parameterTarget || Object.keys(c.parameters).length >= 32} onClick={() => change(next => {
        const value = readPropertyPath({ model3d: data }, parameterTarget), type = typeof value === 'boolean' ? 'boolean' : 'number'
        const key = `p_${crypto.randomUUID().replaceAll('-', '')}`
        next.content!.parameters[key] = { name: parameterTarget.split('.').slice(-2).join(' '), type, value: value as number | boolean, min: type === 'number' && Number(value) < 0 ? -1000 : 0, max: 1000, target: parameterTarget }
      })}>Expose input</button>
      {Object.entries(c.parameters).map(([key, p]) => <div key={key} className="border border-gray-700 p-2 rounded space-y-1">
        <input aria-label={`Parameter ${key} name`} className="w-full bg-gray-800 px-1" defaultValue={p.name} onBlur={e => { if (e.target.value && e.target.value !== p.name) change(next => { next.content!.parameters[key].name = e.target.value }) }} />
        {p.type === 'number' ? <>
          <ModelNumber label={`${p.name} value`} value={p.value as number} onChange={v => change(next => { next.content!.parameters[key].value = v })} />
          {(['min', 'max'] as const).map(field => <ModelNumber key={field} label={`${p.name} ${field}`} value={p[field]} onChange={v => change(next => { next.content!.parameters[key][field] = v })} />)}
        </> : <label><input type="checkbox" checked={p.value as boolean} onChange={e => change(next => { next.content!.parameters[key].value = e.target.checked })} />{p.name}</label>}
        <button className={detailButton} onClick={() => change(next => { delete next.content!.parameters[key] })}>Remove input</button>
      </div>)}
      <p className="text-gray-400">Inputs appear in main Properties with Wire / expression controls after Apply.</p>
    </div></details>}
  </div>
}
