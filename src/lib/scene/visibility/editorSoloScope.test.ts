import {describe,expect,it} from 'vitest'
import {emptyScene,newRectLayer} from '@/lib/defaults'
import type {Layer} from '@/lib/types'
import {editorSoloScope} from './editorSoloScope'
import {buildSceneExplorerRows,collectDescendants} from '@/lib/sceneExplorer/sceneExplorerModel'
import {LayerIndex} from '../LayerIndex'
import {makeBulkToggleFlagCmd} from '@/lib/editor/commands-layer'
import {initHistory,pushHistory,undoHistory,redoHistory} from '@/lib/editor/history'

/** Plain immutable source fixtures; hidden/inactive nodes remain editable. */
function item(id:string,parentId?:string,patch:Partial<Layer>={}):Layer{
  return {...newRectLayer(),id,name:id,parentId,...patch}
}
describe('editor solo subtree scope',()=>{
  it('keeps descendant tracks when the solo parent is outside explicit timeline membership',()=>{
    const layers=[item('root',undefined,{type:'group',solo:true}),item('child','root'),item('deep','child',{hidden:true,endMs:-1}),item('outside')]
    const before=JSON.stringify(layers),scope=editorSoloScope(layers)!,members=new Set(['child','deep'])
    expect(layers.filter(layer=>scope.has(layer.id)&&members.has(layer.id)).map(layer=>layer.id)).toEqual(['child','deep'])
    expect(buildSceneExplorerRows(layers,{collapsedIds:new Set()}).map(row=>row.id)).toEqual(['root','child','deep'])
    expect(JSON.stringify(layers)).toBe(before)
  })
  it('adds tree ancestor context without showing unrelated siblings',()=>{
    const layers=[item('parent',undefined,{type:'group'}),item('solo','parent',{type:'group',solo:true}),item('leaf','solo'),item('sibling','parent')]
    expect(Array.from(editorSoloScope(layers)!)).toEqual(['solo','leaf'])
    const tree=editorSoloScope(layers,true)!
    expect(tree.has('parent')).toBe(true);expect(tree.has('sibling')).toBe(false)
    expect(buildSceneExplorerRows(layers,{collapsedIds:new Set()}).map(row=>row.id)).toEqual(['parent','solo','leaf'])
    expect(buildSceneExplorerRows(layers,{collapsedIds:new Set(['solo'])}).map(row=>row.id)).toEqual(['parent','solo'])
  })
  it('preserves independent audio solo and visual solo domains',()=>{
    const layers=[item('root',undefined,{type:'group',solo:true}),item('v','root'),item('other'),item('audio',undefined,{type:'audio'}),item('audioSolo',undefined,{type:'audio',solo:true})]
    expect(Array.from(editorSoloScope(layers)!)).toEqual(['root','v','audioSolo'])
    const audioOnly=layers.map(layer=>({...layer,solo:layer.id==='audioSolo'}))
    expect(Array.from(editorSoloScope(audioOnly)!)).toEqual(['root','v','other','audioSolo'])
    expect(editorSoloScope(layers.map(layer=>({...layer,solo:false})))).toBeNull()
  })
  it('terminates on cycles and preserves collectDescendants ordering for valid trees',()=>{
    const cycle=[item('a','b',{type:'group',solo:true}),item('b','a')]
    expect(Array.from(editorSoloScope(cycle,true)!)).toEqual(['a','b'])
    const tree=[item('root'),item('a','root'),item('b','root'),item('deep','a')]
    expect(Array.from(collectDescendants(tree,'root'))).toEqual(['a','deep','b'])
  })
  it('hides a complete branch atomically and restores mixed authored flags in one undo',()=>{
    const layers=[item('root',undefined,{type:'group',solo:true}),item('hidden','root',{hidden:true}),item('visible','root'),item('outside')]
    const source={...emptyScene(),layers},before=JSON.stringify(source)
    const ids=new LayerIndex(layers).subtreeIds(['root','visible'])
    const command=makeBulkToggleFlagCmd(ids,'hidden',true),changed=command.execute(source)
    expect(changed.layers.filter(layer=>ids.has(layer.id)).every(layer=>layer.hidden)).toBe(true)
    expect(changed.layers[3]).toBe(source.layers[3])
    const history=pushHistory(initHistory(source),changed)
    expect(history.past).toHaveLength(1)
    expect(JSON.stringify(undoHistory(history).present)).toBe(before)
    expect(redoHistory(undoHistory(history)).present).toBe(changed)
    expect(JSON.stringify(command.undo(changed))).toBe(before)
  })
})
