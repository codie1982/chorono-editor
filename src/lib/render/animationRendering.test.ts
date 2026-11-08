import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AnimatableValue, ChronoScene, Layer, Track } from '@/lib/types'
import { emptyScene, newTextLayer, newSplineLayerFromPrimitive } from '@/lib/defaults'
import { cloneSingleLayer } from '@/lib/clone/CloneSingleLayer'
import { buildEmitterLayer } from '@/lib/particles/buildEmitterLayer'
import { Matrix2D } from '@/lib/geometry/Matrix2D'
import { CanvasRenderer } from './CanvasRenderer'
import { materializeRenderScene } from './materializeOverrides'
import * as offscreen from './OffscreenCanvasCache'
import { CanvasRenderer2D } from './CanvasRenderer2D'
import type { ISceneObject } from '@/lib/core/ISceneObject'
import type { ITimeline } from '@/lib/core/ITimeline'
import { LayerIndex } from '@/lib/scene/LayerIndex'
import { rendererRegistry } from '@/lib/registry'

type Draw = { kind: string; path: unknown[][]; color: unknown; filter: string; alpha: number; point?: {x:number;y:number}; args?: unknown[] }
function canvasRecording() {
  let matrix = Matrix2D.identity(), path: unknown[][] = []
  const draws: Draw[] = [], states: Array<Record<string, unknown>> = []
  const ctx = {
    globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, filter: 'none',
    globalCompositeOperation: 'source-over', font: '', textAlign: 'left', textBaseline: 'top',
    lineDashOffset: 0, lineCap: 'butt', lineJoin: 'miter', shadowColor: '',
    save() { states.push({ matrix, globalAlpha: this.globalAlpha, fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle, filter: this.filter, globalCompositeOperation: this.globalCompositeOperation }) },
    restore() { const state = states.pop()!; matrix = state.matrix as Matrix2D; Object.assign(this, state) },
    setTransform(a:number,b:number,c:number,d:number,e:number,f:number) { matrix = new Matrix2D(a,b,c,d,e,f) },
    transform(a:number,b:number,c:number,d:number,e:number,f:number) { matrix = matrix.multiply(new Matrix2D(a,b,c,d,e,f)) },
    translate(x:number,y:number) { matrix = matrix.translate(x,y) },
    rotate(r:number) { matrix = matrix.rotate(r*180/Math.PI) },
    scale(x:number,y:number) { matrix = matrix.scale(x,y) },
    clearRect() {}, setLineDash() {}, beginPath() { path = [] }, closePath() { path.push(['Z']) },
    moveTo(...v:number[]) { path.push(['M',...v]) }, lineTo(...v:number[]) { path.push(['L',...v]) },
    bezierCurveTo(...v:number[]) { path.push(['C',...v]) }, quadraticCurveTo(...v:number[]) { path.push(['Q',...v]) },
    arc(...v:number[]) { path.push(['A',...v]) }, arcTo(...v:number[]) { path.push(['AT',...v]) },
    rect(...v:number[]) { path.push(['R',...v]) }, roundRect(...v:number[]) { path.push(['RR',...v]) },
    clip() {}, measureText() { return { width: 10 } },
    fill() { record('fill', this.fillStyle) }, stroke() { record('stroke', this.strokeStyle) },
    fillRect(...args:number[]) { record('fillRect', this.fillStyle, args) },
    fillText(...args:unknown[]) { record('text', this.fillStyle, args) },
    strokeText(...args:unknown[]) { record('textStroke', this.strokeStyle, args) },
    drawImage(...args:unknown[]) { record('image', '', args) },
  }
  function record(kind:string,color:unknown,args?:unknown[]) {
    draws.push({ kind, color, args, path:[...path], filter:ctx.filter, alpha:ctx.globalAlpha,
      point:matrix.applyToPoint({x:0,y:0}) })
  }
  return { ctx:ctx as unknown as CanvasRenderingContext2D, draws }
}
function shape(id='shape'): Layer {
  return { id, name:id, type:'shape', shape:'rect', opacity:1, size:{width:100,height:40},
    transform:{x:0,y:0,scaleX:1,scaleY:1,rotationDeg:0,anchorX:0,anchorY:0},
    style:{fill:{type:'solid',color:'#112233'}} }
}
function track(layer:Layer,property:string,a:AnimatableValue,b:AnimatableValue): Track {
  return { target:`layers.${layer.id}.${property}`, keyframes:[
    {id:`${property}-a`,timeMs:0,value:a,easing:{type:'linear'}},
    {id:`${property}-b`,timeMs:1000,value:b,easing:{type:'linear'}},
  ] }
}
function sceneFor(layers:Layer[],tracks:Track[]=[]):ChronoScene {
  return {...emptyScene(),layers,timelines:[{id:'animation',durationMs:2000,autoplay:true,loop:false,tracks}]}
}
function render(scene:ChronoScene,timeMs=500) {
  const recording=canvasRecording()
  new CanvasRenderer().render(recording.ctx,scene,timeMs,null,new Map(),{background:'transparent',renderMode:'preview'})
  return recording.draws
}
afterEach(()=>vi.restoreAllMocks())

