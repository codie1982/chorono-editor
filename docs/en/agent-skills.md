# Chorono agent skills

[Documentation](../README.md) · [Türkçe](../tr/agent-skills.md) · [Installation](installation.md) · [Troubleshooting](troubleshooting.md)

A skill is a folder of instructions and references an agent can load for a task. Chorono provides two skills. MCP supplies the live editor tools; the CLI installs and starts the local software.

## The two skills

| Skill | Use it for | Main instructions |
| --- | --- | --- |
| `chorono-setup` | Installation, starting/stopping, MCP client configuration, readiness checks and skill management | [SKILL.md](../../skills/chorono-setup/SKILL.md) |
| `chorono` | Editable 2D scenes, layers, keyframes, multiple animations, particles, interaction, previews and saved projects | [SKILL.md](../../skills/chorono/SKILL.md) |

Install both for the complete workflow. Once an editor is connected, the agent can use the authoring skill directly.

## Source structure

```text
skills/
├── chorono-setup/
│   ├── SKILL.md
│   └── agents/openai.yaml
└── chorono/
    ├── SKILL.md
    ├── agents/openai.yaml
    └── references/
        ├── connection.md
        ├── animation.md
        ├── interaction.md
        └── media-and-output.md
```

`SKILL.md` contains the skill name, description and operating instructions. `agents/openai.yaml` provides client-facing metadata. The authoring references cover [connection](../../skills/chorono/references/connection.md), [animation](../../skills/chorono/references/animation.md), [interaction](../../skills/chorono/references/interaction.md), and [media/output](../../skills/chorono/references/media-and-output.md), so the agent reads details relevant to the task.

The canonical editable sources are in `skills/`. `npm run cli:build` copies them into `packages/cli/skills/` and creates a SHA-256 manifest for distribution. That generated directory is not edited by hand.

## Install with the Chorono CLI

The [full setup](installation.md) already installs the skills for selected Codex/Claude Code clients. For skills alone, run from the checkout:

```sh
npm run cli:build
npm run skills -- list
npm run skills -- install --dry-run
npm run skills -- install
npm run skills -- check
```

These skill commands use the local bundle; they do not download a newer copy from npm or GitHub. `--dry-run` shows the planned changes without installing them.

| Scope | Codex | Claude Code |
| --- | --- | --- |
| Project, default | `<project>/.agents/skills/` | `<project>/.claude/skills/` |
| User, `--global` | `~/.agents/skills/` | `~/.claude/skills/` |

Choose a client, an existing project or an individual skill:

```sh
npm run skills -- install --agent codex
npm run skills -- install --project "../my-animation" --agent claude-code
npm run skills -- install --global --agent codex --skill chorono --skill chorono-setup
```

Use `--agent all` for both supported filesystem clients. `--global` and `--project` cannot be combined. `skills install` requires an existing project directory; full `setup --project` can create one. Claude Desktop's MCP configuration does not make it load these filesystem skill directories.

## Alternative: install instructions from GitHub

With the third-party [skills CLI](https://github.com/vercel-labs/skills) and Node.js 22.20+, run inside your animation project:

```sh
npx skills add codie1982/chorono-editor --skill chorono --skill chorono-setup -a claude-code -a codex --copy
```

For a user-wide install, add `-g`. `--copy` selects copied files. See the tool's [installation options](https://github.com/vercel-labs/skills/blob/main/docs/commands.md). This method installs instructions; continue with the [editor and MCP installation](installation.md) to make scene tools available.

Keep using the installer that owns a given copy. Chorono's CLI treats copies without its `.chorono-skill.json` metadata as `foreign`, including copies installed by another tool; it preserves them. Symlink destinations are refused by the Chorono CLI.

## Update and inspect status

After obtaining the desired source version, rebuild the bundle and update:

```sh
npm run cli:build
npm run skills -- check
npm run skills -- update --dry-run
npm run skills -- update
```

| Status | Meaning / next step |
| --- | --- |
| `current` | Matches this CLI bundle |
| `missing` | Install the skill |
| `different` | Unmodified managed copy from another bundle; use update |
| `modified` | Local changes detected; review and preserve them |
| `foreign` | Copy not managed by this CLI; review its installation source |

`check` compares against the running package's manifest, not npm latest. `update` preserves modified or foreign copies. After reviewing a specific conflict, `--force` on install/update backs up the replaced directory under `<scope>/.chorono/skill-backups/`. Unrelated skills are not removed.

Start a new agent session after installation or update. Verify that the client has loaded the skills and MCP tools; a skill folder alone cannot register tools in an already open chat.

## Use the skills

For setup, ask: “Use chorono-setup to prepare this animation project, start the editor and check MCP readiness.” For authoring, ask: “Use chorono to animate a title and shapes, inspect preview frames and save the editable project.”

The authoring workflow reads the scene and capabilities, preserves unrelated content, uses revision checks, commits dry-run script plans without replaying them, inspects real preview images, validates and saves. Scripts use the isolated MCP bridge. See the [MCP reference](../tr/mcp.md) and [maintainer distribution guide](../tr/skills.md) for technical details.
