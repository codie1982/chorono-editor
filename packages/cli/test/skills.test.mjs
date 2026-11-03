import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink, access, realpath } from 'node:fs/promises'
import { manageSkills } from '../lib/skills.mjs'
import { run } from '../lib/cli.mjs'

const publisher = 'https://github.com/codie1982/chorono-editor'
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'chorono-skills-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const packageRoot = path.join(root, 'package')
  const project = path.join(root, 'project with spaces')
  const home = path.join(root, 'home')
  await Promise.all([mkdir(packageRoot), mkdir(project), mkdir(home)])
  async function bundle(version = '0.1.0', extra = { 'references/old.md': 'original reference' }) {
    await rm(path.join(packageRoot, 'skills'), { recursive: true, force: true })
    const files = { 'SKILL.md': '---\nname: chorono\ndescription: Operate Chorono\n---\nUse the real editor.\n', ...extra }
    for (const [name, data] of Object.entries(files)) {
      const p = path.join(packageRoot, 'skills/chorono', name)
      await mkdir(path.dirname(p), { recursive: true }); await writeFile(p, data)
    }
    const hashes = Object.fromEntries(Object.keys(files).sort().map(name => [name, createHash('sha256').update(files[name]).digest('hex')]))
    await writeFile(path.join(packageRoot, 'skills/manifest.json'), JSON.stringify({ version, source: publisher, skills: { chorono: { description: 'Operate Chorono', files: hashes } } }))
    await writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({ name: '@codie1982/chorono', version }))
  }
  await bundle()
  const call = (action, overrides = {}) => manageSkills({ packageRoot, project, home, action, ...overrides })
  return { root, packageRoot, project, home, bundle, call }
}
const isMissing = async p => assert.rejects(access(p), { code: 'ENOENT' })

test('installs real copies for both agents and checks their bytes without touching another skill', async t => {
  const f = await fixture(t)
  const other = path.join(f.project, '.agents/skills/another/SKILL.md')
  await mkdir(path.dirname(other), { recursive: true }); await writeFile(other, 'unrelated')
  const installed = await f.call('install')
  assert(installed.ok)
  assert.deepEqual(installed.entries.map(e => e.status), ['installed', 'installed'])
  for (const e of installed.entries) assert.equal(await readFile(path.join(e.path, 'references/old.md'), 'utf8'), 'original reference')
  assert((await f.call('check')).entries.every(e => e.status === 'current'))
  assert((await f.call('install')).entries.every(e => e.status === 'current'))
  assert.equal(await readFile(other, 'utf8'), 'unrelated')
})

test('dry run and checks do not create state directories or skill files', async t => {
  const f = await fixture(t)
  const check = await f.call('check')
  assert.equal(check.ok, false)
  assert(check.entries.every(e => e.status === 'missing'))
  const plan = await f.call('install', { dryRun: true })
  assert(plan.ok)
  assert(plan.entries.every(e => e.status === 'would-installed'))
  assert.deepEqual(await readdir(f.project), [])
})

test('updates an unmodified older bundle, removes obsolete files and retains recoverable backups', async t => {
  const f = await fixture(t)
  await f.call('install', { agent: 'codex' })
  await f.bundle('0.2.0', { 'references/new.md': 'new reference' })
  const preserved = await f.call('install', { agent: 'codex' })
  assert.equal(preserved.entries[0].status, 'different')
  assert.equal(preserved.ok, false)
  const updated = await f.call('update', { agent: 'codex' })
  const e = updated.entries[0]
  assert.equal(e.status, 'updated')
  assert.equal(await readFile(path.join(e.backup, 'references/old.md'), 'utf8'), 'original reference')
  await isMissing(path.join(e.path, 'references/old.md'))
  assert.equal(await readFile(path.join(e.path, 'references/new.md'), 'utf8'), 'new reference')
  assert((await f.call('check', { agent: 'codex' })).ok)
})

