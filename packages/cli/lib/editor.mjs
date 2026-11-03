import path from 'node:path'
import os from 'node:os'
import net from 'node:net'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { access, mkdir, readFile, writeFile, open, lstat, rename, rm, realpath } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { configureClients, safeDirectory, CLIENTS } from './config.mjs'
import { manageSkills } from './skills.mjs'

const defaultRepo = 'https://github.com/codie1982/chorono-editor.git'
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const has = async p => { try { await access(p); return true } catch (e) { if (e.code === 'ENOENT') return false; throw e } }
const readJson = async p => { try { return JSON.parse(await readFile(p, 'utf8')) } catch (e) { if (e.code === 'ENOENT') return null; throw e } }
const identity = p => createHash('sha256').update(p).digest('hex').slice(0, 16)
const origin = port => `http://127.0.0.1:${port}`

export async function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: { ...process.env, ...options.env }, stdio: ['ignore', 'pipe', 'pipe'], shell: false })
    let errorText = ''
    for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { options.log?.(data.toString()); errorText = (errorText + data).slice(-4000) })
    const timer = setTimeout(() => { child.kill(); reject(new Error(`${path.basename(command)} timed out`)) }, options.timeout ?? 600000)
    child.once('error', e => { clearTimeout(timer); reject(e) })
    child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`${path.basename(command)} exited ${code}: ${errorText.trim()}`)) })
  })
}
function npmCommand(args) {
  if (process.env.npm_execpath) return [process.execPath, [process.env.npm_execpath, ...args]]
  if (process.platform === 'win32') return [process.execPath, [path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), ...args]]
  return ['npm', args]
}
async function editorPackage(root) {
  const pkg = await readJson(path.join(root, 'package.json'))
  return pkg?.name === 'chorono-editor' && pkg.scripts?.['mcp:build'] && await has(path.join(root, 'src/app/api/mcp/route.ts')) ? pkg : null
}
async function ensureEditor(root) {
  if (!await editorPackage(root)) throw new Error(`Not an MCP-capable Chorono checkout: ${root}. Use a repository/ref containing the MCP changes, or pass --editor to an existing checkout.`)
}
export async function resolveInstallation(options) {
  const projectRoot = path.resolve(options.project ?? process.cwd())
  const pointer = await readJson(path.join(projectRoot, '.chorono/installation.json'))
  let editorRoot = options.editor ? path.resolve(projectRoot, options.editor) : pointer?.editorRoot
  if (!editorRoot) {
    let cursor = projectRoot
    while (true) {
      if (await editorPackage(cursor)) { editorRoot = cursor; break }
      const parent = path.dirname(cursor); if (parent === cursor) break; cursor = parent
    }
  }
  editorRoot ??= path.join(projectRoot, '.chorono/editor')
  if (await has(editorRoot)) editorRoot = await realpath(editorRoot)
  const port = options.port ?? pointer?.port ?? 2000
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Saved or requested port must be an integer from 1024 to 65535')
  return { projectRoot, editorRoot, port, url: origin(port) }
}
async function tokenFor(root, create = false) {
  const directory = path.join(root, '.chorono'), file = path.join(directory, 'mcp-token')
  if (create) {
    await safeDirectory(directory); await mkdir(directory, { recursive: true, mode: 0o700 })
    try { const handle = await open(file, 'wx', 0o600); try { await handle.writeFile(randomBytes(32).toString('hex')) } finally { await handle.close() } }
    catch (e) { if (e.code !== 'EEXIST') throw e }
  }
  if (!await has(file)) return null
  const stat = await lstat(file)
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw new Error('Local MCP token must be a private regular file (0600)')
  const token = (await readFile(file, 'utf8')).trim()
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid local MCP token file')
  return token
}
export async function probeEditor({ editorRoot, projectRoot = editorRoot, port }, options = {}) {
  const fetcher = options.fetch ?? fetch
  let status
  try {
    const response = await fetcher(`${origin(port)}/api/mcp?op=status`, { signal: AbortSignal.timeout(1500), redirect: 'error' })
    status = await response.json()
    if (!response.ok || typeof status.enabled !== 'boolean') return { state: 'other-service', enabled: false, connectedEditors: 0 }
  } catch { return { state: 'offline', enabled: false, connectedEditors: 0 } }
  const matches = status.editorId === identity(editorRoot)
  if (!matches) return { state: status.editorId ? 'different-editor' : 'legacy-server', enabled: status.enabled, connectedEditors: 0 }
  if (status.projectId !== identity(path.join(projectRoot, 'projects'))) return { state: 'different-project', enabled: status.enabled, connectedEditors: 0 }
  if (!status.enabled) return { state: 'disabled', enabled: false, connectedEditors: 0, pid: status.pid }
  const token = await tokenFor(editorRoot)
  if (!token) return { state: 'unpaired', enabled: true, connectedEditors: 0, pid: status.pid }
  try {
    const response = await fetcher(`${origin(port)}/api/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ op: 'call', name: 'list_sessions', arguments: {}, clientName: 'chorono-cli-doctor' }), signal: AbortSignal.timeout(3000), redirect: 'error' })
    const body = await response.json()
    if (!response.ok || !Array.isArray(body.result?.sessions)) return { state: 'unauthorized', enabled: true, connectedEditors: 0, pid: status.pid }
    return { state: 'running', enabled: true, connectedEditors: body.result.sessions.length, pid: status.pid, version: status.version }
  } catch { return { state: 'unreachable-bridge', enabled: true, connectedEditors: 0, pid: status.pid } }
}
async function portBusy(port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port })
    const finish = answer => { socket.destroy(); resolve(answer) }
    socket.setTimeout(1000, () => finish(true)); socket.once('connect', () => finish(true)); socket.once('error', () => finish(false))
  })
}
async function locked(root, work) {
  const directory = path.join(root, '.chorono')
  await safeDirectory(directory); await mkdir(directory, { recursive: true, mode: 0o700 })
  const file = path.join(directory, 'editor-operation.lock')
  let lock
  try { lock = await open(file, 'wx', 0o600) }
  catch (e) { if (e.code === 'EEXIST') throw new Error(`Another editor operation may be active. After verifying it stopped, remove ${file}`); throw e }
  try { return await work() } finally { await lock.close(); await rm(file, { force: true }) }
}
async function atomicJson(file, value) {
  await safeDirectory(path.dirname(file)); await mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  try { const stat = await lstat(file); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Refusing state file: ${file}`) } catch (e) { if (e.code !== 'ENOENT') throw e }
  const temporary = file + '.' + randomUUID() + '.tmp'
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  try { await rename(temporary, file) } finally { await rm(temporary, { force: true }) }
}
const nextFile = root => path.join(root, 'node_modules/next/dist/bin/next')
async function dependenciesReady(root) {
  const files = ['next/dist/bin/next', '@modelcontextprotocol/sdk/package.json', 'quickjs-emscripten/package.json', 'ajv/package.json', 'esbuild/package.json']
  return (await Promise.all(files.map(file => has(path.join(root, 'node_modules', file))))).every(Boolean)
}
const selectedAgents = agent => !agent || agent === 'all' ? CLIENTS : [agent]
const selectedSkillAgents = agent => agent === 'claude-desktop' ? null : agent ?? 'all'

