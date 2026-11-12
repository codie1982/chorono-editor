import path from 'node:path'
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

// Explicitly isolated editor QA. Authored code is sent only to run_script's
// QuickJS sandbox; Node orchestrates the actual MCP tools and never evaluates it.
const [directory, target = 'artifacts/validation/mcp-quality-20261110/after'] = process.argv.slice(2)
const root = path.resolve(directory ?? ''), output = path.resolve(target)
if (!/^\/private\/tmp\/chorono-(q|e11|e12)-validation-/.test(root)) throw Error('Isolated source snapshot required')
const client = new Client({ name: 'chorono-catalog-editor-acceptance', version: '1.0.0' })
const stamp = Date.now(), report = { passed: false, checks: [] }
await mkdir(output, { recursive: true })

/** Bounded MCP call. Only this disposable loopback editor is addressed, and
 * every editor operation carries the explicitly selected session id. */
const sourceSchemas = new Map(), retryAccess = new Map()
async function call(name, args = {}, sessionId) {
  if (!sourceSchemas.has(name)) {
    const info = await client.callTool({name:'get_capabilities',arguments:{toolName:name}})
    sourceSchemas.set(name, JSON.parse(info.content[0].text).tool.inputSchema.required?.includes('readToken'))
  }
  if (sourceSchemas.get(name) && args.readToken === undefined) {
    let authorization = args.requestId ? retryAccess.get(args.requestId) : undefined
    if (!authorization) {
      const readResult = await client.callTool({name:'get_scene',arguments:sessionId ? {sessionId} : {}})
      assert(!readResult.isError, 'Fresh read required for isolated happy-path QA')
      const read=JSON.parse(readResult.content[0].text)
      authorization={expectedRevision:read.revision,readToken:read.readToken}
      if(args.requestId)retryAccess.set(args.requestId,authorization)
    }
    args={...authorization,...args}
  }
  const response = await client.callTool({ name, arguments: { ...args, ...(sessionId ? { sessionId } : {}) } }, undefined, { timeout: 130000 })
  assert(!response.isError, `${name}: ${response.content.find(item => item.type === 'text')?.text}`)
  if (name === 'render_preview') return response
  return JSON.parse(response.content[0].text)
}

