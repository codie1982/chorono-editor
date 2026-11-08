import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { emptyScene } from '../../defaults'
import { runSafeScript } from '../sandbox'
import { assertScene } from '../protocol'
import { deterministicParticleSeed } from '../../script/api/ParticleHandle'
import { assertSplineTopology } from '../../script/api/splineHandleData'

const fixture = () => runSafeScript(`
  scene.createTimeline({id:'design',durationMs:2000});
  const curve=scene.addSpline('rectangle',{width:100,height:60});
  curve.set({name:'Editable curve'});curve.pos=[100,120];
  const emitter=scene.addEmitter('snow');emitter.set({name:'Editable particles'});emitter.pos=[260,120];
  const card=scene.add('rect');card.set({name:'Editable card'});card.pos=[400,120];
`, emptyScene())

describe('QuickJS native script domains', () => {
  it('runs the canonical particle/spline/Explorer authoring example in the isolated bridge', async () => {
    const reference = await readFile(path.resolve('skills/chorono/references/domains.md'), 'utf8')
    const blocks = Array.from(reference.matchAll(/```js\n([\s\S]*?)```/g), match => match[1])
    expect(blocks).toHaveLength(1)
    const result = await runSafeScript(blocks[0], emptyScene())
    assertScene(result.scene)
    const system = result.scene.layers.find(layer => layer.name === 'Editable particle system')!
    const guide = result.scene.layers.find(layer => layer.name === 'Emission guide')!
    const emitter = result.scene.layers.find(layer => layer.name === 'Path particles')!
    expect(system.type).toBe('group')
    expect(system.pinned).toBe(true)
    expect(guide.parentId).toBe(system.id)
    expect(emitter.parentId).toBe(system.id)
    expect(emitter.particleEmitter?.emitter).toMatchObject({ shape: 'path', maxParticles: 96, area: { pathLayerId: guide.id } })
    expect(emitter.particleEmitter?.random.seed).toBe(deterministicParticleSeed('editable-path-particles'))
    expect(emitter.particleEmitter?.animation.motionModifiers?.some(modifier => modifier.type === 'sineWave' && modifier.amount === 8)).toBe(true)
    assertSplineTopology(guide.spline!)
    expect(Object.keys(guide.spline!.points)).toHaveLength(3)
    const timeline = result.scene.timelines[0]
    expect(timeline.id).toBe('domain_demo')
    expect(timeline.tracks).toHaveLength(2)
    expect(timeline.tracks.every(track => track.keyframes.length === 3)).toBe(true)
    expect(timeline.tracks.some(track => track.target.startsWith(`layers.${guide.id}.spline.points.`) && track.target.endsWith('.y'))).toBe(true)
    expect(timeline.tracks.find(track => track.target === `layers.${emitter.id}.particleEmitter.emitter.ratePerSecond`)?.keyframes.map(key => key.value)).toEqual([12, 36, 12])
  })

  it('authors particle presets, all configuration sections, life channels and motion modifiers through the actual bridge', async () => {
    const result = await runSafeScript(`
      const emitter=scene.addEmitter('confetti'); emitter.set({name:'Procedural emitter'});
      const p=emitter.particles;
      if(!scene.particlePresets.length || !p.presets.length) throw new Error('Missing preset discovery');
      p.applyPreset('snow').emission({maxParticles:40,ratePerSecond:12,area:{width:180,height:50}})
        .emission({area:{width:240}}).visual({size:{min:2,max:6}})
        .animation({lifetimeMs:{min:1200,max:1600}})
        .random({positionRandomness:0}).rendering({quality:'high'}).seed(4294967295);
      if(p.data.random.seed!==4294967295) throw new Error('Unsigned seed was truncated');
      p.seed('brand-system');
      p.life('opacity',[{t:1,value:0},{t:0,value:1}]).lifeKey('opacity',.5,.4,'hold');
      p.life('scale',[{t:0,value:1},{t:1,value:0}]).removeLifeKey('scale',1).clearLife('scale');
      p.life('color',[{t:0,value:'#ff0000'},{t:1,value:'#0000ff80'}]);
      const before=p.motionModifiers.length;
      const modifier=p.addMotionModifier('spiral',{amount:15,speed:2,phase:1});
      if(modifier!==before) throw new Error('Modifier index was not returned');
      p.updateMotionModifier(modifier,{enabled:false});
      if(p.motionModifiers[modifier].enabled!==false) throw new Error('Modifier update was lost');
      p.removeMotionModifier(modifier);
      scene.log(JSON.stringify({id:emitter.id,remainingModifiers:p.motionModifiers.length,before}));
    `, emptyScene())
    const layer = result.scene.layers[0], data = layer.particleEmitter!
    expect(data.emitter.area).toMatchObject({ width: 240, height: 50 })
    expect(data.particle.size).toEqual({ min: 2, max: 6 })
    expect(data.animation.lifetimeMs).toEqual({ min: 1200, max: 1600 })
    expect(data.rendering.quality).toBe('high')
    expect(data.random.seed).toBe(deterministicParticleSeed('brand-system'))
    expect(data.animation.opacityOverLife?.stops).toEqual([{ t: 0, value: 1 }, { t: .5, value: .4, easing: 'hold' }, { t: 1, value: 0 }])
    expect(data.animation.scaleOverLife).toBeUndefined()
    expect(data.particle.colorMode).toBe('gradientOverLife')
    expect(data.particle.colorOverLife?.stops[1].value).toEqual({ r: 0, g: 0, b: 255, a: 128 })
    const log = JSON.parse(result.logs[0])
    expect(log.remainingModifiers).toBe(log.before)
    assertScene(result.scene)
  })

  it('passes unsigned packed life colors through the bridge without relaxing ordinary scalar quotas', async () => {
    const result = await runSafeScript(`
      const p=scene.addEmitter().particles;
      p.life('color',[{t:0,value:16711680},{t:1,value:255}]);
      p.lifeKey('color',.5,16777215);
    `, emptyScene())
    expect(result.scene.layers[0].particleEmitter!.particle.colorOverLife?.stops.map(stop => stop.value)).toEqual([
      { r: 255, g: 0, b: 0, a: 255 }, { r: 255, g: 255, b: 255, a: 255 }, { r: 0, g: 0, b: 255, a: 255 },
    ])
    await expect(runSafeScript(`scene.add('rect').pos=[4294967295,0]`, emptyScene())).rejects.toThrow(/limit/i)
  })

  it('edits spline primitives, contours, segments, points and handles with stable returned ids', async () => {
    const result = await runSafeScript(`
      const curve=scene.addSpline('line',{x1:0,y1:0,x2:100,y2:0});
      curve.set({name:'Coded spline'});
      const s=curve.spline, original=s.data;
      if(s.layerId!==curve.id) throw new Error('Spline handle identity differs from its TypeScript contract');
      const lineContour=Object.keys(original.contours)[0], lineSegment=Object.keys(original.segments)[0];
      const split=s.splitSegment(lineSegment,.25);
      if(s.getPoint(split.pointId).x!==25 || split.segmentIds.length!==2) throw new Error('Segment split ids/geometry failed');
      s.movePoint(split.pointId,25,20).setPointType(split.pointId,'bezierCorner');
      const handle=s.setHandle(split.pointId,'out',{x:45,y:40});
      if(s.getHandle(handle).x!==45) throw new Error('Handle edit was lost');
      s.setHandleLocked(handle,true).setHandleLocked(handle,false);
      s.removeHandle(split.pointId,'out').setContourClosed(lineContour,true).reverseContour(lineContour);
      const appended=s.appendPrimitive('circle',{radius:10},{x:180,y:40,name:'Satellite'});
      if(s.getSubShape(appended.subShapeIds[0]).name!=='Satellite') throw new Error('Append result ids failed');
      s.setSubShape(appended.subShapeIds[0],{name:'Moved satellite'});
      s.transform({a:1,b:0,c:0,d:1,e:20,f:0},{subShapeId:appended.subShapeIds[0]});
      const custom=s.addContour([{x:220,y:0},{x:260,y:0},{x:240,y:40}],{closed:true,name:'Triangle'});
      const inserted=s.addPoint(custom.contourIds[0],{x:250,y:20},{afterPointId:custom.pointIds[1]});
      s.removePoint(inserted).setFillRule('evenodd');
      if(!s.getContour(custom.contourIds[0]).closed || s.getSegment('missing')!==null) throw new Error('Contour read failed');
      s.removeContour(custom.contourIds[0]);
      if(s.getContour(custom.contourIds[0])!==null) throw new Error('Contour removal failed');
      scene.log(JSON.stringify({id:curve.id,point:split.pointId,bounds:s.bounds}));
    `, emptyScene())
    const layer = result.scene.layers[0], spline = layer.spline!
    assertSplineTopology(spline)
    expect(spline.fillRule).toBe('evenodd')
    expect(Object.values(spline.subShapes).some(shape => shape.name === 'Moved satellite')).toBe(true)
    expect(Object.values(spline.points).some(point => point.x === 25 && point.y === 20)).toBe(true)
    expect(JSON.parse(result.logs[0]).bounds.width).toBeGreaterThan(200)
    assertScene(result.scene)
  })

  it('cleans animation targets for removed spline elements without removing unrelated tracks', async () => {
    const result = await runSafeScript(`
      const timeline=scene.createTimeline({id:'geometry',durationMs:1000});
      const curve=scene.addSpline('rectangle',{width:100,height:60});
      const point=Object.keys(curve.spline.data.points)[0];
      timeline.key(curve,'spline.points.'+point+'.x',0,-50).key(curve,'opacity',0,1);
      curve.spline.removePoint(point);
      scene.log(point);
    `, emptyScene())
    expect(result.scene.timelines[0].tracks.map(track => track.target)).toEqual([`layers.${result.scene.layers[0].id}.opacity`])
    expect(result.scene.layers[0].spline!.points[result.logs[0]]).toBeUndefined()
    assertSplineTopology(result.scene.layers[0].spline!)
  })

  it('queries and edits the same hierarchy, links and timeline metadata used by Scene Explorer', async () => {
    const setup = await fixture()
    const result = await runSafeScript(`
      const curve=scene.find('Editable curve'), emitter=scene.find('Editable particles'), card=scene.find('Editable card');
      const ex=scene.explorer;
      emitter.particles.emission({shape:'path',area:{pathLayerId:curve.id}});
      scene.timeline('design').key(emitter,'opacity',0,.5).key(emitter,'opacity',2000,1);
      const group=ex.group([curve.id,emitter.id],{name:'Coded system'});
      if(ex.children(group).length!==2 || ex.ancestors(curve.id)[0]!==group) throw new Error('Hierarchy reads failed');
      ex.rename(group,'Procedural system');
      const matches=ex.query('type:spline',{includeAncestors:true,timelineId:'design'});
      if(!matches.some(node=>node.id===group) || !matches.some(node=>node.id===curve.id)) throw new Error('Faceted query failed');
      const read=ex.node(emitter.id,{timelineId:'design',timeMs:1000});
      if(read.tracks.length!==1 || read.links.pathLayerId!==curve.id || !read.data.particleEmitter) throw new Error('Node metadata failed');
      ex.setFlags(card.id,{hidden:true,pinned:true});
      if(!ex.node(card.id).flags.hidden || ex.node(card.id).worldBounds!==null) throw new Error('Bulk flags failed');
      ex.setFlags(card.id,{hidden:false,pinned:false});
      const before=ex.node(card.id).worldBounds;
      ex.reparent(card.id,group);
      const after=ex.node(card.id).worldBounds;
      if(Math.abs(before.x-after.x)>1e-6 || Math.abs(before.y-after.y)>1e-6) throw new Error('Reparent moved world geometry');
      ex.reorder(card.id,0);ex.moveAfter(card.id,emitter.id);ex.moveBefore(card.id,curve.id);
      if(ex.children(group)[0]!==card.id) throw new Error('Sibling order failed');
      if(ex.descendants(group).length!==3 || ex.tree[0].children.length!==3 || ex.nodes.length!==4) throw new Error('Tree traversal failed');
      scene.log(JSON.stringify({group,card:card.id,children:ex.children(group)}));
    `, setup.scene)
    const log = JSON.parse(result.logs[0])
    expect(result.scene.layers.find(layer => layer.id === log.group)?.name).toBe('Procedural system')
    expect(result.scene.layers.find(layer => layer.id === log.card)?.parentId).toBe(log.group)
    expect(result.scene.layers.filter(layer => layer.parentId === log.group)).toHaveLength(3)
    assertScene(result.scene)
  })

  it('keeps all namespace snapshots detached and exposes no host context or native invoke function', async () => {
    const setup = await fixture()
    const result = await runSafeScript(`
      const emitter=scene.find('Editable particles'), curve=scene.find('Editable curve');
      const particle=emitter.particles.data, geometry=curve.spline.data, node=scene.explorer.node(emitter.id);
      const presets=scene.particlePresets, emitterPresets=emitter.particles.presets, preset=emitter.particles.getPreset('snow');
      const point=Object.keys(geometry.points)[0], original=curve.spline.getPoint(point).x;
      particle.emitter.maxParticles=1; geometry.points[point].x=999; node.data.name='Leaked';
      presets.length=0;emitterPresets[0].tags.push('Leaked');preset.emitter.maxParticles=1;
      const tree=scene.explorer.tree;tree[0].name='Leaked';
      const roots=scene.explorer.roots;roots.length=0;
      if(emitter.particles.data.emitter.maxParticles===1 || curve.spline.getPoint(point).x!==original || emitter.name==='Leaked') throw new Error('Mutable data escaped');
      if(!scene.particlePresets.length || emitter.particles.presets[0].tags.includes('Leaked') || emitter.particles.getPreset('snow').emitter.maxParticles===1 || !scene.explorer.roots.length) throw new Error('Collection escaped');
      scene.log(typeof emitter.particles.ctx,typeof curve.spline.ctx,typeof scene.explorer.ctx,typeof __choronoInvoke);
      scene.log(emitter.particles.seed.constructor('return typeof process')());
    `, setup.scene)
    expect(result.commandCount).toBe(0)
    expect(result.scene).toEqual(setup.scene)
    expect(result.logs).toEqual(['undefined undefined undefined undefined', 'undefined'])
  })

  it('reads instance geometry and particle data but requires explicit source edits', async () => {
    const setup = await fixture()
    const created = await runSafeScript(`
      const curve=scene.find('Editable curve'), emitter=scene.find('Editable particles');
      scene.clone(curve,1,{mode:'instance'})[0].set({name:'Curve instance'});
      scene.clone(emitter,1,{mode:'instance'})[0].set({name:'Emitter instance'});
      if(!Object.keys(scene.find('Curve instance').spline.data.points).length || !scene.find('Emitter instance').particles.data.emitter) throw new Error('Instance data missing');
    `, setup.scene)
    await expect(runSafeScript(`scene.find('Emitter instance').particles.seed('implicit-source-edit')`, created.scene)).rejects.toThrow(/source/i)
    await expect(runSafeScript(`scene.find('Curve instance').spline.setFillRule('evenodd')`, created.scene)).rejects.toThrow(/source/i)
  })

  it('rolls back previous domain writes after a lock, cycle or invalid geometry operation fails', async () => {
    const setup = await fixture(), before = structuredClone(setup.scene)
    const failedScripts = [
      `scene.explorer.rename(scene.find('Editable card').id,'Changed');scene.find('Editable curve').spline.movePoint('missing',1,2);`,
      `scene.find('Editable particles').particles.seed(7);const group=scene.explorer.group([scene.find('Editable card').id]);scene.explorer.reparent(group,group);`,
      `const curve=scene.find('Editable curve');scene.explorer.setFlags(curve.id,{locked:true});curve.spline.setFillRule('evenodd');`,
      `const emitter=scene.find('Editable particles');emitter.set({locked:true});emitter.particles.applyPreset('snow');`,
      `const emitter=scene.find('Editable particles');emitter.set({frozen:true});emitter.particles.seed(8);`,
      `const parent=scene.add('group'),emitter=scene.find('Editable particles');emitter.parent(parent);parent.set({locked:true});emitter.particles.seed(8);`,
      `const parent=scene.add('group'),emitter=scene.find('Editable particles');emitter.parent(parent);parent.set({frozen:true});emitter.particles.visual({shape:'star'});`,
    ]
    for (const code of failedScripts) {
      await expect(runSafeScript(code, setup.scene)).rejects.toThrow()
      expect(setup.scene).toEqual(before)
    }
  })

  it('rejects callbacks and invalid domain data instead of silently accepting malformed configurations', async () => {
    const setup = await fixture(), before = structuredClone(setup.scene)
    const failedScripts = [
      `scene.find('Editable particles').particles.visual({shape:()=> 'star'})`,
      `scene.find('Editable particles').particles.visual({shape:Symbol('star')})`,
      `scene.find('Editable particles').particles.patch({random:{seed:1n}})`,
      `scene.find('Editable particles').particles.patch({random:{seed:-1}})`,
      `scene.find('Editable particles').particles.emission({maxParticles:10001})`,
      `scene.find('Editable particles').particles.patch({mode:'flow'})`,
      `scene.find('Editable particles').particles.patch({['__'+'proto__']:{polluted:true}})`,
      `scene.find('Editable curve').spline.appendPrimitive('star',{points:1000000000,outerRadius:10,innerRadius:5})`,
      `scene.find('Editable curve').spline.transform({a:1,b:0,c:0,d:1,e:Infinity,f:0})`,
      `scene.explorer.query({limit:999999})`,
      `scene.explorer.notExposed()`,
      `scene.find('Editable card').particles.data`,
    ]
    for (const code of failedScripts) {
      await expect(runSafeScript(code, setup.scene)).rejects.toThrow()
      expect(setup.scene).toEqual(before)
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})