export async function setupEditor(options, context = {}) {
  if (Number(process.versions.node.split('.')[0]) < 20) throw new Error('Node.js 20 or later is required')
  const install = await resolveInstallation(options)
  const { projectRoot, editorRoot, port } = install
  await safeDirectory(projectRoot); await mkdir(projectRoot, { recursive: true })
  const runner = context.runProcess ?? runProcess
  return locked(projectRoot, async () => {
    let cloned = false
    if (!await has(editorRoot)) {
      await safeDirectory(path.dirname(editorRoot)); await mkdir(path.dirname(editorRoot), { recursive: true })
      const temporary = editorRoot + '.clone-' + randomUUID()
      try {
        const args = ['clone', '--depth', '1', ...(options.ref ? ['--branch', options.ref] : []), '--', options.repo ?? defaultRepo, temporary]
        context.log?.('Downloading Chorono editor…\n')
        await runner('git', args, { env: { GIT_TERMINAL_PROMPT: '0', GIT_LFS_SKIP_SMUDGE: '1' }, log: context.log })
        await ensureEditor(temporary)
        await rename(temporary, editorRoot)
        cloned = true
      } finally { await rm(temporary, { recursive: true, force: true }) }
    }
    await ensureEditor(editorRoot)
    const dependencies = await dependenciesReady(editorRoot)
    const installDependencies = !dependencies || options.reinstall
    const mcpBuild = installDependencies || options.rebuild || !await has(path.join(editorRoot, 'dist/mcp/server.cjs'))
    const editorBuild = installDependencies || options.rebuild || !await has(path.join(editorRoot, '.next/BUILD_ID'))
    if (installDependencies || mcpBuild || editorBuild) {
      const recorded = await readJson(path.join(editorRoot, '.chorono/server.json'))
      if (await portBusy(port) || (recorded?.port && recorded.port !== port && await portBusy(recorded.port))) throw new Error('Stop the running editor before installing dependencies or building it. A busy port is never stopped automatically.')
    }
    const npm = async args => { const [command, argv] = npmCommand(args); await runner(command, argv, { cwd: editorRoot, log: context.log }) }
    if (installDependencies) await npm(['ci', '--include=dev', '--no-audit', '--no-fund'])
    if (mcpBuild) await npm(['run', 'mcp:build'])
    if (editorBuild) await npm(['run', 'build'])
    await tokenFor(editorRoot, true)
    const configs = await configureClients({ ...context.config, editorRoot, projectRoot, port, agents: selectedAgents(options.agent), install: !options.noClients })
    const skillAgent = selectedSkillAgents(options.agent)
    const skills = options.noSkills || !skillAgent ? null : await manageSkills({ action: 'update', packageRoot: context.packageRoot ?? packageRoot, project: projectRoot, home: context.home ?? os.homedir(), agent: skillAgent, global: false })
    await atomicJson(path.join(projectRoot, '.chorono/installation.json'), { editorRoot, port })
    return { ...install, ok: (options.noClients || configs.clients.every(c => ['installed', 'current'].includes(c.status))) && (!skills || skills.ok), cloned, built: { mcp: !!mcpBuild, editor: !!editorBuild }, configs, skills, nextSteps: ['Run chorono start --background --open', 'In the editor choose MCP → Connect this editor', 'Reload client MCP connections / start a new agent session', 'Run chorono doctor'] }
  })
}