test('preflights the whole selection and preserves modified skills until explicit backed-up replacement', async t => {
  const f = await fixture(t)
  const first = (await f.call('install', { agent: 'codex' })).entries[0]
  await writeFile(path.join(first.path, 'SKILL.md'), 'my local changes')
  const blocked = await f.call('update')
  assert.equal(blocked.ok, false)
  assert.deepEqual(blocked.entries.map(e => e.status), ['modified', 'missing'])
  await isMissing(path.join(f.project, '.claude'))
  const forced = await f.call('update', { force: true })
  assert(forced.ok)
  assert.equal(await readFile(path.join(forced.entries[0].backup, 'SKILL.md'), 'utf8'), 'my local changes')
})

test('does not claim or overwrite a foreign same-named skill', async t => {
  const f = await fixture(t)
  const foreign = path.join(f.project, '.claude/skills/chorono')
  await mkdir(foreign, { recursive: true }); await writeFile(path.join(foreign, 'SKILL.md'), 'another publisher')
  const result = await f.call('install')
  assert.equal(result.ok, false)
  assert.equal(result.entries[1].status, 'foreign')
  await isMissing(path.join(f.project, '.agents'))
  const explicit = await f.call('install', { agent: 'claude-code', force: true })
  assert.equal(await readFile(path.join(explicit.entries[0].backup, 'SKILL.md'), 'utf8'), 'another publisher')
})

test('respects selected user scope and refuses traversal skill names', async t => {
  const f = await fixture(t)
  const result = await f.call('install', { global: true, agent: 'claude-code', names: ['chorono'] })
  assert.equal(result.entries.length, 1)
  assert(result.entries[0].path.startsWith(await realpath(f.home)))
  assert.deepEqual(await readdir(f.project), [])
  await assert.rejects(f.call('install', { names: ['../outside'] }), /Unknown skill/)
})

test('refuses symbolic-link destinations and metadata without writing through them', async t => {
  const f = await fixture(t)
  await symlink(f.home, path.join(f.project, '.agents'), 'dir')
  await assert.rejects(f.call('install'), /symlink/i)
  assert.deepEqual(await readdir(f.home), [])
  await rm(path.join(f.project, '.agents'))
  const first = (await f.call('install', { agent: 'codex' })).entries[0]
  await rm(path.join(first.path, '.chorono-skill.json'))
  await writeFile(path.join(f.home, 'metadata'), '{}')
  await symlink(path.join(f.home, 'metadata'), path.join(first.path, '.chorono-skill.json'))
  await assert.rejects(f.call('update', { agent: 'codex', force: true }), /symbolic link/)
  assert.equal(await readFile(path.join(f.home, 'metadata'), 'utf8'), '{}')
})

test('refuses corrupted bundles and concurrent installs before writing skills', async t => {
  const f = await fixture(t)
  await writeFile(path.join(f.packageRoot, 'skills/chorono/SKILL.md'), 'corrupted')
  await assert.rejects(f.call('install'), /integrity/)
  assert.deepEqual(await readdir(f.project), [])
  await f.bundle()
  await mkdir(path.join(f.project, '.chorono'))
  await writeFile(path.join(f.project, '.chorono/skills-install.lock'), 'in use')
  await assert.rejects(f.call('install'), /Another skill install/)
  await isMissing(path.join(f.project, '.agents'))
})

test('CLI validates ambiguous scope/options and provides parseable JSON', async t => {
  const f = await fixture(t)
  const messages = []
  const ctx = { cwd: f.project, home: f.home, output: text => messages.push(text) }
  assert.equal(await run(['skills', 'list', '--json'], ctx), 0)
  assert(JSON.parse(messages.pop()).skills.some(s => s.name === 'chorono'))
  assert.equal(await run(['skills', 'check', '--json'], ctx), 1)
  assert.equal(JSON.parse(messages.pop()).ok, false)
  await assert.rejects(run(['skills', 'install', '--global', '--project', f.project], ctx), /cannot be combined/)
  await assert.rejects(run(['skills', 'install', '--agent', 'unknown'], ctx), /Agent must/)
  await assert.rejects(run(['skills', 'install', '--project'], ctx), /Missing value/)
  await assert.rejects(run(['skills', 'check', '--force'], ctx), /only for install/)
})