describe('typed animation reaches the public renderer',()=>{
  it('renders animated letter spacing, string content and RGBA text color without mutating the authored layer',()=>{
    const text=newTextLayer(); text.text!.value='AB'
    const original=structuredClone(text)
    const draws=render(sceneFor([text],[track(text,'text.letterSpacing',0,20),
      track(text,'text.color',{r:255,g:0,b:0,a:255},{r:0,g:0,b:255,a:255}),
      track(text,'text.value','AB','CD')]))
    const glyphs=draws.filter(draw=>draw.kind==='text')
    expect(glyphs.map(draw=>draw.args)).toEqual([['A',0,0],['B',20,0]])
    expect(glyphs[0].color).toBe('rgba(128,0,128,1)')
    expect(text).toEqual(original)
  })

  it('projects every shape parameter, including a wave phase absent from the old six-property renderer list',()=>{
    const wave=shape(); wave.shapeKind='wave'; wave.shapeParams={kind:'wave',amplitude:10,frequency:1,phase:0}
    const draws=render(sceneFor([wave],[track(wave,'shapeParams.amplitude',10,30),track(wave,'shapeParams.phase',0,Math.PI)]))
    const start=draws.find(draw=>draw.kind==='fill')!.path[0]
    // At phase PI/2 and amplitude20, the wave starts at centreY+20.
    expect(start).toEqual(['M',0,40])
    expect(wave.shapeParams.amplitude).toBe(10)
  })

  it('changes particle spawning with an animated rate through the real emitter plugin',()=>{
    const emitter=buildEmitterLayer()
    const cfg=emitter.particleEmitter!
    cfg.emitter={...cfg.emitter,mode:'continuous',ratePerSecond:2,maxParticles:100,durationMs:5000,loop:false}
    cfg.particle={...cfg.particle,shape:'rect'}
    cfg.particle.colorMode='single'
    cfg.random.colorRandomness=0
    cfg.animation.lifetimeMs={min:5000,max:5000}
    cfg.random.delayRandomness=0
    const scene=sceneFor([emitter],[track(emitter,'particleEmitter.emitter.ratePerSecond',2,10),
      track(emitter,'particleEmitter.particle.color',{r:255,g:0,b:0,a:255},{r:0,g:0,b:255,a:255})])
    const count=(time:number)=>render(scene,time).filter(draw=>draw.kind==='fillRect').length
    expect(count(500)).toBe(3)
    expect(count(1000)).toBe(10)
    expect(render(scene,500)[0].color).toBe('rgba(127.5,0,127.5,1.000)')
    expect(cfg.emitter.ratePerSecond).toBe(2)
  })

  it('renders the animated repeater count and distance, while retaining the source transform',()=>{
    const source=shape('source'); source.transform.x=7
    const repeater:Layer={...shape('repeater'),type:'repeater',repeater:{sourceLayerId:source.id,count:1,mode:'linear',transformStep:{x:20,y:0}}}
    const draws=render(sceneFor([source,repeater],[track(repeater,'repeater.count',1,5),track(repeater,'repeater.transformStep.x',20,60)]))
    expect(draws.filter(draw=>draw.kind==='fill').map(draw=>draw.point!.x)).toEqual([7,7,47,87])
  })

  it('evaluates CSS effects through the same pipeline as ordinary shape rendering',()=>{
    const layer=shape()
    const draws=render(sceneFor([layer],[track(layer,'effects.blur',0,20),track(layer,'effects.brightness',100,200)]))
    expect(draws[0].filter).toBe('blur(10px) brightness(150%)')
    expect(layer.effects).toBeUndefined()
  })

  it('uses per-instance style/geometry keys without inheriting a source animation or changing its pivot',()=>{
    const source=newSplineLayerFromPrimitive('line',{x1:0,y1:0,x2:100,y2:0})!
    const {clonedLayer:instance}=cloneSingleLayer(source,{mode:'instance',offsetX:100})
    instance.transform.anchorX=25
    const point=Object.keys(source.spline!.points)[1]
    const scene=sceneFor([source,instance],[track(source,'style.stroke.color','#ff0000','#0000ff'),
      track(instance,'style.stroke.color','#00ff00','#00ff00'),
      track(instance,`spline.points.${point}.x`,100,200)])
    const strokes=render(scene).filter(draw=>draw.kind==='stroke')
    expect(strokes[0].color).toBe('rgba(128,0,128,1)')
    expect(strokes[1].color).toBe('rgba(0,255,0,1)')
    expect(strokes[0].path.at(-1)).toEqual(['L',100,0])
    expect(strokes[1].path.at(-1)).toEqual(['L',150,0])
    expect(instance.transform.anchorX).toBe(25)
    expect(instance.spline).toBeUndefined()
  })

  it('applies animated mask opacity/feather and renders a masked child once in composition coordinates',()=>{
    const offscreens:ReturnType<typeof canvasRecording>[]=[]
    vi.spyOn(offscreen,'createOffscreen').mockImplementation(()=>{
      const recording=canvasRecording(); offscreens.push(recording)
      return {width:800,height:600,getContext:()=>recording.ctx} as unknown as HTMLCanvasElement
    })
    const parent:Layer={...shape('parent'),type:'group',transform:{...shape().transform,x:100,y:50,rotationDeg:90}}
    const host=shape('host'); host.parentId=parent.id; host.transform.x=10
    const mask=shape('mask'); mask.transform.x=80
    host.masks=[{id:'m',maskLayerId:mask.id,mode:'add',opacity:1,feather:0}]
    const draws=render(sceneFor([parent,host,mask],[track(host,'masks.0.opacity',0,1),track(host,'masks.0.feather',0,12)]))
    const content=offscreens.flatMap(item=>item.draws).find(draw=>draw.kind==='fill'&&draw.filter==='none')!
    expect(content.point!.x).toBeCloseTo(100)
    expect(content.point!.y).toBeCloseTo(60)
    expect(offscreens.flatMap(item=>item.draws).some(draw=>draw.kind==='fill'&&draw.filter==='blur(6px)')).toBe(true)
    expect(offscreens.flatMap(item=>item.draws).some(draw=>draw.kind==='image'&&draw.alpha===0.5)).toBe(true)
    const composite=draws.filter(draw=>draw.kind==='image')
    expect(composite).toHaveLength(1)
    expect(composite[0].point!.x).toBeCloseTo(0)
    expect(composite[0].point!.y).toBeCloseTo(0)
    expect(host.masks[0].opacity).toBe(1)
  })
})

