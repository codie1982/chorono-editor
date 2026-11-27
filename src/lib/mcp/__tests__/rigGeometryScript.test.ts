import { expect, it } from 'vitest'
import { emptyScene, newRectLayer } from '../../defaults'
import { evaluateSceneFrame } from '../../runtime/evaluateSceneFrame'
import { fakeEditor } from './support/fakeEditor'
import { runSafeScript } from '../sandbox'
import { validateToolCall } from '../catalog'

it('matches both directions from a blended pose through native MCP and the isolated script plan', async () => {
  const editor = fakeEditor()
  try {
    const layers = ['upper', 'lower', 'tip'].map((id, i) => {
      const l = newRectLayer()
      return { ...l, id, transform: { ...l.transform, x: 100*i, y: 0, anchorX: 0, anchorY: 0 } }
    })
    const source = { ...emptyScene(), layers }
    const setup = await runSafeScript(`
      scene.get('lower').rig2d({kind:'link',driverId:'upper'});
      scene.get('upper').rig2d({kind:'ik',lowerId:'lower',targetId:'tip'});
      scene.get('tip').pos=[135,50];
      scene.createTimeline({id:'motion',durationMs:1000});
    `, source)
    editor.replaceDocument(setup.scene)
    const clock = { timelineId: 'motion', localTimeMs: 410 }
    editor.host.currentTimeMs = 410
    editor.host.getDisplayedRig = () => ({ frame: evaluateSceneFrame(editor.host.editor.getScene(), 410, { externalTime: clock }), clock, autoKey: true, editingBlocked: false })
    const upper = { upperLayerId: 'upper' }
    await editor.call('set_ik2d_weight', { ...upper, weight: .4 })
    const base = editor.host.editor.getScene(), sampled = (await editor.call('get_ik2d_diagnostics', upper)).chains[0]
    expect(sampled.weight).toBe(.4)
    expect(base.timelines[0].tracks.find(t => t.target === 'layers.upper.twoBoneIK2d.weight')?.keyframes.map(k => k.timeMs)).toContain(410)
    for (const to of ['fk','ik']) {
      await editor.call('match_ik2d_pose', { ...upper, to })
      const native = (await editor.call('get_ik2d_diagnostics', upper)).chains[0]
      expect(native.weight).toBe(Number(to === 'ik'))
      for (const joint of ['shoulder','elbow','tip']) for (const axis of ['x','y'])
        expect(native.local[joint][axis]).toBeCloseTo(sampled.local[joint][axis], 7)
      await editor.call('undo')
      expect(editor.host.editor.getScene()).toEqual(base)
      const plan = await editor.call('run_script', { dryRun: true, code: `
        const u=scene.get('upper'), at={timelineId:'motion',timeMs:410,autoKey:true};
        u.rig2d({kind:'${to === 'ik' ? 'matchIK' : 'matchFK'}'},at);
        scene.log(JSON.stringify(u.rig2d({kind:'diagnostics'},at)));
      ` })
      expect(editor.host.editor.getScene()).toEqual(base)
      await editor.rawCall('apply_script_plan', { planId: plan.planId, expectedRevision: plan.revision, readToken: plan.readToken })
      expect((await editor.call('get_ik2d_diagnostics', upper)).chains[0]).toEqual(native)
      await editor.call('undo')
      expect(editor.host.editor.getScene()).toEqual(base)
    }
    await expect(runSafeScript("scene.get('upper').key('twoBoneIK2d.weight',410,2)", base)).rejects.toThrow(/0\.\.1/)
    await expect(runSafeScript("scene.get('lower').rig2d({kind:'unlink',mode:'keepPose'})", base)).rejects.toThrow(/option/)
    const detached = await runSafeScript("scene.get('lower').rig2d({kind:'unlinkKeepPose'},{timelineId:'motion',timeMs:410})", base)
    expect(detached.scene.layers.find(l => l.id === 'lower')?.pivotLink2d).toBeUndefined()
  } finally { await editor.close() }
})

