# Installation and MCP troubleshooting

[Documentation](../README.md) · [Türkçe](../tr/troubleshooting.md) · [Installation](installation.md) · [Agent skills](agent-skills.md)

Run diagnostics from the editor checkout. Use the same `--project` and `--agent` values you used for setup:

```sh
npm run --silent chorono -- doctor --json
```

Doctor is read-only and exits with code 1 until ready. Inspect `checks`, `nextSteps` and the server's `connectedEditors` count. A working webpage and a loaded skill do not by themselves make scene tools available.

## Find the failing step

| Symptom or reported state | What to do |
| --- | --- |
| `node`, `npm` or `git` not found | Install the prerequisite and reopen the terminal; the Chorono CLI requires Node.js 20+ |
| `Skill bundle missing` | Run `npm run cli:build` from the source checkout |
| Dependencies or build outputs missing | Stop any running Next server, then run setup again |
| Setup refuses to build on a busy port | Stop the server in its original terminal, or use CLI stop for its managed background process |
| Server `offline` | Run `npm run chorono -- start --background --open` |
| Server `disabled` or `legacy-server` | Stop the older/manual server and start with the MCP-enabled CLI lifecycle |
| Server `other-service`, `different-editor` or `different-project` | Verify the project/editor/port selection; do not kill an unrelated process |
| Server `running`, `connectedEditors: 0` | In the browser choose **MCP → Connect this editor**; reconnect after each page reload |
| Server `unpaired`, `unauthorized` or `unreachable-bridge` | Check local setup, MCP-enabled server and browser connection; inspect nextSteps and the local server log |
| Client `stale` or `unverified` | Review its existing Chorono entry against the generated snippet; setup preserves it |
| Doctor ready, but this chat has no Chorono tools | Reload client MCP connections or start a new agent session; check `list_sessions` |
| Skill `modified` or `foreign` | Review local changes or the original installer; automatic updates preserve the copy |

## Check the selected project and client

If you configured only Codex, check only that client:

```sh
npm run --silent chorono -- doctor --project "../my-animation" --agent codex --json
```

Replace the project path with the one used during setup. Doctor defaults to all clients, so an unconfigured additional client can keep an otherwise working single-client installation from reporting ready.

Setup writes configuration examples under `<editor>/.chorono/client-configs/`: `codex.toml`, `claude-code.json` and `claude-desktop.json`. Compare the Chorono entry's executable, bridge path, editor URL and project path with the selected client's settings. Preserve unrelated entries. Configuration locations are listed in the [installation guide](installation.md).

## Change the port

If port 2000 belongs to another service, select a free port between 1024 and 65535. After stopping any managed server for this checkout:

```sh
npm run chorono -- setup --port 2345 --agent codex
npm run chorono -- start --port 2345 --background --open
npm run chorono -- doctor --port 2345 --agent codex
```

A changed port can make an existing client entry stale. Review it against the regenerated snippet and reload client MCP connections. For separate animation projects, include the same `--project` path on all three commands. One checkout has one managed server; use another checkout for a second independent server.

## Rebuild after a source change

Stop the running Next server first. For a CLI-managed background server:

```sh
npm run chorono -- stop
npm run chorono -- setup --rebuild
npm run chorono -- start --background --open
```

For a manual dev/production server, stop it in its original terminal. Add `--reinstall` to setup only when dependencies also need refreshing. If authoring instructions changed, rebuild the skill bundle with `npm run cli:build` before setup or skill updates.

## Read logs and share useful diagnostics

Background server logs are in `<editor>/.chorono/editor.log`; startup errors also report the actual log path. Share the command, error, selected project/client, Node version, relevant doctor statuses and a small relevant log excerpt. Keep `.chorono/mcp-token`, client configuration backups and unrelated credentials private.

If an npm command cannot find `@codie1982/chorono`, use the [GitHub checkout installation](installation.md) or a local CLI tarball from the [distribution guide](../tr/skills.md); local packaging does not publish to npm. See the [MCP reference](../tr/mcp.md) for protocol checks and tool limits.
