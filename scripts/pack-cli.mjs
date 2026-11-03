import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const destination = path.join(root, '.chorono/packages')
await mkdir(destination, { recursive: true, mode: 0o700 })
// npm_execpath avoids a shell and also works with npm.cmd on Windows.
const npm = process.env.npm_execpath
if (!npm) throw new Error('Run this script with npm run cli:pack')
const result = spawnSync(process.execPath, [npm, 'pack', '--workspace', '@codie1982/chorono', '--pack-destination', destination], { cwd: root, stdio: 'inherit' })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