export async function doctorEditor(options, context = {}) {
  const install = await resolveInstallation(options)
  const { editorRoot, projectRoot, port } = install
  const checkout = !!await editorPackage(editorRoot)
  const dependencies = checkout && await dependenciesReady(editorRoot)
  const builds = { mcp: await has(path.join(editorRoot, 'dist/mcp/server.cjs')), editor: await has(path.join(editorRoot, '.next/BUILD_ID')) }
  const server = await probeEditor(install, context)
  const configs = await configureClients({ ...context.config, editorRoot, projectRoot, port, agents: selectedAgents(options.agent), install: false, generate: false })
  const checks = { node: Number(process.versions.node.split('.')[0]) >= 20, checkout, dependencies, builds, clients: configs.clients, server }
  const ready = checks.node && checkout && dependencies && builds.mcp && builds.editor && configs.clients.every(c => c.status === 'current') && server.state === 'running' && server.connectedEditors > 0
  const nextSteps = []
  if (!checkout || !dependencies || !builds.mcp || !builds.editor || configs.clients.some(c => c.status === 'missing')) nextSteps.push('Run chorono setup')
  if (configs.clients.some(c => ['stale', 'unverified'].includes(c.status))) nextSteps.push(`Review the existing chorono client entry; generated snippets: ${path.join(editorRoot, '.chorono/client-configs')}`)
  if (server.state === 'offline') nextSteps.push('Run chorono start --background --open')
  else if (server.state !== 'running') nextSteps.push(`Resolve editor server state: ${server.state}. Another process is never replaced automatically.`)
  if (server.state === 'running' && server.connectedEditors === 0) nextSteps.push('Open the editor and choose MCP → Connect this editor')
  if (ready) nextSteps.push('The bridge is ready. If tools are absent in this chat, reload the client MCP connections / start a new session.')
  return { ...install, ok: !!ready, ready: !!ready, checks, nextSteps }
}

