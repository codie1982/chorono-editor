import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readdir, readFile, rm, mkdir, cp, writeFile, chmod } from 'node:fs/promises'
import { hashFiles, readTree } from '../packages/cli/lib/skills.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkgRoot = path.join(root, 'packages/cli')
const pkg = JSON.parse(await readFile(path.join(pkgRoot, 'package.json'), 'utf8'))
const source = path.join(root, 'skills')
const manifest = { version: pkg.version, source: 'https://github.com/codie1982/chorono-editor', skills: {} }
for (const directory of (await readdir(source, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
  if (!directory.isDirectory()) throw new Error(`Unexpected skill source: ${directory.name}`)
  const files = await readTree(path.join(source, directory.name))
  const text = files['SKILL.md']?.toString('utf8') ?? ''
  const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)?.[1]
  const name = header?.match(/^name: ([a-z0-9-]+)$/m)?.[1]
  const description = header?.match(/^description: (.+)$/m)?.[1]
  if (name !== directory.name || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(name ?? '') || !description) throw new Error(`Invalid SKILL.md frontmatter: ${directory.name}`)
  if (/\bTODO\b|\[TODO/.test(text)) throw new Error(`Unfinished skill: ${name}`)
  manifest.skills[name] = { description, files: hashFiles(files) }
}
if (Object.keys(manifest.skills).length === 0) throw new Error('No skills to bundle')
const destination = path.join(pkgRoot, 'skills')
await rm(destination, { recursive: true, force: true })
await cp(source, destination, { recursive: true })
await writeFile(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
await cp(path.join(root, 'LICENSE'), path.join(pkgRoot, 'LICENSE'))
await chmod(path.join(pkgRoot, 'bin/chorono.mjs'), 0o755)
await mkdir(path.join(root, '.chorono/packages'), { recursive: true })
console.log(`Built ${pkg.name}@${pkg.version}: ${Object.keys(manifest.skills).join(', ')}`)
