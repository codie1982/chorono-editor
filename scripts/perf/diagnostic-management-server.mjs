import { readFile, writeFile, mkdir, open, access } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import path from 'node:path'

// Isolated single-host QA only. Secrets are private files/environment, never
// process arguments, stdout or public bundles. Main editor/server is untouched.
const [directory, target = 'artifacts/validation/diagnostics-d2-20261110', ingestion = '1'] = process.argv.slice(2)
if (!directory || !['0', '1'].includes(ingestion)) throw Error('Usage: snapshot-directory output-directory [ingestion:0|1]')
const root = path.resolve(directory), output = path.resolve(target)
if (!root.startsWith('/private/tmp/chorono-d2-validation-')) throw Error('Isolated QA snapshot required')
await access(path.join(root, '.next', 'BUILD_ID'))
await mkdir(output, { recursive: true })
const tokenFile = path.join(root, '.qa-admin-token')
try { await writeFile(tokenFile, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' }) }
catch (error) { if (error.code !== 'EEXIST') throw error }
const token = (await readFile(tokenFile, 'utf8')).trim()
if (!/^[a-f0-9]{64}$/.test(token)) throw Error('Invalid private QA token')
const logFile = path.join(output, 'server.log'), log = await open(logFile, 'a', 0o600)
const require = createRequire(import.meta.url)
const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', '2001'], {
  cwd: root, detached: true, stdio: ['ignore', log.fd, log.fd], env: {
    ...process.env, CHORONO_MCP_ENABLED: '0', CHORONO_DIAGNOSTICS_ENABLED: ingestion,
    CHORONO_DIAGNOSTICS_ALLOWED_ORIGINS: 'http://127.0.0.1:2001',
    CHORONO_DIAGNOSTICS_DIR: path.join(output, 'depot'), CHORONO_DIAGNOSTICS_ADMIN_TOKEN: token,
  },
})
child.unref(); await log.close()
for (let attempt = 0; attempt < 40; attempt++) {
  try {
    const response = await fetch('http://127.0.0.1:2001/diagnostics')
    if (response.ok) {
      const metadata = { pid: child.pid, root, url: 'http://127.0.0.1:2001/diagnostics', tokenFile, logFile, ingestion }
      await writeFile(path.join(output, 'server.json'), JSON.stringify(metadata, null, 2))
      console.log(JSON.stringify(metadata)); process.exit(0)
    }
  } catch { /* Wait only for this owned local QA process. */ }
  await new Promise(resolve => setTimeout(resolve, 100))
}
throw Error('QA server did not become ready; inspect private log')