describe('immutable render snapshots',()=>{
  it('copies only modified branches and safely addresses geometry arrays',()=>{
    const layer=shape(); layer.path={closed:false,anchors:[{x:0,y:0},{x:100,y:20}]}
    const scene=sceneFor([layer])
    const frame=materializeRenderScene(scene,new Map<string,AnimatableValue>([
      [`layers.${layer.id}.path.anchors.1.x`,150],
      [`layers.${layer.id}.path.anchors.99999999.x`,50],
      [`layers.${layer.id}.__proto__.polluted`,true],
    ]))
    expect(frame.layers[0].path!.anchors).toHaveLength(2)
    expect(frame.layers[0].path!.anchors[1].x).toBe(150)
    expect(frame.layers[0].path!.anchors[0]).toBe(layer.path.anchors[0])
    expect(frame.layers[0].style).toBe(layer.style)
    expect(layer.path.anchors[1].x).toBe(100)
    expect(({} as Record<string,unknown>).polluted).toBeUndefined()
  })

  it('ignores malformed numeric values, including absent optional fields, and preserves Vec2 point metadata',()=>{
    const spline=newSplineLayerFromPrimitive('line',{x1:0,y1:0,x2:100,y2:0})!
    const point=Object.keys(spline.spline!.points)[0]
    const originalPoint=spline.spline!.points[point]
    const frame=materializeRenderScene(sceneFor([spline]),new Map<string,AnimatableValue>([
      [`layers.${spline.id}.transform.x`,'oops'],
      [`layers.${spline.id}.effects.blur`,'oops'],
      [`layers.${spline.id}.opacity`,false],
      [`layers.${spline.id}.spline.points.${point}`,{x:20,y:30}],
    ]))
    expect(frame.layers[0].transform.x).toBe(spline.transform.x)
    expect(frame.layers[0].effects).toBeUndefined()
    expect(frame.layers[0].opacity).toBe(1)
    expect(frame.layers[0].spline!.points[point]).toEqual({...originalPoint,x:20,y:30})
    expect(originalPoint.x).toBe(0)
  })

  it('bounds animated counts in the render snapshot without rewriting stored animation values',()=>{
    const source=shape('source')
    const repeater:Layer={...shape('repeater'),type:'repeater',repeater:{sourceLayerId:source.id,count:1,mode:'linear'}}
    const scene=sceneFor([source,repeater],[track(repeater,'repeater.count',1,10000000)])
    expect(render(scene,1000).filter(draw=>draw.kind==='fill')).toHaveLength(201)
    expect(scene.timelines[0].tracks[0].keyframes[1].value).toBe(10000000)
    expect(repeater.repeater!.count).toBe(1)
  })

  it('keeps particle lifetime gradient colors as canonical RGBA when an evaluated color is a CSS string',()=>{
    const emitter=buildEmitterLayer()
    emitter.particleEmitter!.particle.colorOverLife={stops:[{t:0,value:{r:255,g:0,b:0,a:255}},{t:1,value:{r:0,g:0,b:0,a:0}}]}
    const frame=materializeRenderScene(sceneFor([emitter]),new Map([
      [`layers.${emitter.id}.particleEmitter.particle.colorOverLife.stops.0.value`,'#0080ff80'],
    ]))
    expect(frame.layers[0].particleEmitter!.particle.colorOverLife!.stops[0].value).toEqual({r:0,g:128,b:255,a:128})
  })
})