try {
  await client.connect(new StdioClientTransport({ command: process.execPath,
    args: [path.join(root, 'dist/mcp/server.cjs')], cwd: root, stderr: 'pipe', env: {
      ...process.env, CHORONO_PROJECT_ROOT: root, CHORONO_EDITOR_URL: 'http://127.0.0.1:2002',
      CHORONO_MCP_TOOL_PROFILE: 'standard', CHORONO_MCP_PROJECT_DIR: '/private/tmp/chorono-q-native-acceptance/projects',
    } }))
  const sessions = (await call('list_sessions')).sessions
  assert.equal(sessions.length, 1, 'Connect exactly one isolated port-2002 editor')
  const id = sessions[0].id, original = await call('get_scene', {}, id)
  const summary = await call('get_capabilities', { summary: true })
  assert.equal(summary.catalog.advertisedToolNames.length, 40)
  assert((await client.readResource({ uri: 'chorono://scripting' })).contents[0].text.includes('scene.add'))
  const backup = await call('save_project', { name: `q-original-${stamp}` }, id)
  report.backup = backup.path
  await call('clear_scene', { expectedRevision: original.revision }, id)
  const code = `scene.composition({id:'MCP-quality-QA',width:640,height:360,durationMs:1000,frameRate:30,backgroundColor:'#0b1020'});
    scene.createTimeline({id:'qa',durationMs:1000});
    const card=scene.add('rect');card.set({name:'Clock panel'});card.pos=[40,70];card.size=[560,250];card.fill='#16243b';card.cornerRadius=20;
    const title=scene.add('text');title.set({name:'Heading'});title.text='MCP CATALOG CHECK';title.pos=[70,100];title.size=[500,40];title.font({size:24,color:'#94a3b8'});
    const clock=scene.add('text');clock.set({name:'Human clock setting'});clock.text='09:05';clock.pos=[70,165];clock.size=[340,100];clock.font({size:80,weight:'700',color:'#f8fafc'});`
  const plan = await call('run_script', { code, dryRun: true }, id)
  const built = await call('apply_script_plan', { planId: plan.planId, expectedRevision:plan.revision, readToken:plan.readToken, requestId: `q-plan-${stamp}` }, id)
  assert.deepEqual(built.layers.map(layer => layer.id), plan.layers.map(layer => layer.id))
  let scene = await call('get_scene', {}, id)
  const clock = scene.scene.layers.find(layer => layer.name === 'Human clock setting')
  await call('update_layer', { layerId: clock.id, textColor: '#34d399', expectedRevision: scene.revision }, id)
  scene = await call('get_scene', {}, id)
  assert.equal(scene.scene.layers.find(layer => layer.id === clock.id).text.value, '09:05')
  assert.equal(scene.scene.layers.find(layer => layer.id === clock.id).text.color, '#34d399')
  report.checks.push('Narrow color edit preserves 09:05 source text')
  const accentArgs = { kind: 'circle', patch: { name: 'Native accent' }, requestId: `q-native-${stamp}` }
  const accent = await call('create_layer', accentArgs, id)
  assert.equal((await call('create_layer', accentArgs, id)).revision, accent.revision)
  const accentId = accent.addedLayerIds[0]
  await call('update_layer', { layerId: accentId, x: 520, y: 195, width: 36, height: 36, fillColor: '#34d399' }, id)
  assert.deepEqual(await call('get_layer', { layerId: accentId }, id), await call('describe_layer', { layerId: accentId }, id))
  const before = await call('get_scene', {}, id)
  const detail = await call('get_capabilities', { toolName: 'add_spline' })
  assert.equal(detail.callableInBatch, true)
  await call('batch_actions', { expectedRevision: before.revision, actions: [
    { name: 'add_spline', arguments: { id: 'qa_vector', kind: 'line', x1: 0, y1: 0, x2: 440, y2: 0, x: 70, y: 280, strokeColor: '#334155', strokeWidth: 2 } },
    { name: 'upsert_keyframes', arguments: { timelineId: 'qa', layerId: accentId, property: 'transform.x', keyframes: [{ timeMs: 0, value: 500 }, { timeMs: 1000, value: 540 }] } },
  ] }, id)
  const after = await call('get_scene', {}, id)
  await call('undo', {}, id); assert.deepEqual((await call('get_scene', {}, id)).scene, before.scene)
  await call('redo', {}, id); assert.deepEqual((await call('get_scene', {}, id)).scene, after.scene)
  report.checks.push('Advanced native discovery plus alias batch, single undo/redo and exact-name retry')
  const frame = await call('evaluate_frame', { timeMs: 500, timelineIds: ['qa'] }, id)
  assert.equal(frame.values[`layers.${accentId}.transform.x`], 520)
  assert.deepEqual(await call('get_timeline', { timelineId: 'qa' }, id), await call('describe_timeline', { timelineId: 'qa' }, id))
  assert.deepEqual(await call('evaluate_timeline_values', { timeMs: 500 }, id), await call('evaluate_at_time', { timeMs: 500 }, id))
  await call('control_playback', { action: 'pause', timeMs: 500, timelineId: 'qa', timelineIds: ['qa'] }, id)
  const png = (await call('render_preview', { timeMs: 500, timelineIds: ['qa'], width: 640 }, id)).content.find(item => item.type === 'image')
  assert.equal(png.mimeType, 'image/png')
  await writeFile(path.join(output, 'editor-preview.png'), Buffer.from(png.data, 'base64'))
  assert.equal((await call('validate_scene', {}, id)).valid, true)
  const saved = await call('save_project', { name: `q-catalog-accepted-${stamp}` }, id)
  const portable = JSON.parse(await readFile(saved.path, 'utf8'))
  await call('load_project', { name: path.basename(saved.path) }, id)
  assert.deepEqual((await call('get_scene', {}, id)).scene, portable)
  report.checks.push('Frame evaluation, PNG rendering, validation and portable save/load')
  report.savedProject = saved.path; report.sessionId = id; report.previewTimeMs = 500; report.passed = true
  await writeFile(path.join(output, 'editor-result.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report))
} finally { await client.close() }
