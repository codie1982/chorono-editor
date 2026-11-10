import path from 'node:path'
import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(root, '.chorono/smoke')
await mkdir(output, { recursive: true })
const client = new Client({ name: 'chorono-smoke-test', version: '1.0.0' })
// The SDK forwards only a small default environment. Pass the selected editor
// URL explicitly so isolated QA never falls back to the user's port 2000.
const transportOptions = { command: process.execPath, args: [path.join(root, 'dist/mcp/server.cjs')], cwd: root, env: { ...process.env, CHORONO_PROJECT_ROOT: root } }
const transport = new StdioClientTransport(transportOptions)
await client.connect(transport)
const report = {}
// Happy-path QA only: acquire explicit source reads for old test steps. Guard
// rejection tests use raw client.callTool and never silently refresh stale work.
const sourceSchemas = new Map(), retryAccess = new Map()
const call = async (name, args = {}) => {
  if (!sourceSchemas.has(name)) {
    const info = await client.callTool({name:'get_capabilities',arguments:{toolName:name}})
    sourceSchemas.set(name, JSON.parse(info.content[0].text).tool.inputSchema.required?.includes('readToken'))
  }
  if (sourceSchemas.get(name) && args.readToken === undefined) {
    let authorization = args.requestId ? retryAccess.get(args.requestId) : undefined
    if (!authorization) {
      const readResult = await client.callTool({name:'get_scene',arguments:args.sessionId ? {sessionId:args.sessionId} : {}})
      assert(!readResult.isError, 'Source read must succeed before happy-path QA edit')
      const read = JSON.parse(readResult.content[0].text)
      authorization = {expectedRevision:read.revision,readToken:read.readToken}
      if(args.requestId)retryAccess.set(args.requestId,authorization)
    }
    args={...authorization,...args}
  }
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 130000 })
  if (result.isError) throw new Error(`${name}: ${result.content[0]?.text}`)
  if (name === 'render_preview') return result
  return JSON.parse(result.content[0].text)
}
try {
  report.tools = (await client.listTools()).tools.length
  report.resources = (await client.listResources()).resources.length
  const capabilities = await call('get_capabilities', { summary: true })
  report.objectKinds = capabilities.objectKinds.length
  assert.equal(report.tools, capabilities.catalog.advertisedToolNames.length)
  assert(report.tools > 0)
  const { sessions } = await call('list_sessions')
  report.connectedEditors = sessions.length
  if (process.argv.includes('--write')) {
    assert.equal(sessions.length, 1, 'Connect exactly one editor for the write smoke test')
    const original = await call('get_scene')
    const stamp = Date.now()
    const backup = 'smoke-original-' + stamp
    await call('save_project', { name: backup })
    try {
      await call('clear_scene', { expectedRevision: original.revision })
      const code = `
        scene.composition({id:'MCP-Demo',width:640,height:360,durationMs:3000,frameRate:30,backgroundColor:'#0b1020'});
        const intro=scene.createTimeline({id:'intro',durationMs:3000});
        const card=scene.add('rect');card.set({name:'Hero card'});card.pos=[64,70];card.size=[512,210];card.fill='#152442';card.cornerRadius=24;card.stroke({color:'#2b4778',width:2});
        intro.key(card,'opacity',0,0,'easeOut').key(card,'opacity',700,1);
        intro.key(card,'transform.y',0,100,'easeOut').key(card,'transform.y',1000,70);
        const title=scene.add('text');title.set({name:'Headline'});title.text='Connected by MCP';title.font({size:38,weight:'700',color:'#f4f7ff'});title.pos=[108,110];title.size=[450,60];
        intro.key(title,'opacity',0,0,'easeOut').key(title,'opacity',900,1);
        const subtitle=scene.add('text');subtitle.set({name:'Caption'});subtitle.text='Claude + Codex / editable animations';subtitle.font({size:17,color:'#9db5df'});subtitle.pos=[110,170];subtitle.size=[430,40];
        for(let i=0;i<10;i++){const dot=scene.add('circle');dot.set({name:'Dot '+i});dot.pos=[112+i*39,230];dot.size=[12,12];dot.fill=i%2?'#a78bfa':'#60a5fa';intro.key(dot,'opacity',0,0).key(dot,'opacity',500+i*70,1);intro.key(dot,'transform.y',0,260,'easeOut').key(dot,'transform.y',1100+i*40,230);}
        const loop=scene.cloneTimeline('intro','loop');loop.set({loop:true});loop.modifier('layers.'+card.id+'.transform.y',{type:'sine',parameters:{amplitude:8,frequency:1}});
        scene.addEmitter('sparkle',{x:550,y:90}).configureParticles({emitter:{maxParticles:24}});
        scene.addParam('energy',1,{min:0,max:1});scene.wire('energy','opacity','source',{targetLayerId:card.id});
        const machine=scene.addStateMachine('Presentation');const a=machine.addState('Intro','intro'),b=machine.addState('Loop','loop');machine.addTransition(a,b,'next');
        scene.log('Built',scene.layers.length,'objects');
      `
      const plan = await call('run_script', { code, dryRun: true })
      assert.equal((await call('get_scene')).scene.layers.length, 0)
      const applied = await call('apply_script_plan', { planId: plan.planId, expectedRevision:plan.revision, readToken:plan.readToken, requestId: 'smoke-plan-' + stamp })
      assert.deepEqual(applied.layers.map(l=>l.id), plan.layers.map(l=>l.id))
      report.layers = applied.layers.length
      await call('clone_timeline', { timelineId:'loop',newId:'alternate' })
      await call('update_timeline', { timelineId:'alternate',patch:{durationMs:2000,loop:false} })
      assert.equal(JSON.parse((await call('list_timelines')).content).length, 3)
      await call('delete_timeline', { timelineId:'alternate' })
      // A previous test may have isolated another timeline in the live editor.
      await call('control_playback',{action:'pause',timelineIds:[]})
      await call('control_runtime',{event:'next',parameters:{energy:0.8}})
      const runtime=await call('get_runtime')
      assert.equal(runtime.stateMachines[0].stateName,'Loop')
      assert.equal(runtime.parameters.energy,0.8)
      const live=await call('render_preview',{width:320})
      assert(live.content.some(c=>c.type==='image'))
      report.liveStateMachine='passed'
      await call('control_runtime',{testMode:false})
      await call('control_playback', { action:'pause',timeMs:1500,timelineId:'intro',timelineIds:['intro'] })
      const values = await call('evaluate_frame', { timeMs:1500,timelineIds:['intro'] })
      report.evaluatedProperties = Object.keys(values.values).length
      const preview = await call('render_preview', { timeMs:1500,timelineIds:['intro'],width:960 })
      const png = preview.content.find(c=>c.type==='image')
      assert.equal(png.mimeType,'image/png')
      await writeFile(path.join(output,'preview.png'),Buffer.from(png.data,'base64'))
      // Reimport the actual preview; no untracked design-mockup fixture is needed.
      const pngFile = Buffer.from(png.data,'base64')
      const imported = await call('import_asset',{name:'mcp-test-reference.png',mimeType:'image/png',data:pngFile.toString('base64')})
      await call('undo');await call('redo')
      await call('render_preview',{timeMs:1500,timelineIds:['intro'],width:320})
      await call('import_asset',{name:'GeistVF.woff',mimeType:'font/woff',data:(await readFile(path.join(root,'public/fonts/GeistVF.woff'))).toString('base64')})
      const withFont=await call('get_scene')
      const font=withFont.scene.assets.find(a=>a.type==='font')
      const headline=withFont.scene.layers.find(l=>l.name==='Headline')
      await call('patch_object',{layerId:headline.id,patch:{text:{...headline.text,fontFamily:font.metadata.notes.replace('family: ','')}}})
      report.portableFont='passed'
      const saved = await call('save_project', { name:'mcp-demo-' + stamp })
      const project = JSON.parse(await readFile(saved.path,'utf8'))
      assert(project.assets.every(a=>!a.url.startsWith('blob:')))
      assert(project.assets.some(a=>a.url.startsWith('data:')))
      report.savedProject = saved.path
      for (const name of ['export_runtime','export_svg','export_sequence']) {
        const exported = await call(name,{name:name+'-'+stamp,...(name==='export_sequence'?{fps:1,timelineIds:['intro']}:{})})
        await access(exported.path)
        report[name] = exported.path
      }
      await call('load_project', {name:'mcp-demo-'+stamp})
      assert.equal((await call('get_scene')).scene.assets.length,project.assets.length)
      await call('undo');await call('redo')
      const safe = await call('run_script',{code:'scene.log(typeof process,typeof require,typeof fetch)'})
      assert.equal(safe.logs[0],'undefined undefined undefined')
      const revision = (await call('get_scene')).revision
      const denied = await client.callTool({name:'run_script',arguments:{code:'while(true){}',...(await call('get_scene').then(read=>({expectedRevision:read.revision,readToken:read.readToken})))}},undefined,{timeout:10000})
      assert(denied.isError)
      assert.equal((await call('get_scene')).revision,revision)
      report.sandboxTimeout = 'passed'
      report.timelines = (await call('get_scene')).scene.timelines.length
      report.portableMedia = 'passed'
      await call('load_project', {name:'mcp-demo-'+stamp})
      await call('control_playback',{action:'pause',timeMs:1500,timelineId:'intro',timelineIds:['intro']})
      const second = new Client({name:'chorono-second-client',version:'1.0.0'})
      await second.connect(new StdioClientTransport(transportOptions))
      try {
        const current = await call('get_scene')
        const read = await second.callTool({name:'get_scene',arguments:{}})
        assert.equal(JSON.parse(read.content[0].text).revision,current.revision)
        const hero = current.scene.layers.find(l=>l.name==='Hero card')
        const args = {layerId:hero.id,patch:{name:'Hero card'},expectedRevision:current.revision,readToken:current.readToken}
        const results = await Promise.all([client.callTool({name:'patch_object',arguments:args}),second.callTool({name:'patch_object',arguments:{...args,readToken:JSON.parse(read.content[0].text).readToken}})])
        assert.equal(results.filter(r=>r.isError).length,1)
        assert(results.find(r=>r.isError).content[0].text.includes('revision conflict'))
        report.sharedTwoClients = 'passed'
      } finally { await second.close() }
      for(const id of imported.addedLayerIds) await call('delete_layer',{layerId:id})
      report.cleanProject = (await call('save_project',{name:'mcp-demo-clean-'+stamp})).path
      const finalPreview=await call('render_preview',{timeMs:1500,timelineIds:['intro'],width:960})
      await writeFile(path.join(output,'preview.png'),Buffer.from(finalPreview.content.find(c=>c.type==='image').data,'base64'))
    } finally {
      if (!process.argv.includes('--keep-demo')) await call('load_project',{name:backup})
    }
  }
  report.ok = true
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2))
  console.log(JSON.stringify(report,null,2))
} finally { await client.close() }