describe('frame layer relationships',()=>{
  it('draws nested children and repeated sources in stacking order without searching the layer array',()=>{
    const group={...shape('group'),type:'group' as const}
    const a=shape('a'); a.parentId=group.id; a.style!.fill!.color='#aa0000'
    const b=shape('b'); b.parentId=group.id; b.style!.fill!.color='#0000bb'
    const orphan=shape('orphan'); orphan.parentId='missing'
    const repeater:Layer={...shape('repeat'),type:'repeater',repeater:{sourceLayerId:b.id,count:2,mode:'linear'}}
    const scene=sceneFor([b,group,orphan,a,repeater])
    vi.spyOn(scene.layers,'find').mockImplementation(()=>{throw new Error('linear id lookup')})
    vi.spyOn(scene.layers,'filter').mockImplementation(()=>{throw new Error('linear relationship scan')})
    expect(render(scene).filter(draw=>draw.kind==='fill').map(draw=>draw.color))
      .toEqual(['#0000bb','#aa0000','#0000bb','#0000bb'])
  })

  it('rebuilds relationships after same-array reparent, order, replacement and scene switch',()=>{
    const parent={...shape('parent'),type:'group' as const}; parent.transform.x=100
    const a=shape('a'), b=shape('b'); a.parentId=b.parentId=parent.id
    const scene=sceneFor([parent,a,b]), renderer=new CanvasRenderer()
    const draw=()=>{const c=canvasRecording();renderer.render(c.ctx,scene,0,null,new Map(),{renderMode:'preview',background:'transparent'});return c.draws.filter(d=>d.kind==='fill').map(d=>d.point!.x)}
    expect(draw()).toEqual([100,100])
    a.parentId=undefined; a.transform.x=20
    scene.layers.splice(0,scene.layers.length,b,a,parent)
    expect(draw()).toEqual([20,100])
    scene.layers[0]={...b,transform:{...b.transform,x:30}}
    expect(draw()).toEqual([20,130])
    const other=canvasRecording()
    renderer.render(other.ctx,sceneFor([shape('other')]),0,null,new Map(),{renderMode:'preview',background:'transparent'})
    expect(other.draws.filter(d=>d.kind==='fill').map(d=>d.point!.x)).toEqual([0])
    expect(draw()).toEqual([20,130])
  })

  it('keeps a nested temporal frame separate from the parent draw frame',()=>{
    const parent={...shape('parent'),type:'group' as const}
    const a=shape('a'), b=shape('b'); a.parentId=b.parentId=parent.id
    const scene=sceneFor([parent,a,b],[track(b,'transform.x',0,100)])
    const renderer=new CanvasRenderer(), recording=canvasRecording()
    const plugin=rendererRegistry.findOrThrow(a), original=plugin.render
    let nested=false
    vi.spyOn(plugin,'render').mockImplementation((context,target)=>{
      if(target.id===a.id&&!nested){nested=true;renderer.renderSingleLayer(context.canvas,b,scene,new Map(),
        {timeMs:0,overrides:new Map([['layers.b.transform.x',10]])})}
      original(context,target)
    })
    renderer.render(recording.ctx,scene,500,null,new Map(),{renderMode:'preview',background:'transparent'})
    expect(recording.draws.filter(d=>d.kind==='fill').map(d=>d.point!.x)).toEqual([10,0,50])
  })

  it('resolves instances from authored sources with the same missing/cycle behavior',()=>{
    const source=shape('source'), a={...shape('a'),instanceOf:source.id}
    const b={...shape('b'),instanceOf:a.id}, missing={...shape('missing'),instanceOf:'absent'}
    const cycle={...shape('cycle'),instanceOf:'cycle'}
    const scene=sceneFor([source,a,b,missing,cycle])
    vi.spyOn(scene.layers,'find').mockImplementation(()=>{throw new Error('linear instance lookup')})
    const projected=materializeRenderScene(scene,new Map([['layers.source.style.fill.color','#ff0000']]))
    expect(projected.layers.map(l=>l.id)).toEqual(['source','a','b'])
    expect(projected.layers.map(l=>l.style!.fill!.color)).toEqual(['#ff0000','#112233','#112233'])
    expect(new LayerIndex(projected.layers).get('b')!.instanceOf).toBeUndefined()
  })
})

