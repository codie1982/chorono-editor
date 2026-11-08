# Connect the local editor

The Chorono CLI can install and start the editor; MCP supplies scene tools. No model-provider API key is needed. The model runs in its Claude/Codex client.

From a source checkout with Node.js 20+:

```sh
npm ci
npm run cli:build
npm run chorono -- setup
npm run chorono -- start --background --open
npm run chorono -- doctor
```

With the installed CLI use `chorono setup`, `chorono start --background --open`, and `chorono doctor`. Supply `--project /path/to/video-project` for another animation project or `--editor /path/to/checkout` to reuse an editor. Setup can download a missing editor into the project's `.chorono/editor`; remote branches/tags must contain MCP support. The npm package itself contains the CLI and skill instructions, not the entire Next.js app. An unpublished package requires a local tarball or source checkout.

Setup installs missing dependencies, builds missing outputs and prepares selected MCP client settings. Existing client entries and local changes are preserved; inspect reported stale entries. `--agent codex` or `--agent claude-code` narrows setup. A manual fallback remains available in `docs/tr/mcp.md` in the editor checkout: `mcp:build`, `build`, `mcp:setup` and `start:mcp`.

Open the returned URL and enable **MCP → Connect this editor** through the editor UI. Refreshing the page requires reconnecting. Reload the client's MCP connections or start a new session when configuration changes. Check `list_sessions`: a healthy HTTP endpoint does not prove that the browser connected or the current chat loaded the MCP tools.

`doctor --json` distinguishes missing dependencies/builds, client settings, an offline/disabled/mismatched server, and a running server with zero connected tabs. It is read-only and exits nonzero until ready. `start --background --json` returns the actual URL/log path without leaving the agent's terminal occupied.

Stop a running Next server before rebuilding: `chorono stop` for a CLI-managed background server, otherwise stop it in its original terminal. Then `chorono setup --rebuild`; use `--reinstall` when dependencies need refreshing. The CLI never replaces another process on an occupied port.

Private tokens and configuration backups stay in `.chorono/`; do not print or publish them. `npm run mcp:smoke` checks the protocol without scene mutations. Its `--write` mode edits the scene and exports files, so use it only when that broader test is authorized.

Use the current `get_scene` revision as `expectedRevision` for authored edits and project saves. Audio preview/export also enforce this guard. Other read-only calls, visual/runtime exports and live playback/runtime controls do not enforce it. On conflicts, read again before preparing new arguments. `requestId` is a retry token, not a job id: the same tool with identical arguments reuses its cached result, including failures, within the last 64 ids in that connected session. Disconnect/restart or eviction removes the cache. Inspect the scene after an uncertain timeout before deciding to retry.
