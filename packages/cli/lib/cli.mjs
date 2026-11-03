import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { manageSkills } from './skills.mjs'
import { setupEditor, startEditor, doctorEditor, stopEditor } from './editor.mjs'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const help = `Chorono editor and skills for Claude Code and Codex

  chorono setup [--editor PATH] [--project PATH]
  chorono start [--background] [--open]
  chorono doctor [--json]
  chorono stop

  chorono skills list
  chorono skills install [options]
  chorono skills update [options]
  chorono skills check [options]

  --agent codex|claude-code|all  Target agent (default: all)
  --skill NAME                  Select one skill; repeat to select several
  --project PATH                Project directory (default: current directory)
  --global                      Install for this user instead of this project
  --dry-run                     Show the plan without writing files
  --force                       Back up and replace a modified or foreign skill
  --json                        Machine-readable output
  --help, --version

Editor options:
  --editor PATH                 Existing checkout or download destination
  --project PATH                Animation project (default: current directory)
  --port NUMBER                 Loopback port (default: saved port or 2000)
  --agent NAME                  codex|claude-code|claude-desktop|all
  --repo URL --ref BRANCH_OR_TAG Source for a fresh setup (existing work is preserved)
  --rebuild --reinstall          Explicitly rebuild / reinstall dependencies
  --no-clients --no-skills       Skip those setup steps
  --background --open            Start in background / open the browser

Updates use the skills bundled with this exact package version. Use the latest
npm package version for newer skills. Browser MCP pairing remains explicit.
`

async function editorCommand(command, flags, context, output) {
  const options = { project: context.cwd ?? process.cwd(), agent: 'all' }
  const allowed = {
    setup: ['--project', '--editor', '--port', '--agent', '--repo', '--ref', '--rebuild', '--reinstall', '--no-clients', '--no-skills', '--json'],
    start: ['--project', '--editor', '--port', '--background', '--open', '--json'],
    doctor: ['--project', '--editor', '--port', '--agent', '--json'],
    stop: ['--project', '--editor', '--json'],
  }[command]
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i]
    if (!allowed.includes(flag)) throw new Error(`Unknown ${command} option: ${flag}`)
    if (['--project', '--editor', '--port', '--agent', '--repo', '--ref'].includes(flag)) {
      const value = flags[++i]
      if (!value || value.startsWith('-')) throw new Error(`Missing value for ${flag}`)
      if (flag === '--port') { if (!/^\d+$/.test(value) || Number(value) < 1024 || Number(value) > 65535) throw new Error('Port must be an integer from 1024 to 65535'); options.port = Number(value) }
      else options[flag.slice(2)] = value
    } else options[flag.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = true
  }
  options.project = path.resolve(context.cwd ?? process.cwd(), options.project)
  if (!['codex', 'claude-code', 'claude-desktop', 'all'].includes(options.agent)) throw new Error('Unsupported agent')
  if (command === 'start' && options.json && !options.background) throw new Error('Use start --background --json for machine-readable output')
  const handler = { setup: setupEditor, start: startEditor, doctor: doctorEditor, stop: stopEditor }[command]
  const result = await handler(options, { ...context, log: context.log ?? (text => process.stderr.write(text)) })
  if (options.json) output(JSON.stringify(result))
  else {
    output(`Chorono ${command}: ${result.ok ? 'OK' : 'needs attention'}`)
    output(`Editor: ${result.editorRoot}\nProject: ${result.projectRoot}\nURL: ${result.url}`)
    for (const client of result.configs?.clients ?? result.checks?.clients ?? []) output(`${client.agent}: ${client.status}`)
    if (result.checks) output(`Checkout: ${result.checks.checkout}; dependencies: ${result.checks.dependencies}; MCP build: ${result.checks.builds.mcp}; editor build: ${result.checks.builds.editor}`)
    const server = result.server ?? result.checks?.server
    if (server) output(`Server: ${server.state}; connected editors: ${server.connectedEditors}`)
    if (result.logPath) output(`Log: ${result.logPath}`)
    if (result.skills && !result.skills.ok) output('Some skill copies were preserved due to local changes. Inspect with chorono skills check.')
    for (const step of result.nextSteps ?? []) output(step)
  }
  return result.ok ? 0 : 1
}

export async function run(argv, context = {}) {
  const output = context.output ?? console.log
  if (argv.includes('--help') || argv.length === 0) { output(help); return 0 }
  const pkg = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'))
  if (argv.length === 1 && argv[0] === '--version') { output(pkg.version); return 0 }
  if (['setup', 'start', 'doctor', 'stop'].includes(argv[0])) return editorCommand(argv[0], argv.slice(1), context, output)
  const [command, subcommand = 'list', ...flags] = argv
  if (command !== 'skills' || !['list', 'install', 'update', 'check'].includes(subcommand)) throw new Error('Use chorono skills list|install|update|check. See --help.')
  const options = { action: subcommand, agent: 'all', project: context.cwd ?? process.cwd(), home: context.home ?? os.homedir(), names: [], global: false, dryRun: false, force: false }
  let explicitProject = false
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i]
    if (['--agent', '--skill', '--project'].includes(flag)) {
      const value = flags[++i]
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`)
      if (flag === '--agent') options.agent = value
      if (flag === '--skill') options.names.push(value)
      if (flag === '--project') { options.project = path.resolve(options.project, value); explicitProject = true }
    } else if (flag === '--global') options.global = true
    else if (flag === '--dry-run') options.dryRun = true
    else if (flag === '--force') options.force = true
    else if (flag !== '--json') throw new Error(`Unknown option: ${flag}`)
  }
  if (!['codex', 'claude-code', 'all'].includes(options.agent)) throw new Error('Agent must be codex, claude-code or all')
  if (options.global && explicitProject) throw new Error('--global and --project cannot be combined')
  if (options.force && !['install', 'update'].includes(subcommand)) throw new Error('--force is only for install/update')
  const result = await manageSkills({ ...options, packageRoot })
  if (argv.includes('--json')) output(JSON.stringify(result))
  else if (subcommand === 'list') {
    output(`${pkg.name}@${pkg.version}`)
    for (const skill of result.skills) output(`${skill.name}: ${skill.description}`)
  } else {
    output(`${pkg.name}@${pkg.version}${options.dryRun ? ' (dry run)' : ''}`)
    for (const entry of result.entries) output(`${entry.agent}: ${entry.name} — ${entry.status} → ${entry.path}${entry.backup ? ` (backup: ${entry.backup})` : ''}`)
    if (result.entries.some(e => ['modified', 'foreign', 'different'].includes(e.status))) output('Existing content was preserved. Use update for an older managed copy; --force backs up local/foreign changes before replacement.')
    if (!options.dryRun && result.entries.some(e => ['installed', 'updated'].includes(e.status))) output('Start a new agent session to load skills. The editor MCP connection must also be configured.')
  }
  return result.ok ? 0 : 1
}
