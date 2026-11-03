#!/usr/bin/env node
import { run } from '../lib/cli.mjs'

try {
  process.exitCode = await run(process.argv.slice(2))
} catch (error) {
  if (process.argv.includes('--json')) console.log(JSON.stringify({ ok: false, error: error.message }))
  else console.error(`Chorono: ${error.message}`)
  process.exitCode = 1
}