describe('2D mode SDK renderer parity',()=>{
  it('uses the real canvas dimensions and evaluated typed timeline values with the spline plugin',()=>{
    const spline=newSplineLayerFromPrimitive('line',{x1:0,y1:0,x2:100,y2:0})!
    const recording=canvasRecording()
    const canvas={width:640,height:360,getContext:()=>recording.ctx} as unknown as HTMLCanvasElement
    const evaluate=vi.fn(()=>[
      {path:`layers.${spline.id}.style.stroke.color`,value:'#ff00ff'},
      {path:`layers.${spline.id}.transform.x`,value:140},
    ])
    const timeline:ITimeline={id:'sdk',mode:'2danimation',durationMs:1000,evaluate,addKey:()=>{}}
    const renderer=new CanvasRenderer2D()
    renderer.render([spline] as unknown as ISceneObject[],timeline,{canvas,timeMs:500})
    expect(evaluate).toHaveBeenCalledWith(500)
    expect(recording.draws.find(draw=>draw.kind==='fillRect')!.args).toEqual([0,0,640,360])
    const stroke=recording.draws.find(draw=>draw.kind==='stroke')!
    expect(stroke.color).toBe('#ff00ff')
    expect(stroke.point!.x).toBe(140)
    renderer.options={overrides:new Map([[`layers.${spline.id}.transform.x`,200]]),background:'transparent'}
    renderer.render([spline] as unknown as ISceneObject[],timeline,{canvas,timeMs:900})
    expect(evaluate).toHaveBeenCalledTimes(1)
    expect(recording.draws.filter(draw=>draw.kind==='stroke').at(-1)!.point!.x).toBe(200)
  })
})
