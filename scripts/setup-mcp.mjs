import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { configureClients } from '../packages/cli/lib/config.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const result = await configureClients({ editorRoot: root, projectRoot: root, port: 2000, install: process.argv.includes('--install') })
console.log(`Client configurations generated in ${result.directory}`)
for (const client of result.clients) console.log(`${client.agent}: ${client.status} (${client.path})`)
