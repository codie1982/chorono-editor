import { expect, it } from 'vitest'
import { fakeEditor } from './support/fakeEditor'
import { authoringKey, describeAuthoring, fieldAuthoring } from '../../editor/authoring'
import { makeUpdateKfValueCmd } from '../../editor/commands-keyframe'
import { defaultRuntimeExporter } from '../../export/RuntimeExporter'
import { exportToRuntime } from '../../export/runtimeExport'

it('attributes real broker script/native commits, preserves manual key fields and restores exact undo/redo metadata', async () => {
  const editor = fakeEditor('Hermes')
  try {
    const read = await editor.rawCall('get_scene')
    const plan = await editor.rawCall('run_script', { expectedRevision: read.revision, readToken: read.readToken, dryRun: true,
      code: `const clock=scene.add('text'); clock.text='10:10'; clock.set({name:'Clock'}); clock.key('transform.x',0,20,'easeOut').key('transform.x',1000,90);` })
    expect(editor.host.editor.getScene().authoring).toBeUndefined()
    await editor.rawCall('apply_script_plan', { planId: plan.planId, expectedRevision: plan.revision, readToken: plan.readToken, requestId: 'plan' })
    const original = await editor.rawCall('get_scene'), clock = original.scene.layers[0]
    expect(describeAuthoring(original.scene, ['layer', clock.id]).createdBy.actor).toEqual({ kind: 'agent', name: 'Hermes' })
    const timeline = original.scene.timelines[0], track = timeline.tracks[0], key = track.keyframes[0]
    editor.host.editor.dispatchCommand(makeUpdateKfValueCmd(timeline.id, track.target, key.id, 20, 35))
    const manual = await editor.rawCall('get_scene'), address = ['key', timeline.id, track.target, key.id] as const
    expect(fieldAuthoring(manual.scene, address, ['value']).actor.kind).toBe('human')
    await expect(editor.rawCall('update_layer', { layerId: clock.id, text: 'wrong', expectedRevision: original.revision, readToken: original.readToken })).rejects.toMatchObject({ code: 'SOURCE_REVISION_CONFLICT' })
    await editor.call('run_script', { code: `const tl=scene.timeline('${timeline.id}');const tr=tl.data.tracks.find(tr=>tr.target===${JSON.stringify(track.target)});tl.track(tr.target,{...tr,keyframes:tr.keyframes.map(k=>k.id==='${key.id}'?{...k,value:45}:k)});` })
    const after = await editor.rawCall('get_scene')
    expect(after.scene.timelines[0].tracks[0].keyframes[0]).toEqual({ ...key, value: 45 })
    expect(fieldAuthoring(after.scene, address, ['value']).actor).toEqual({ kind: 'agent', name: 'Hermes' })
    expect(after.scene.authoring.records[authoringKey(address)].createdBy).toEqual(original.scene.authoring.records[authoringKey(address)].createdBy)
    await editor.call('undo')
    expect(editor.host.editor.getScene()).toEqual(manual.scene)
    await editor.call('redo')
    expect(editor.host.editor.getScene()).toEqual(after.scene)
    for (const runtime of [exportToRuntime(after.scene), defaultRuntimeExporter.export(after.scene).runtime]) expect(runtime).not.toHaveProperty('authoring')
  } finally { await editor.close() }
})

it('carries clone lineage through script dry-run/apply and native batch without claiming copied human fields', async () => {
  const editor = fakeEditor('Hermes')
  try {
    await editor.call('run_script', { code: `const layer=scene.add('text');layer.set({name:'Clock'});layer.text='10:10';layer.key('opacity',0,1);` })
    editor.host.editor.dispatchCommand({ label: 'Human time', execute: scene => ({ ...scene, layers: scene.layers.map(layer => ({ ...layer, text: { ...layer.text!, value: '09:05' } })) }), undo: scene => scene })
    const source = await editor.rawCall('get_scene'), id = source.scene.layers[0].id
    const planned = await editor.rawCall('run_script', { ...{ expectedRevision: source.revision, readToken: source.readToken },
      code: `scene.clone(scene.get('${id}'),1,{offsetX:50});scene.cloneTimeline('${source.scene.timelines[0].id}','copied');`, dryRun: true })
    await editor.rawCall('apply_script_plan', { planId: planned.planId, expectedRevision: planned.revision, readToken: planned.readToken })
    const after = await editor.rawCall('get_scene'), clone = after.scene.layers.find((layer: any) => layer.id !== id)
    expect(fieldAuthoring(after.scene, ['layer', clone.id], ['text', 'value']).actor.kind).toBe('human')
    expect(after.scene.layers.find((layer: any) => layer.id === id).text.value).toBe('09:05')
    const copiedTimeline = after.scene.timelines.find((timeline: any) => timeline.id === 'copied'), key = copiedTimeline.tracks[0].keyframes[0]
    expect(describeAuthoring(after.scene, ['key', 'copied', copiedTimeline.tracks[0].target, key.id]).inheritedFrom?.[0]).toBe('key')
    const described = await editor.rawCall('get_layer', { layerId: clone.id })
    expect(described.content).toContain('mixed')
  } finally { await editor.close() }
})
