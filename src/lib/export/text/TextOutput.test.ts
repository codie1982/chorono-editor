import {describe,expect,it,vi} from 'vitest'
import {emptyScene,newRectLayer,newTimeline} from '../../defaults'
import {OutputResources} from '../resources'
import {acquireSceneText,acquireTextDownload} from './TextOutput'
import {exportHTML} from '../html/htmlExport'
import {exportToRuntime} from '../runtimeExport'
import {ShapeToPathConverter} from '../../geometry'

describe('owned text output',()=>{
  it('preserves existing editor/HTML/legacy-runtime bytes, exact metadata and final output lifetime',async()=>{
    const scene=emptyScene(),resources=new OutputResources()
    scene.composition.id='Şişe <script> & 🧊';scene.layers=[newRectLayer()]
    for(const kind of ['editor-json','html','legacy-runtime-json'] as const){
      const pin=await acquireSceneText(scene,kind,{}, {resources})
      try{
        const expected=kind==='editor-json'?JSON.stringify(scene,null,2):kind==='html'?exportHTML(scene).html:JSON.stringify(exportToRuntime(scene),null,2)
        expect(pin.value.text).toBe(expected);expect(pin.value.byteLength).toBe(new TextEncoder().encode(expected).length)
        expect(pin.value.lines).toBe(expected.split('\n').length);expect(resources.getSnapshot().residency.protectedBytes).toBeGreaterThan(0)
      }finally{pin.release()}
      expect(resources.getSnapshot().residency.chargedBytes).toBe(0)
    }
    const download=await acquireTextDownload(scene,'html',{}, {resources})
    expect(await download.value.blob.text()).toBe(exportHTML(scene).html)
    expect(resources.getSnapshot().residency.chargedBytes).toBe(download.value.blob.size+1)
    download.release();expect(resources.getSnapshot().residency.chargedBytes).toBe(0);resources.dispose()
  })
  it('denies serialization/Blob construction before allocation when policy does not fit',async()=>{
    const resources=new OutputResources({maxBytes:100}),native=vi.spyOn(globalThis,'Blob')
    try{await expect(acquireTextDownload(emptyScene(),'editor-json',{}, {resources})).rejects.toThrow('budget');expect(native).not.toHaveBeenCalled()}
    finally{native.mockRestore();resources.dispose()}
    expect(resources.getSnapshot().residency.chargedBytes).toBe(0)
  })
  it('refuses tiny-source huge polygon before dense geometry conversion',async()=>{
    const scene=emptyScene(),shape=newRectLayer(),resources=new OutputResources(),convert=vi.spyOn(ShapeToPathConverter,'convert')
    shape.shapeKind='polygon';shape.shapeParams={kind:'polygon',sides:10000000};scene.layers=[shape]
    try{await expect(acquireSceneText(scene,'svg',{}, {resources})).rejects.toThrow('command limit');expect(convert).not.toHaveBeenCalled()}
    finally{convert.mockRestore();resources.dispose()}
    expect(resources.getSnapshot().residency.chargedBytes).toBe(0)
  })
  it('refuses runtime dense bake before invoking unsupported/unbounded sampling',async()=>{
    const scene=emptyScene(),timeline=newTimeline(),shape=newRectLayer(),resources=new OutputResources()
    scene.layers=[shape];timeline.durationMs=3600000;timeline.tracks=[{target:`layers.${shape.id}.transform.x`,keyframes:[],modifiers:[]}]
    // The authoritative predicate recognizes a valid nonconstant range rule.
    timeline.tracks[0].outOfRange={before:'cycle',after:'constant'}
    scene.timelines=[timeline]
    await expect(acquireSceneText(scene,'legacy-runtime-json',{}, {resources})).rejects.toThrow('sample limit')
    expect(resources.getSnapshot().residency.chargedBytes).toBe(0);resources.dispose()
  })
})
