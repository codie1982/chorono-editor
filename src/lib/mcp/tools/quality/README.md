# MCP definition presentation

Public entry: `decorateToolDefinition(tool, implementationName)` from `index.ts`.
The catalog supplies the actual implementation name separately from a displayed
canonical alias. This module does not resolve aliases, dispatch commands, read a
session or grant a source mutation. Those responsibilities remain with the
catalog/resolver and editor/broker adapters.

Data flow:

1. Borrow an existing `ToolDefinition` generated from the authoritative action or
   transport schema.
2. Choose an implementation-specific purpose/selection/side-effect description.
3. Clone its input schema with the existing platform `structuredClone`, then add
   common/tool-specific field descriptions. All validation keywords, defaults,
   required fields, bounds and additional-property behavior remain unchanged.
4. Return the caller-owned schema and truthful behavioral hints. No IO, timer,
   scene copy, mutable cache or disposal obligation is introduced.

Description records are divided by responsibility: editor authoring,
inspection/runtime/execution, and audio/local artifact output. Parameter semantics
are shared only where meaning matches; overloaded fields such as `name`,
`timelineIds`, `startMs` and `patch` have explicit tool overrides. Unknown fields
retain their supplied schema/description rather than receiving invented text.
Adding a new handler still requires its real input schema and authoring tests.

`behavior.ts` reflects effects rather than whether an edit can be undone. Source
replacement/deletion is potentially destructive; creation is additive. File
exports and WAV previews are writes even though source remains unchanged.
`list_projects` may initialize the configured local directory, so it is an
idempotent non-destructive write. Undo, redo, scripts, batch and runtime events do
not claim idempotency. Unknown handlers receive conservative hints.

Media preview/render/mixing/normalization may read already-authored remote
assets; their open-world hint is true. Portable saving reads local `blob:` URLs
and leaves remote references intact; runtime/SVG packaging does not fetch those
references. These hints never add arbitrary URL fetching or filesystem access.

Example (the resolver has already selected the handler):

```ts
const exposed = decorateToolDefinition(
  { ...registeredTool, name: 'replace_layer_fields' },
  'patch_object',
)
// The same shallow replacement input/output behavior is documented explicitly.
// registeredTool and its schema remain untouched.
```

`quality.test.ts` covers immutable ownership, accepted/rejected input parity,
formatted versus structured reads, nested/common semantics, file/runtime hints,
remote media scope and documentation of native registered field schemas. The
catalog/resolver tests must additionally cover full discovery and legacy alias
dispatch, because this module does not alter either operation.
