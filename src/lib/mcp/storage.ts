import { constants } from 'node:fs'
import { mkdir, open, readFile, realpath, readdir, lstat, rename, unlink, appendFile, link } from 'node:fs/promises'
import path from 'node:path'
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'
import { assertScene, LIMITS } from './protocol'

export const stateDirectory = () => path.join(process.cwd(), '.chorono')

export async function getLocalToken(): Promise<string> {
  const directory = stateDirectory()
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const filename = path.join(directory, 'mcp-token')
  try {
    const file = await open(filename, 'wx', 0o600)
    try { await file.writeFile(randomBytes(32).toString('hex')) } finally { await file.close() }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
  const stat = await lstat(filename)
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw new Error('MCP token must be a regular private file (mode 0600)')
  const token = (await readFile(filename, 'utf8')).trim()
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid local MCP token file')
  return token
}

export function tokenEquals(actual: string, expected: string): boolean {
  const a = Buffer.from(actual), b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function directory(kind: 'projects' | 'exports') {
  const root = path.resolve(process.env.CHORONO_MCP_PROJECT_DIR ?? path.join(process.cwd(), 'projects'))
  await mkdir(root, { recursive: true })
  const target = kind === 'projects' ? root : path.join(root, 'exports')
  await mkdir(target, { recursive: true })
  return realpath(target)
}

function safeName(name: string, extension: string) {
  const base = name.endsWith(extension) ? name.slice(0, -extension.length) : name
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(base) || base.includes('..')) throw new Error('File name must contain only letters, digits, dots, underscores and hyphens; no paths')
  return base + extension
}

export async function writeArtifact(name: string, extension: string, data: string | Uint8Array, overwrite = false, kind: 'projects' | 'exports' = 'projects') {
  const root = await directory(kind)
  const target = path.join(root, safeName(name, extension))
  const bytes = Buffer.from(data)
  if (bytes.length > LIMITS.requestBytes) throw new Error('File size limit exceeded')
  let existing = false
  try { const stat = await lstat(target); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Refusing non-regular output file'); existing = true } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  if (existing && !overwrite) throw new Error('Project exists; use overwrite:true or a new name')
  const temporary = target + '.' + randomBytes(8).toString('hex') + '.tmp'
  const file = await open(temporary, 'wx', 0o600)
  try {
    await file.writeFile(bytes)
    await file.sync()
  } finally { await file.close() }
  try {
    if (overwrite) await rename(temporary, target)
    else { await link(temporary, target); await unlink(temporary) }
  } catch (error) { await unlink(temporary).catch(() => {}); throw error }
  return { path: target, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
}

export async function listProjects() {
  const root = await directory('projects')
  const names = (await readdir(root)).filter(name => name.endsWith('.chorono.json'))
  const entries = await Promise.all(names.map(async name => { const stat = await lstat(path.join(root, name)); return stat.isFile() && !stat.isSymbolicLink() ? { name, bytes: stat.size, modifiedAt: stat.mtime.toISOString() } : null }))
  return entries.filter(Boolean)
}

export async function loadProject(name: string) {
  const filename = path.join(await directory('projects'), safeName(name, '.chorono.json'))
  const stat = await lstat(filename)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > LIMITS.sceneBytes) throw new Error('Invalid project file')
  const scene: unknown = JSON.parse(await readFile(filename, 'utf8'))
  assertScene(scene)
  return scene
}

export async function audit(event: Record<string, unknown>) {
  await mkdir(stateDirectory(), { recursive: true, mode: 0o700 })
  await appendFile(path.join(stateDirectory(), 'audit.jsonl'), JSON.stringify({ time: new Date().toISOString(), ...event }) + '\n', { mode: 0o600 })
}