it('carries same-layer conversion, directed edge edits, Smooth and Subdivision through QuickJS', async () => {
  const source = { ...emptyScene(), layers: [{ ...newRectLayer(), id: 'shape' }] }
  const { scene } = await runSafeScript(`
    const l=scene.get('shape');
    l.geometry2d('convert_layer_to_spline');
    l.geometry2d('convert_layer_to_mesh2d');
    const data=l.data.mesh2d, top=data.geometry.topology, ring=data.boundaryRings[0];
    l.geometry2d('split_mesh2d_edge',{topologyHash:top.topologyHash,fromVertexId:top.vertexIds[ring[0]],toVertexId:top.vertexIds[ring[1]]});
    const row=(operation)=>l.geometry2d('edit_2d_modifier_stack',{operation});
    row({kind:'add',type:'meshSmooth'});
    const modifierId=l.data.modifierStack.modifiers.slice(-1)[0].id;
    row({kind:'settings',modifierId,values:{strength:.2,preserveBoundary:true}});
    l.geometry2d('apply_mesh2d_subdivision',{algorithm:'delaunay',cellSizePx:40,levels:1});
    row({kind:'execute'});
  `, source)
  expect(scene.layers.map(l=>l.id)).toEqual(['shape'])
  expect(scene.layers[0].modifierStack!.modifiers.map(r=>r.type)).toEqual(['convertSpline','convertMesh2d','meshTransform','meshSmooth','meshSubdivision'])
  expect(scene.layers[0].transform).toEqual(source.layers[0].transform)
  await expect(runSafeScript("scene.get('shape').geometry2d('edit_mesh2d_topology',{action:'flipEdge',topologyHash:'stale',ids:['edge']})", scene)).rejects.toThrow(/topology changed/i)
  await expect(runSafeScript("scene.get('shape').geometry2d('delete_layer')", scene)).rejects.toThrow(/Unknown/)
  await expect(validateToolCall('match_ik2d_pose', { upperLayerId: 'upper', to:'ik' })).rejects.toThrow()
})

it('resolves a retained Boolean recipe at its owner and restores the inputs in one Undo', async () => {
  const editor = fakeEditor()
  try {
    const { makePickBooleanCmd } = await import('../../editor/boolean/pickOperation')
    const draft = await runSafeScript("scene.addSpline('circle',{radius:32},{x:0,y:0});scene.addSpline('circle',{radius:32},{x:25,y:0})", emptyScene())
    const [a,b] = draft.scene.layers.map(l => l.id)
    const recipe = makePickBooleanCmd(draft.scene, a, b, 'union')!.execute(draft.scene)
    const owner = recipe.layers.find(l => l.booleanOperation)!
    editor.replaceDocument(recipe)
    await editor.call('resolve_spline_boolean', {layerId:owner.id,action:'merge'})
    expect(editor.host.editor.getScene().layers.map(l => [l.id,l.type])).toEqual([[owner.id,'spline']])
    await editor.call('undo')
    expect(editor.host.editor.getScene()).toEqual(recipe)
    const separate = await runSafeScript("scene.get("+JSON.stringify(owner.id)+").geometry2d('resolve_spline_boolean',{action:'separate'})", recipe)
    expect(separate.scene.layers.map(l => l.id).sort()).toEqual([a,b,owner.id].sort())
    expect(separate.scene.layers.some(l => l.booleanOperation)).toBe(false)
  } finally { await editor.close() }
})

it('uses the displayed quad ID for face deletion and allows filling that hole through MCP', async () => {
  const editor = fakeEditor()
  try {
    const { StructuredGridMesh2DGenerator } = await import('../../geometry/mesh2d/StructuredGridMesh2DGenerator')
    const { newStructuredGridMesh2DLayer } = await import('../../registry/definitions/mesh2d/Mesh2DDefinition')
    const { MeshFaceTopology } = await import('../../geometry/mesh2d/selection/MeshFaceTopology')
    const mesh = new StructuredGridMesh2DGenerator().generate({width:100,height:100,columns:3,rows:3,diagonal:'topLeftToBottomRight'})
    const layer = { ...newStructuredGridMesh2DLayer(), id:'grid', mesh2d:mesh }
    const original = { ...emptyScene(), layers:[layer] }
    editor.replaceDocument(original)
    const face = new MeshFaceTopology(mesh.geometry, mesh.source).faces[4]
    const args = {layerId:'grid', topologyHash:mesh.geometry.topology.topologyHash}
    await editor.call('edit_mesh2d_topology',{...args,ids:[face.id],action:'deleteFace'})
    const hole = editor.host.editor.getScene().layers[0].mesh2d!
    expect(hole.boundaryRings).toHaveLength(2)
    const ring = hole.boundaryRings![1], ids = hole.geometry.topology.vertexIds
    const edges = ring.map((a,i) => {
      const b = ring[(i+1)%ring.length]
      return JSON.stringify([ids[Math.min(a,b)],ids[Math.max(a,b)]])
    })
    await editor.call('edit_mesh2d_topology',{...args,topologyHash:hole.geometry.topology.topologyHash,ids:edges,action:'fill'})
    expect(editor.host.editor.getScene().layers[0].mesh2d!.boundaryRings).toHaveLength(1)
    await editor.call('undo'); await editor.call('undo')
    expect(editor.host.editor.getScene()).toEqual(original)
  } finally { await editor.close() }
})
