import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import net from 'node:net'
import http from 'node:http'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, realpath } from 'node:fs/promises'
import { configureClients } from '../lib/config.mjs'
import { setupEditor, doctorEditor, startEditor, stopEditor, probeEditor, runProcess } from '../lib/editor.mjs'
import { run } from '../lib/cli.mjs'

async function write(file, content = '') { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, content) }
async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}
const mockNext = `
const http=require('node:http'),fs=require('node:fs'),crypto=require('node:crypto');
const port=Number(process.argv[process.argv.indexOf('-p')+1]);
http.createServer((req,res)=>{
  res.setHeader('content-type','application/json');
  if(req.method==='GET'){res.end(JSON.stringify({enabled:process.env.CHORONO_MCP_ENABLED==='1',editorId:crypto.createHash('sha256').update(process.cwd()).digest('hex').slice(0,16),projectId:crypto.createHash('sha256').update(process.env.CHORONO_MCP_PROJECT_DIR).digest('hex').slice(0,16),pid:process.pid,version:'test'}));return;}
  const token=fs.readFileSync('.chorono/mcp-token','utf8');
  if(req.headers.authorization!=='Bearer '+token){res.statusCode=403;res.end('{}');return;}
  res.end(JSON.stringify({result:{sessions:[]}}));
}).listen(port,'127.0.0.1');
`
async function fixture(t) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'chorono-editor-cli-')))
  t.after(() => rm(root, { recursive: true, force: true }))
  const editor = path.join(root, 'editor checkout'), project = path.join(root, 'video project'), home = path.join(root, 'home')
  for (const p of [editor, project, home]) await mkdir(p)
  await write(path.join(editor, 'package.json'), JSON.stringify({ name: 'chorono-editor', scripts: { 'mcp:build': 'node build.mjs' } }))
  await write(path.join(editor, 'src/app/api/mcp/route.ts'), '// fixture')
  const calls = []
  const config = { home, codexHome: path.join(home, '.codex'), platform: 'darwin' }
  const runner = async (command, args, options) => {
    if (command === 'git') return runProcess(command, args, options)
    calls.push(args.includes('ci') ? 'ci' : args.at(-1))
    if (args.includes('ci')) {
      for (const p of ['@modelcontextprotocol/sdk/package.json', 'quickjs-emscripten/package.json', 'ajv/package.json', 'esbuild/package.json']) await write(path.join(options.cwd, 'node_modules', p), '{}')
      await write(path.join(options.cwd, 'node_modules/next/dist/bin/next'), mockNext)
    } else if (args.at(-1) === 'mcp:build') await write(path.join(options.cwd, 'dist/mcp/server.cjs'), '// built adapter')
    else if (args.at(-1) === 'build') await write(path.join(options.cwd, '.next/BUILD_ID'), 'test-build')
    else throw new Error('Unexpected subprocess')
  }
  return { root, editor, project, home, calls, context: { config, home, runProcess: runner } }
}

test('setup installs/builds in order, configures exact paths, then reuses existing work without fetching or rebuilding', async t => {
  const f = await fixture(t)
  const options = { project: f.project, editor: f.editor, port: await freePort() }
  const result = await setupEditor(options, f.context)
  assert(result.ok)
  assert.deepEqual(f.calls, ['ci', 'mcp:build', 'build'])
  const code = JSON.parse(await readFile(path.join(f.project, '.mcp.json'), 'utf8'))
  assert.equal(code.mcpServers.chorono.env.CHORONO_EDITOR_URL, result.url)
  assert.equal(code.mcpServers.chorono.env.CHORONO_MCP_PROJECT_DIR, path.join(f.project, 'projects'))
  assert.equal(code.mcpServers.chorono.args[0], path.join(f.editor, 'dist/mcp/server.cjs'))
  assert.equal(result.skills.entries.length, 4)
  f.calls.length = 0
  assert((await setupEditor({ project: f.project }, f.context)).ok)
  assert.deepEqual(f.calls, [])
})

test('fresh setup clones a local Git source and refuses an older checkout without MCP support', async t => {
  const f = await fixture(t)
  await runProcess('git', ['init', '-b', 'main'], { cwd: f.editor })
  await runProcess('git', ['add', '.'], { cwd: f.editor })
  await runProcess('git', ['-c', 'user.name=Chorono Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture'], { cwd: f.editor })
  const result = await setupEditor({ project: f.project, repo: f.editor, ref: 'main', port: await freePort() }, f.context)
  assert(result.cloned)
  assert.equal(result.editorRoot, path.join(f.project, '.chorono/editor'))
  assert.deepEqual(f.calls, ['ci', 'mcp:build', 'build'])
  const old = path.join(f.root, 'old-editor'); await mkdir(old)
  await write(path.join(old, 'package.json'), JSON.stringify({ name: 'chorono-editor' }))
  await assert.rejects(setupEditor({ project: f.project, editor: old }, f.context), /MCP-capable/)
})

