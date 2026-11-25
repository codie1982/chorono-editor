import { emptyScene, newRectLayer, newTimeline } from '../../defaults'
import { newModelLayer } from '../source/modelDefaults'
import { withModelContent, contentInstance } from '../content/modelContent'
import { modelAssetService } from '../resources/ModelAssetService'
import { animatedModelBytes } from './animatedModel'
import { modelBytes } from './fixtures'
/** Real decoded source inventory initializes the acceptance document. Pins are
 * released after metadata capture; the viewport/output acquires its own leases. */
export async function packageScene() {
  const scene = emptyScene(), bytes = [animatedModelBytes(), modelBytes()]
  scene.assets = bytes.map((buffer, i) => ({ id: `asset${i}`, type: 'model3d', name: i ? 'Static triangle' : 'Skinned morph assembly',
    url: `data:model/gltf+json;base64,${btoa(String.fromCharCode(...Array.from(new Uint8Array(buffer))))}` }))
  const pins = await Promise.all(scene.assets.map(asset => modelAssetService.acquire(asset)))
  try {
    const layer = newModelLayer('model','asset0','3D detail acceptance'); layer.size={width:400,height:300};layer.transform.x=70;layer.transform.y=10
    layer.model3d=withModelContent(layer.model3d!,pins[0].value.inventory!)
    const c=layer.model3d.content!, i=c.instances.primary
    i.native={clipId:'c0',inMs:100,outMs:900,speed:1,loop:true,mode:'play',timeMs:100,channels:pins[0].value.inventory!.clips[0].channels}
    c.instances.second=contentInstance('asset1',pins[1].value.inventory!,'Static second model');c.instances.second.position={x:1.3,y:.2,z:-.5};c.instances.second.scale=.55;c.instances.second.materials.m0.color='#38bdf8'
    c.parameters.spread={name:'Spread',type:'number',value:.1,min:0,max:2,target:'model3d.content.explode'}
    const rect=newRectLayer();rect.id='manual';rect.name='Manual 2D';rect.size={width:35,height:35};rect.transform.x=10;rect.transform.y=10
    scene.layers=[rect,layer];scene.composition={...scene.composition,width:500,height:320,durationMs:2000}
    scene.timelines=[{...newTimeline(),id:'outer',durationMs:2000,autoplay:false,tracks:[{target:'layers.model.transform.x',keyframes:[{id:'outer-manual',timeMs:0,value:70,easing:{type:'linear'}},{id:'outer-end',timeMs:2000,value:100,easing:{type:'linear'}}]}]}]
    return scene
  } finally { pins.forEach(p=>p.release()) }
}
