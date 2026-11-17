import { describe, expect, it } from 'vitest'
import { fakeEditor } from './support/fakeEditor'
import { emptyScene, newRectLayer } from '../../defaults'
import { newModelLayer } from '../../model3d/source/modelDefaults'
import { parseSceneJson } from '../../format/scene/SceneJsonConverter'
import { describeAuthoring } from '../../editor/authoring'
import { getCapabilities } from '../catalog'

/** Full broker -> QuickJS -> prepared plan -> editor history acceptance. Uses
 * its own source and never connects to or changes the user's browser session. */
describe('guarded script source through MCP', () => {
  it('commits a valid plan once and restores exact manual source/keys with one Undo/Redo and save/load', async () => {
    const editor = fakeEditor('Script guards acceptance'), scene = emptyScene()
    scene.layers = [{...newRectLayer(),id:'manual',name:'Human artwork'}]
    scene.timelines = [{id:'timeline',durationMs:1000,loop:false,autoplay:false,tracks:[{target:'layers.manual.transform.x',keyframes:[{id:'human-key',timeMs:100,value:42,easing:{type:'easeOut'},tangentMode:'aligned'}]}]}]
    editor.replaceDocument(scene)
    try {
      const plan = await editor.call('run_script',{dryRun:true,code:"scene.get('manual').patch({transform:{y:80},style:{fill:{color:'#112233'}}});scene.add('circle').set({name:'Script circle'});"})
      expect(editor.host.editor.getScene()).toBe(scene); expect(editor.historyLength()).toBe(0)
      await editor.rawCall('apply_script_plan',{planId:plan.planId,expectedRevision:plan.revision,readToken:plan.readToken})
      const after = editor.host.editor.getScene()
      expect(editor.historyLength()).toBe(1)
      expect(after.layers[0].transform).toEqual({...scene.layers[0].transform,y:80})
      expect(after.timelines).toEqual(scene.timelines)
      expect(describeAuthoring(after, ['layer','manual']).createdBy.actor.kind).toBe('unknown')
      const capabilities = await getCapabilities('standard', {summary:true})
      expect(capabilities.scriptAuthoring).toMatchObject({scope:'2D',staticWrites:'reject-animated-or-driven-fields'})
      const loaded = parseSceneJson(JSON.stringify(after))
      expect(loaded.timelines).toEqual(after.timelines); expect(loaded.layers).toEqual(after.layers)
      editor.host.editor.undo(); expect(editor.host.editor.getScene()).toBe(scene)
      editor.host.editor.redo(); expect(editor.host.editor.getScene()).toBe(after)
    } finally { await editor.close() }
  })
  it('keeps revision/history/manual source unchanged when a later setter or 3D edit fails', async () => {
    const editor = fakeEditor('Script rollback'), scene = emptyScene()
    scene.layers = [{...newRectLayer(),id:'manual'},newModelLayer('model')]
    editor.replaceDocument(scene)
    try {
      for (const failure of ["scene.get('manual').opacity=5", "scene.get('model').patch({model3d:{camera:{yaw:50}}})"]) {
        await expect(editor.call('run_script',{code:`scene.get('manual').patch({name:'Should roll back'});${failure}`})).rejects.toThrow()
        expect(editor.host.editor.getScene()).toBe(scene); expect(editor.historyLength()).toBe(0)
        expect(editor.host.editor.getRevision()).toBe(0)
      }
    } finally { await editor.close() }
  })
  it('retains trusted native boxed-3D authoring while run_script stays 2D-only', async () => {
    const editor = fakeEditor('Native 3D compatibility')
    try {
      await editor.call('create_object',{kind:'model3d'})
      const model = editor.host.editor.getScene().layers[0]
      expect(model.type).toBe('model3d')
      await editor.call('patch_object',{layerId:model.id,patch:{model3d:{...model.model3d,camera:{...model.model3d!.camera,yaw:75}}}})
      expect(editor.host.editor.getScene().layers[0].model3d!.camera.yaw).toBe(75)
      expect(editor.historyLength()).toBe(2)
      await expect(editor.call('run_script',{code:`scene.get('${model.id}').patch({model3d:{camera:{yaw:20}}})`})).rejects.toThrow(/2D/)
      expect(editor.host.editor.getScene().layers[0].model3d!.camera.yaw).toBe(75)
    } finally { await editor.close() }
  })
})