test('doctor is read-only and distinguishes a working server from a connected editor', async t => {
  const f = await fixture(t), port = await freePort()
  const before = await readdir(f.project)
  const missing = await doctorEditor({ project: f.project, editor: f.editor, port }, f.context)
  assert.equal(missing.ready, false)
  assert.deepEqual(await readdir(f.project), before)
  await setupEditor({ project: f.project, editor: f.editor, port }, f.context)
  const id = createHash('sha256').update(f.editor).digest('hex').slice(0,16)
  const projectId = createHash('sha256').update(path.join(f.project, 'projects')).digest('hex').slice(0,16)
  const fetcher = connected => async (url, options) => ({ ok: true, json: async () => options?.method === 'POST' ? { result: { sessions: Array.from({ length: connected }, () => ({ id: 'tab' })) } } : { enabled: true, editorId: id, projectId, pid: 1234, version: '1.0.0' } })
  const waiting = await doctorEditor({ project: f.project }, { ...f.context, fetch: fetcher(0) })
  assert.equal(waiting.ready, false)
  assert(waiting.nextSteps.some(s => s.includes('Connect this editor')))
  const ready = await doctorEditor({ project: f.project }, { ...f.context, fetch: fetcher(1) })
  assert.equal(ready.ready, true)
  const mismatch = await probeEditor({ editorRoot: f.editor, port }, { fetch: async () => ({ ok: true, json: async () => ({ enabled: true, editorId: 'another-editor' }) }) })
  assert.equal(mismatch.state, 'different-editor')
  const otherProject = await probeEditor({ editorRoot: f.editor, projectRoot: f.home, port }, { fetch: fetcher(1) })
  assert.equal(otherProject.state, 'different-project')
})

test('managed background start is reusable and stop refuses a forged process record', async t => {
  const f = await fixture(t), port = await freePort()
  await setupEditor({ project: f.project, editor: f.editor, port }, f.context)
  let pid
  t.after(() => { if (pid) try { process.kill(pid) } catch {} })
  const started = await startEditor({ project: f.project, background: true }, f.context)
  pid = started.server.pid
  assert(started.ok)
  assert.equal(started.server.connectedEditors, 0)
  const reused = await startEditor({ project: f.project, background: true }, f.context)
  assert.equal(reused.reused, true)
  assert.equal(reused.server.pid, pid)
  await assert.rejects(startEditor({ project: f.project, port: await freePort(), background: true }, f.context), /already has a managed server/)
  await assert.rejects(setupEditor({ project: f.project, rebuild: true }, f.context), /Stop the running editor/)
  const file = path.join(f.editor, '.chorono/server.json')
  const record = JSON.parse(await readFile(file, 'utf8'))
  await writeFile(file, JSON.stringify({ ...record, pid: process.pid }))
  await assert.rejects(stopEditor({ project: f.project }, f.context), /identity/)
  await writeFile(file, JSON.stringify(record))
  assert.equal((await stopEditor({ project: f.project }, f.context)).stopped, true)
  pid = null
})

test('start preserves an unrelated service on the selected port', async t => {
  const f = await fixture(t), port = await freePort()
  await setupEditor({ project: f.project, editor: f.editor, port }, f.context)
  const other = http.createServer((request, response) => { request.resume(); response.setHeader('Content-Type','application/json'); response.end('{}') })
  await new Promise(resolve => other.listen(port, '127.0.0.1', resolve))
  t.after(() => { other.closeAllConnections(); return new Promise(resolve => other.close(resolve)) })
  await assert.rejects(startEditor({ project: f.project, background: true }, f.context), /occupied/)
  assert(other.listening)
})

test('client configuration preserves unrelated entries and backs up files, including unusual TOML entries', async t => {
  const f = await fixture(t)
  const codex = path.join(f.home, '.codex/config.toml')
  const previous = 'model = "test"\n[mcp_servers.other]\ncommand = "other-server"\n'
  await write(codex, previous)
  const opts = { ...f.context.config, editorRoot: f.editor, projectRoot: f.project, port: 2345, install: true }
  const configured = await configureClients(opts)
  assert(configured.clients.every(c => c.status === 'installed'))
  assert((await readFile(codex, 'utf8')).startsWith(previous))
  const backups = (await readdir(configured.directory)).filter(n => n.endsWith('.backup'))
  assert.equal(await readFile(path.join(configured.directory, backups[0]), 'utf8'), previous)
  const current = await configureClients({ ...opts, install: false, generate: false })
  assert(current.clients.every(c => c.status === 'current'))
  await writeFile(codex, '[mcp_servers]\nchorono = { command = "my-server" }\n')
  const preserved = await configureClients(opts)
  assert.equal(preserved.clients[0].status, 'unverified')
  assert.equal(await readFile(codex, 'utf8'), '[mcp_servers]\nchorono = { command = "my-server" }\n')
})

test('editor CLI rejects unsupported flags and ambiguous JSON foreground output before side effects', async t => {
  const f = await fixture(t), context = { cwd: f.project, output: () => {} }
  await assert.rejects(run(['start', '--json'], context), /background/)
  await assert.rejects(run(['setup', '--port', 'http://example.com'], context), /Port/)
  await assert.rejects(run(['setup', '--ref', '--upload'], context), /Missing value/)
  await assert.rejects(run(['doctor', '--rebuild'], context), /Unknown doctor option/)
  assert.deepEqual(await readdir(f.project), [])
  await write(path.join(f.project, '.chorono/installation.json'), JSON.stringify({editorRoot:f.editor,port:'2000@external.invalid'}))
  await assert.rejects(doctorEditor({project:f.project}, f.context), /Saved or requested port/)
})
