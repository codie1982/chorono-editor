# Security policy

This policy covers the Chorono editor, local MCP bridge, CLI and bundled agent skills in this repository.

## Supported code

Security fixes target the current `main` branch. Please report the affected commit or tag and, when relevant, the CLI package version. Older commits and feature branches do not have a separate security backport commitment.

## Report a vulnerability privately

Email the maintainer, **Engin EROL**, at **[engin_erol@hotmail.com](mailto:engin_erol@hotmail.com)** with the subject `Chorono security report`.

Please do not disclose exploit details in a public issue, discussion or pull request before the report has been assessed. GitHub private vulnerability reporting is not currently enabled for this repository; email is the private reporting channel.

Useful details include:

- Affected commit/tag and component: editor, MCP, CLI, skills, import/export or project persistence.
- Operating system, Node.js version, browser and agent client where relevant.
- Reproduction steps and a minimal proof of concept using synthetic data.
- Expected security boundary, actual behavior and potential impact.
- Any mitigation or proposed fix you have identified.

Do not send real API keys, MCP tokens, client configuration backups or private project assets. Replace sensitive values with examples. If credentials have already been exposed, revoke or rotate them separately.

Examples worth reporting include bypassing MCP authentication or browser pairing, crossing origin or filesystem boundaries, escaping the scripting sandbox, and unintended disclosure of credentials or project data.

## Handling and disclosure

The maintainer will assess the report, ask for additional reproduction details if needed, and coordinate remediation and disclosure with the reporter. This is a community-maintained project without a guaranteed response or fix deadline. Follow up on the same email thread if needed.

Test only systems and data you own or have permission to assess. Keep reports and proofs of concept limited to what is needed to demonstrate the issue.

## Local security expectations

- Keep the editor and MCP bridge on loopback interfaces. Do not expose the local MCP service directly to the public internet.
- Pair the intended browser editor explicitly and keep `.chorono/` credentials and client configuration backups private.
- External agent clients and model providers have their own access and data-handling settings; review them before using private assets.

For ordinary installation failures or feature requests, use the [issue templates](https://github.com/codie1982/chorono-editor/issues/new/choose). For conduct concerns, use the reporting process in [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
