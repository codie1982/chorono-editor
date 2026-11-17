'use client'
import type { Model3DData, Model3DResource } from '@/lib/model3d/types'
import type { ModelSelection } from '@/lib/model3d/inspection/types'
import { ModelNumber } from './ModelNumber'
import { ModelKeyButton } from './ModelAnimationKeyContext'
import type { ModelWorkspace } from './modelWorkspaces'
import { fromModelMeters, modelMeasurement, toModelMeters } from '@/lib/model3d/measurement/modelMeasurement'
import { ModelMaterialPanel } from './ModelMaterialPanel'
/** Local node/material/instance values. Native clip-owned TRS controls are
 * disabled explicitly; editing another part or visibility remains independent. */
export function ModelNodeInspector({ data, selection, resource, onChange, workspace = 'modeling' }: { data: Model3DData; selection?: ModelSelection; resource?: Model3DResource; onChange(data: Model3DData): void; workspace?: Exclude<ModelWorkspace, 'render'> }) {
  const instance = selection && data.content?.instances[selection.instanceId], pose = instance && instance.nodes[selection.nodeId], inventory = resource?.inventory
  if (!instance || !pose || !selection || !inventory) return <p className="text-xs text-gray-400">Select a part to edit its {workspace === 'material' ? 'PBR materials' : 'local transform'}.</p>
  const native = instance.native && inventory.clips.find(c => c.id === instance.native!.clipId)
  const settings = modelMeasurement(data)
  const info = inventory.nodes.find(n => n.id === selection.nodeId)
  const change = (fn: (next: Model3DData) => void) => { const next = structuredClone(data); fn(next); onChange(next) }
  const root = `model3d.content.instances.${selection.instanceId}`
  return <div className="space-y-3 text-xs">
    <h3 className="text-cyan-300">{pose.name ?? info?.name} · local glTF units</h3>
    {workspace !== 'material' && <>
    <div className="flex items-center gap-2"><label className="flex gap-2"><input type="checkbox" checked={pose.visible} onChange={e => change(next => { next.content!.instances[selection.instanceId].nodes[selection.nodeId].visible = e.target.checked })} />Visible</label><ModelKeyButton path={`${root}.nodes.${selection.nodeId}.visible`} /></div>
    {(['position', 'rotation', 'scale'] as const).map(field => <fieldset key={field} className="space-y-1 border-t border-gray-700 pt-2">
      <legend>{field === 'rotation' ? 'Rotation · degrees' : field}</legend>
      {native && native.channels.some(c => c.nodeId === selection.nodeId && c.field === field) && <p className="text-amber-200">Owned by native clip</p>}
      {(['x', 'y', 'z'] as const).map(axis => <ModelNumber key={axis} keyPath={`${root}.nodes.${selection.nodeId}.${field}.${axis}`} label={`Node ${field} ${axis.toUpperCase()}`} value={pose[field][axis]}
        disabled={!!native && native.channels.some(c => c.nodeId === selection.nodeId && c.field === field)}
        onChange={v => change(next => { next.content!.instances[selection.instanceId].nodes[selection.nodeId][field][axis] = v })} />)}
    </fieldset>)}
    <details><summary className="cursor-pointer py-2">Assembly placement</summary>
      {(['position', 'rotation'] as const).map(field => (['x', 'y', 'z'] as const).map(axis => <ModelNumber key={`${field}.${axis}.${settings.unit}.${settings.pixelsPerInch}`} keyPath={`${root}.${field}.${axis}`}
        label={`Instance ${field} ${axis.toUpperCase()}${field === 'position' ? ` (${settings.unit})` : ' (deg)'}`}
        value={field === 'position' ? fromModelMeters(instance[field][axis], settings) : instance[field][axis]}
        onChange={v => change(next => { next.content!.instances[selection.instanceId][field][axis] = field === 'position' ? toModelMeters(v, settings) : v })} />))}
      <ModelNumber label="Instance scale" keyPath={`${root}.scale`} value={instance.scale} onChange={v => change(next => { next.content!.instances[selection.instanceId].scale = v })} />
    </details></>}
    {(workspace === 'material' || workspace === 'animation') && info?.materialIds.map(id => {
      const m = instance.materials[id]
      return m && workspace === 'material' ? <ModelMaterialPanel key={id} title={`${pose.name ?? info?.name} · ${id}`} surface={{ ...inventory.materials[id], ...m }}
        keyRoot={`${root}.materials.${id}`} textures={{ names: inventory.textures, colorSpaces: inventory.textureColorSpaces }}
        onChange={patch => change(next => { Object.assign(next.content!.instances[selection.instanceId].materials[id], patch) })} />
      : m ? <details key={id}><summary className="cursor-pointer py-2">PBR material {id}</summary><div className="space-y-2">
        <div className="flex items-center justify-between"><label>Base color<input aria-label={`Material ${id} color`} type="color" value={m.color} onChange={e => change(next => { next.content!.instances[selection.instanceId].materials[id].color = e.target.value })} /></label><ModelKeyButton path={`${root}.materials.${id}.color`} /></div>
        {(['roughness', 'metalness', 'opacity'] as const).map(field => <ModelNumber key={field} keyPath={`${root}.materials.${id}.${field}`} label={`Material ${id} ${field}`} value={m[field]} onChange={v => change(next => { next.content!.instances[selection.instanceId].materials[id][field] = v })} />)}
        {workspace === 'material' && (['map', 'normalMap', 'roughnessMap', 'metalnessMap'] as const).map(slot => <label key={slot} className="block">{slot} · imported UV<select aria-label={`Material ${id} ${slot}`} className="w-full bg-gray-800 border border-gray-600 rounded p-1" value={m[slot]} onChange={e => change(next => { next.content!.instances[selection.instanceId].materials[id][slot] = Number(e.target.value) })}>
          <option value={-1}>None</option>{inventory.textures.map((name, i) => <option key={i} value={i} disabled={inventory.textureColorSpaces[i] !== (slot === 'map' ? 'srgb' : 'linear')}>{name}</option>)}
        </select></label>)}
      </div></details> : <p key={id}>Material {id}: imported appearance only</p>
    })}
    {(workspace === 'material' || workspace === 'animation') && !info?.materialIds.length && <p className="text-gray-400">This part has no editable PBR material.</p>}
  </div>
}