async function openBrowser(url) {
  const [command, args] = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]] : ['xdg-open', [url]]
  await runProcess(command, args, { timeout: 10000 })
}
export async function startEditor(options, context = {}) {
  const install = await resolveInstallation(options)
  const { editorRoot, projectRoot, port, url } = install
  await ensureEditor(editorRoot)
  if (!await dependenciesReady(editorRoot) || !await has(path.join(editorRoot, '.next/BUILD_ID')) || !await has(path.join(editorRoot, 'dist/mcp/server.cjs'))) throw new Error('Editor is not built. Run chorono setup first.')
  const managed = await readJson(path.join(editorRoot, '.chorono/server.json'))
  if (managed?.port && managed.port !== port && await portBusy(managed.port)) throw new Error(`This checkout already has a managed server on port ${managed.port}. Stop it before choosing another port, or use a separate editor checkout.`)
  await tokenFor(editorRoot, true)
  const existing = await probeEditor(install, context)
  if (existing.state === 'running') {
    if (options.open) await (context.openBrowser ?? openBrowser)(url)
    return { ...install, ok: true, reused: true, server: existing, nextSteps: existing.connectedEditors ? [] : ['Choose MCP → Connect this editor in the browser'] }
  }
  if (await portBusy(port)) throw new Error(`Port ${port} is occupied (${existing.state}). Stop the existing service yourself or choose --port. No process was replaced.`)
  return locked(editorRoot, async () => {
    if (await portBusy(port)) throw new Error(`Port ${port} became occupied; no process was replaced`)
    const args = [nextFile(editorRoot), 'start', '-H', '127.0.0.1', '-p', String(port)]
    const env = { ...process.env, CHORONO_MCP_ENABLED: '1', CHORONO_PROJECT_ROOT: editorRoot, CHORONO_MCP_PROJECT_DIR: path.join(projectRoot, 'projects') }
    if (!options.background) {
      context.log?.(`Chorono: ${url}\nChoose MCP → Connect this editor after opening the browser.\n`)
      const child = spawn(process.execPath, args, { cwd: editorRoot, env, stdio: 'inherit', shell: false })
      if (options.open) setTimeout(() => void (context.openBrowser ?? openBrowser)(url).catch(e => context.log?.(e.message + '\n')), 1500).unref()
      const exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? 0)) })
      return { ...install, ok: exitCode === 0, exitCode }
    }
    const logPath = path.join(editorRoot, '.chorono/editor.log')
    try { const stat = await lstat(logPath); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Refusing non-regular server log') } catch (e) { if (e.code !== 'ENOENT') throw e }
    const log = await open(logPath, 'a', 0o600)
    let child
    try { child = spawn(process.execPath, args, { cwd: editorRoot, env, detached: true, stdio: ['ignore', log.fd, log.fd], shell: false }); await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject) }); child.unref() }
    finally { await log.close() }
    let server
    const until = Date.now() + 45000
    while (Date.now() < until) {
      server = await probeEditor(install, context)
      if (server.state === 'running') break
      if (child.exitCode !== null || child.signalCode) break
      await new Promise(resolve => setTimeout(resolve, 300))
    }
    if (server?.state !== 'running') { try { process.kill(child.pid) } catch {} throw new Error(`Editor did not become ready. Read ${logPath}`) }
    await atomicJson(path.join(editorRoot, '.chorono/server.json'), { pid: server.pid, editorRoot, port, startedAt: new Date().toISOString() })
    await atomicJson(path.join(projectRoot, '.chorono/installation.json'), { editorRoot, port })
    if (options.open) await (context.openBrowser ?? openBrowser)(url)
    return { ...install, ok: true, reused: false, server, logPath, nextSteps: ['Choose MCP → Connect this editor in the browser', 'Run chorono doctor'] }
  })
}

export async function stopEditor(options, context = {}) {
  const install = await resolveInstallation(options)
  return locked(install.editorRoot, async () => {
    const file = path.join(install.editorRoot, '.chorono/server.json')
    const record = await readJson(file)
    if (!record) throw new Error('No managed editor process. Stop a manually started server from its own terminal.')
    const server = await probeEditor({ ...install, port: record.port }, context)
    if (server.state === 'offline') return { ...install, ok: true, stopped: false }
    if (server.state !== 'running' || server.pid !== record.pid || record.editorRoot !== install.editorRoot || !Number.isSafeInteger(record.pid) || record.pid <= 1) throw new Error('Server identity does not match the managed process; nothing was stopped')
    process.kill(record.pid, 'SIGTERM')
    const until = Date.now() + 15000
    while (await portBusy(record.port)) {
      if (Date.now() > until) return { ...install, ok: false, stopped: true, nextSteps: ['Server is still shutting down. Wait for its port to close before rebuilding.'] }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    await rm(file, { force: true })
    return { ...install, ok: true, stopped: true }
  })
}
