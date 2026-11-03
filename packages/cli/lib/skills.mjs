import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, readdir, readFile, mkdir, writeFile, rename, rm, open, realpath } from 'node:fs/promises'

const marker = '.chorono-skill.json'
const publisher = 'https://github.com/codie1982/chorono-editor'
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const exists = async p => { try { return await lstat(p) } catch (e) { if (e.code === 'ENOENT') return null; throw e } }
const within = (root, p) => { const relative = path.relative(root, p); return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)) }

// Never follow links in source files, installed skills, or agent target paths.
async function assertDirectories(p) {
  let cursor = path.resolve(p)
  while (true) {
    const stat = await exists(cursor)
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw new Error(`Not a real directory (symlinks are refused): ${cursor}`)
    const parent = path.dirname(cursor)
    if (parent === cursor) return
    cursor = parent
  }
}

export async function readTree(root, relative = '') {
  const files = {}
  for (const entry of (await readdir(path.join(root, relative), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const key = relative ? `${relative}/${entry.name}` : entry.name
    if (key === marker) continue
    if (entry.isSymbolicLink()) throw new Error(`Skill contains a symbolic link: ${path.join(root, key)}`)
    if (entry.isDirectory()) Object.assign(files, await readTree(root, key))
    else if (entry.isFile()) files[key] = await readFile(path.join(root, key))
    else throw new Error(`Unsupported skill file: ${key}`)
  }
  return files
}

export function hashFiles(files) {
  return Object.fromEntries(Object.keys(files).sort().map(key => [key, digest(files[key])]))
}
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)

async function inspect(target, desired) {
  const stat = await exists(target)
  if (!stat) return { status: 'missing', fingerprint: null }
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Skill target is not a real directory: ${target}`)
  let metadata = null
  const metadataPath = path.join(target, marker)
  const metadataStat = await exists(metadataPath)
  if (metadataStat?.isSymbolicLink()) throw new Error(`Skill metadata is a symbolic link: ${metadataPath}`)
  if (metadataStat) {
    try { metadata = JSON.parse(await readFile(metadataPath, 'utf8')) } catch (e) { if (e.code) throw e }
  }
  const files = hashFiles(await readTree(target))
  const fingerprint = digest(JSON.stringify({ files, metadata }))
  if (metadata?.source !== publisher || !metadata.files || metadata.name !== desired.name) return { status: 'foreign', fingerprint }
  if (!equal(files, metadata.files)) return { status: 'modified', fingerprint }
  return { status: equal(files, desired.files) ? 'current' : 'different', fingerprint, installedVersion: metadata.version }
}

export async function manageSkills(options) {
  const { action, packageRoot, names = [], agent = 'all', global = false, dryRun = false, force = false } = options
  const bundle = path.join(packageRoot, 'skills')
  let manifest
  try { manifest = JSON.parse(await readFile(path.join(bundle, 'manifest.json'), 'utf8')) }
  catch (e) { if (e.code === 'ENOENT') throw new Error('Skill bundle missing. From the source checkout run npm run cli:build first.'); throw e }
  const pkg = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'))
  if (manifest.version !== pkg.version || manifest.source !== publisher) throw new Error('Skill bundle does not match this package; rebuild before distributing it')
  const selected = names.length ? [...new Set(names)] : Object.keys(manifest.skills)
  for (const name of selected) if (!/^[a-z0-9][a-z0-9-]*$/.test(name) || !Object.hasOwn(manifest.skills, name)) throw new Error(`Unknown skill: ${name}`)
  const skills = selected.map(name => ({ name, ...manifest.skills[name] }))
  const base = { package: pkg.name, version: pkg.version, source: publisher }
  if (action === 'list') return { ...base, ok: true, skills: skills.map(({ name, description }) => ({ name, description })) }
  const scope = await realpath(path.resolve(global ? options.home : options.project))
  const agentNames = agent === 'all' ? ['codex', 'claude-code'] : [agent]
  const roots = Object.fromEntries(agentNames.map(name => [name, path.join(scope, name === 'codex' ? '.agents/skills' : '.claude/skills')]))
  for (const root of Object.values(roots)) {
    await assertDirectories(root)
    if (within(bundle, root) || within(root, bundle)) throw new Error('Installation target overlaps the skill source')
  }
  // Verify bundled bytes, so a stale manifest or partial npm package fails loudly.
  const sources = {}
  for (const skill of skills) {
    const source = path.join(bundle, skill.name)
    const files = await readTree(source)
    if (!equal(hashFiles(files), skill.files)) throw new Error(`Bundle integrity check failed: ${skill.name}`)
    sources[skill.name] = files
  }
  const stateRoot = path.join(scope, '.chorono')
  await assertDirectories(stateRoot)
  let lock
  if (['install', 'update'].includes(action) && !dryRun) {
    await mkdir(stateRoot, { recursive: true, mode: 0o700 })
    try { lock = await open(path.join(stateRoot, 'skills-install.lock'), 'wx', 0o600) }
    catch (e) { if (e.code === 'EEXIST') throw new Error(`Another skill install may be active. After verifying it stopped, remove ${path.join(stateRoot, 'skills-install.lock')}`); throw e }
  }
  try {
    const entries = []
    for (const [agentName, root] of Object.entries(roots)) for (const skill of skills) {
      const target = path.join(root, skill.name)
      const current = await inspect(target, skill)
      entries.push({ agent: agentName, name: skill.name, path: target, ...current })
    }
    const conflict = entries.some(e => ['modified', 'foreign'].includes(e.status) && !force)
    // Preflight the entire selection before writing any skill.
    if (action !== 'check' && !conflict) for (const entry of entries) {
      const shouldWrite = entry.status === 'missing' || (action === 'update' && entry.status === 'different') || (force && entry.status !== 'current')
      if (!shouldWrite) continue
      const nextStatus = entry.status === 'missing' ? 'installed' : 'updated'
      if (dryRun) { entry.status = `would-${nextStatus}`; continue }
      await assertDirectories(path.dirname(entry.path))
      await mkdir(path.dirname(entry.path), { recursive: true })
      const staged = path.join(path.dirname(entry.path), `.chorono-stage-${randomUUID()}`)
      let backup
      let moved = false
      try {
        await mkdir(staged)
        for (const [name, bytes] of Object.entries(sources[entry.name])) {
          const destination = path.join(staged, name)
          await mkdir(path.dirname(destination), { recursive: true })
          await writeFile(destination, bytes)
        }
        const skill = manifest.skills[entry.name]
        await writeFile(path.join(staged, marker), JSON.stringify({ source: publisher, name: entry.name, version: pkg.version, files: skill.files }, null, 2) + '\n')
        const latest = await inspect(entry.path, { name: entry.name, ...skill })
        if (latest.fingerprint !== entry.fingerprint) throw new Error(`Skill changed during installation: ${entry.path}`)
        if (entry.status !== 'missing') {
          backup = path.join(stateRoot, 'skill-backups', randomUUID(), entry.agent, entry.name)
          await assertDirectories(path.dirname(backup))
          await mkdir(path.dirname(backup), { recursive: true })
          await rename(entry.path, backup)
          moved = true
        }
        try { await rename(staged, entry.path) }
        catch (e) { if (moved) await rename(backup, entry.path); throw e }
        entry.status = nextStatus
        if (backup) entry.backup = backup
      } finally { await rm(staged, { recursive: true, force: true }) }
    }
    return { ...base, scope: global ? 'user' : 'project', dryRun, ok: entries.every(e => ['current', 'installed', 'updated', 'would-installed', 'would-updated'].includes(e.status)), entries: entries.map(({ fingerprint, ...entry }) => entry) }
  } finally {
    if (lock) { await lock.close(); await rm(path.join(stateRoot, 'skills-install.lock'), { force: true }) }
  }
}
