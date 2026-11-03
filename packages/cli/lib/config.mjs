import path from 'node:path'
import os from 'node:os'
import { mkdir, readFile, writeFile, lstat, open, rename, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

export const CLIENTS = ['codex', 'claude-code', 'claude-desktop']
const read = async p => { try { return await readFile(p, 'utf8') } catch (e) { if (e.code === 'ENOENT') return ''; throw e } }
export async function safeDirectory(directory) {
  let cursor = path.resolve(directory)
  while (true) {
    try { const s = await lstat(cursor); if (!s.isDirectory() || s.isSymbolicLink()) throw new Error(`Refusing non-directory or symlink: ${cursor}`) }
    catch (e) { if (e.code !== 'ENOENT') throw e }
    const parent = path.dirname(cursor)
    if (parent === cursor) return
    cursor = parent
  }
}
async function safeFile(file) {
  await safeDirectory(path.dirname(file))
  try { const s = await lstat(file); if (!s.isFile() || s.isSymbolicLink()) throw new Error(`Refusing non-regular configuration: ${file}`) }
  catch (e) { if (e.code !== 'ENOENT') throw e }
}
export function clientPaths(projectRoot, options = {}) {
  const home = options.home ?? os.homedir()
  const platform = options.platform ?? process.platform
  const desktop = platform === 'darwin' ? path.join(home, 'Library/Application Support/Claude/claude_desktop_config.json') : platform === 'win32' ? path.join(options.appData ?? process.env.APPDATA ?? path.join(home, 'AppData/Roaming'), 'Claude/claude_desktop_config.json') : path.join(home, '.config/Claude/claude_desktop_config.json')
  return { codex: path.join(options.codexHome ?? process.env.CODEX_HOME ?? path.join(home, '.codex'), 'config.toml'), 'claude-code': path.join(projectRoot, '.mcp.json'), 'claude-desktop': desktop }
}
export function makeEntry(editorRoot, projectRoot, port) {
  return { command: process.execPath, args: [path.join(editorRoot, 'dist/mcp/server.cjs')], env: { CHORONO_PROJECT_ROOT: editorRoot, CHORONO_EDITOR_URL: `http://127.0.0.1:${port}`, CHORONO_MCP_PROJECT_DIR: path.join(projectRoot, 'projects') } }
}
function tomlEntry(entry) {
  return `[mcp_servers.chorono]\ncommand = ${JSON.stringify(entry.command)}\nargs = ${JSON.stringify(entry.args)}\nstartup_timeout_sec = 20\ntool_timeout_sec = 150\n\n[mcp_servers.chorono.env]\n${Object.entries(entry.env).map(([k,v]) => `${k} = ${JSON.stringify(v)}`).join('\n')}\n`
}
function sameEntry(actual, expected, { editorRoot, projectRoot, port }) {
  if (!actual || actual.command !== expected.command || JSON.stringify(actual.args) !== JSON.stringify(expected.args)) return false
  // Older configurations omitted env and used the editor root / port 2000.
  const env = actual.env ?? {}
  return (env.CHORONO_PROJECT_ROOT ?? editorRoot) === editorRoot && (env.CHORONO_EDITOR_URL ?? 'http://127.0.0.1:2000') === `http://127.0.0.1:${port}` && (env.CHORONO_MCP_PROJECT_DIR ?? path.join(editorRoot, 'projects')) === path.join(projectRoot, 'projects')
}
function codexEntry(text) {
  const parsed = { env: {} }
  let section = '', found = false, unknown = false
  for (const original of text.split(/\r?\n/)) {
    const line = original.trim()
    if (!line || line.startsWith('#')) continue
    if (line.startsWith('[')) { section = line.replace(/['"]/g, '').replace(/\s/g, ''); if (section === '[mcp_servers.chorono]') found = true; continue }
    if (section === '[mcp_servers]' && /^['"]?chorono['"]?\s*=/.test(line)) { found = true; unknown = true }
    if (section === '[mcp_servers.chorono]' || section === '[mcp_servers.chorono.env]') {
      const match = /^([\w]+)\s*=\s*(.+)$/.exec(line)
      if (!match) { unknown = true; continue }
      const [, key, value] = match
      if (['command', 'args'].includes(key) || section.endsWith('.env]')) {
        try { const v = value.startsWith("'") && value.endsWith("'") ? value.slice(1, -1) : JSON.parse(value); (section.endsWith('.env]') ? parsed.env : parsed)[key] = v }
        catch { unknown = true }
      } else if (key === 'env') unknown = true
    }
  }
  // Conservatively preserve unusual inline/root TOML representations.
  if (!found && /\bchorono\b/.test(text.replace(/^\s*#.*$/gm, ''))) return { found: true, unknown: true }
  return { found, unknown, entry: parsed }
}

export async function configureClients(options) {
  const { editorRoot, projectRoot, port = 2000, install = false, generate = true, agents = CLIENTS } = options
  const entry = makeEntry(editorRoot, projectRoot, port)
  const paths = clientPaths(projectRoot, options)
  const generated = path.join(editorRoot, '.chorono/client-configs')
  if (generate) {
    await safeDirectory(generated); await mkdir(generated, { recursive: true, mode: 0o700 })
    for (const [name, data] of Object.entries({ 'claude-desktop.json': JSON.stringify({ mcpServers: { chorono: entry } }, null, 2), 'claude-code.json': JSON.stringify({ mcpServers: { chorono: { type: 'stdio', ...entry } } }, null, 2), 'codex.toml': tomlEntry(entry) })) {
      await safeFile(path.join(generated, name)); await writeFile(path.join(generated, name), data + '\n', { mode: 0o600 })
    }
  }
  const result = []
  for (const agent of agents) {
    const file = paths[agent]
    await safeFile(file)
    const text = await read(file)
    let current, present, actual, unknown = false
    if (agent === 'codex') { const c = codexEntry(text); present = c.found; actual = c.entry; unknown = c.unknown }
    else { current = text ? JSON.parse(text) : {}; present = Object.hasOwn(current.mcpServers ?? {}, 'chorono'); actual = current.mcpServers?.chorono }
    if (present) {
      result.push({ agent, path: file, status: unknown ? 'unverified' : sameEntry(actual, entry, { editorRoot, projectRoot, port }) ? 'current' : 'stale' })
    } else if (!install) result.push({ agent, path: file, status: 'missing' })
    else {
      await mkdir(path.dirname(file), { recursive: true })
      const lockFile = file + '.chorono-lock'
      const lock = await open(lockFile, 'wx', 0o600)
      const temporary = file + '.' + randomUUID() + '.tmp'
      try {
        if (await read(file) !== text) throw new Error(`Client configuration changed during setup: ${file}; retry after reviewing it`)
        if (text) await writeFile(path.join(generated, `${agent}-${randomUUID()}.backup`), text, { mode: 0o600 })
        const next = agent === 'codex' ? text.trimEnd() + '\n\n' + tomlEntry(entry) : JSON.stringify({ ...current, mcpServers: { ...current.mcpServers, chorono: agent === 'claude-code' ? { type: 'stdio', ...entry } : entry } }, null, 2) + '\n'
        await writeFile(temporary, next, { mode: 0o600, flag: 'wx' })
        await rename(temporary, file)
      } finally { await rm(temporary, { force: true }); await lock.close(); await rm(lockFile, { force: true }) }
      result.push({ agent, path: file, status: 'installed' })
    }
  }
  return { directory: generated, clients: result }
}
