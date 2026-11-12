# Chorono CLI and agent skills

Install and start the local Chorono editor, configure its MCP connection, and distribute versioned skills for Claude Code and Codex. Node.js 20+ is required; downloading a fresh editor also needs Git. The CLI has no runtime npm dependencies.

## Run from a checkout

```sh
npm ci
npm run cli:build
npm run chorono -- setup
npm run chorono -- start --background --open
npm run chorono -- doctor
```

Open the displayed URL and choose **MCP → Connect this editor**. Reload client MCP connections or start a new agent session. Then ask your agent to create, preview and save an editable animation.

## Run from npm

After this package is published:

```sh
npx --package @codie1982/chorono@latest chorono setup --project ./my-animation
npx --package @codie1982/chorono@latest chorono start --project ./my-animation --background --open
npx --package @codie1982/chorono@latest chorono doctor --project ./my-animation
```

Before publication, use the source checkout or a local tarball with `npx --package /absolute/path/codie1982-chorono-0.3.0.tgz chorono ...`. A fresh remote editor download requires a branch/tag containing the MCP and CLI changes. Use `--repo URL --ref BRANCH_OR_TAG` to select one; older checkouts without MCP support are refused.

## Commands

| Command | Behavior |
| --- | --- |
| `setup` | Locate/download the editor, install missing dependencies, build missing outputs, prepare client settings and project skills |
| `start --background --open` | Start on loopback, open the browser; reuse a matching server |
| `doctor --json` | Read-only readiness checks, client status and connected editor count; exit 1 until ready |
| `stop` | Stop only a matching background process previously started by this CLI |
| `skills list/install/update/check` | Manage the skills bundled with this exact package version |

`--project PATH` chooses an animation project and remembers its editor/port. `--editor PATH` selects an existing checkout or download destination. Otherwise setup discovers a checkout above the working directory or downloads into `<project>/.chorono/editor`. Existing checkouts are never pulled or reset. Saved projects go to `<project>/projects/`.

Setup defaults to all MCP clients: Claude Code project `.mcp.json`, Codex user configuration and Claude Desktop user configuration. Select one with `--agent codex|claude-code|claude-desktop|all`. Existing Chorono entries are preserved and reported as current, stale or unverified; generated snippets live under the editor's `.chorono/client-configs`. `--no-clients` only generates snippets; `--no-skills` skips skill installation. Files are backed up before configuration additions. Never publish those backups or private tokens.

Skills are filesystem installs for Claude Code and Codex; Claude Desktop/Cowork have separate skill import mechanisms. Installing a skill does not start an editor or reload the current chat's tools.

Use `--port NUMBER` (1024–65535) for a different loopback port. `start` refuses an occupied port belonging to another or incompatible service. Stop the editor before `setup --rebuild`; `--reinstall` also refreshes dependencies. Foreground `start` occupies its terminal; agents should use `start --background --json`. Diagnostics/build logs go to stderr, JSON results to stdout.

## Skill-only installs

```sh
chorono skills install --dry-run
chorono skills install
chorono skills check
chorono skills update
chorono skills install --global --agent codex --skill chorono
```

These commands read the bundled SHA-256 manifest without fetching GitHub or npm. Use a newer package version for updated skill content. The default skill scope is the current project for both agents. Modified or foreign copies are preserved; inspect before using `--force`, which retains backups. Symlink destinations are refused. Unrelated skills are not removed.

The source repository's `skills/` directory is canonical. `npm run cli:build` bundles it and `npm run cli:pack` creates the tarball without publishing. See `docs/tr/skills.md` in the repository for maintainer instructions.
