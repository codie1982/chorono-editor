# Editor source attribution — E−1.2 / MCP 2.1.0

Public domain entry is `src/lib/editor/authoring/index.ts`; serializable types are
`src/lib/types/authoring.ts`. The optional root `scene.authoring` has version 1.
The scene's formatVersion remains 1.x. No dependency on React, transport, DOM,
renderers or database handles lives in the ledger. Metadata is descriptive,
not authentication, legal authorship or permission to overwrite another edit.

## Commit and history flow

`useEditorState` calls `executeAuthoredCommand` for ordinary command dispatch and
final gesture commit, against the gesture baseline. The command executes once;
`attributeSourceChange` compares source entities and stamps actual changes only.
Preview/evaluation/cancel do not stamp. History keeps source and metadata in the
same snapshot, so undo/redo restores the original actors without crediting the
undo caller. No separate hook map, append-only log or second history is used.

Browser commands default to `human`. The AI planner attaches an `agent` stamp.
MCP broker admission supplies an agent display label, fresh transaction UUID and
optional request ID through its private authorization envelope. Actor labels
are not credentials; connection tokens, machine/user IDs and timestamps are not
stored. The browser refuses old bridge jobs lacking this context. Rebuild/restart
editor and STDIO together for MCP 2.1.0. Source mutation arguments are unchanged
from 2.0.0: a fresh read token and expectedRevision are still mandatory.

```ts
const next = executeAuthoredCommand(command, scene) // browser human default
const state = describeAuthoring(next, ['layer', layerId])
const subtree = describeAuthoring(next, ['layer', layerId], true)
const writer = fieldAuthoring(next,
  ['key', timelineId, target, keyId], ['value'])
```

`createdBy` records identity creation; `lastWriter` records the latest local
entity edit. `baseWriter` covers original content, with sparse `fields` overrides.
A human editing an agent layer's text value does not change its creation actor
or overwrite the origin of its color. Parent identity is not ownership of its
children. Query subtree contribution explicitly; legacy children contribute
unknown. Different kinds contribute `mixed`; actor labels remain in `actors`.
Use leaf paths for field queries; an aggregate object with nested writer
exceptions returns unknown rather than guessing a single writer.

## Identity and conversion rules

Dictionary keys are JSON-encoded identity tuples, e.g. `["layer","clock"]`,
`["key","intro","layers.clock.transform.x","key-1"]`, or
`["spline","outline","points","point-1"]`. Field keys are separate JSON
segment arrays, e.g. `["text","value"]`. IDs containing punctuation do not
collide. Layer/timeline/track/key and normalized spline tables are separate
entities, not broad changes credited to ancestors. Other source collections
have entity IDs; unnormalized arrays (including legacy path points and nested
state-machine graphs) are atomic fields. Duplicate/missing/oversized legacy IDs
are ambiguous and stay unknown. Missing records never imply human authorship.

Native forest/legacy clone, timeline clone and key clipboard commands emit exact
old/new identity mappings at allocation. Batches and sandbox plans carry those
hints without stamping previews. A copy has a new creation actor, while copied
content inherits known original writer records; explicit placement/time changes
are credited to the current actor. Unavailable source attribution is unknown.
This is not inferred from geometry similarity, names, times or array indices.
Copies of newly created or removed source entities in the same atomic script may
have unknown inherited content when no prior source record exists.

Document/media merge imports classify new content as `import`; they do not claim
that the local person created the imported illustration. Merge does not import a
foreign ledger as trusted local attribution. Opening/loading a complete project
instead preserves its validated ledger verbatim. Legacy projects open unchanged
with unknown attribution. Ordinary edits ignore proposed replacement ledgers.
Portable source saves preserve it; **both** runtime exporter paths explicitly
remove the root ledger. User parameters/initialState named authoring or hermes
remain ordinary animation data. No Hermès/Hermes animation flag is introduced.

## Ownership, bounds and existing contracts

`SourceEntities` builds temporary borrowed ID views; `FieldChanges` compares
structural JSON fields without retaining values. It cannot use MCP's bounded
`SourceChangeSummary` as authority: that report is intentionally partial and
coarser. The report excludes attribution changes to avoid recursive noise.
`AuthoringLedger` admits at most 8,000 records, 16,000 field exceptions and 2 Mi
encoded characters. It evicts complete oldest records before exceeding limits;
missing data then reads unknown and `truncated:true` signals incomplete coverage.
`AuthoringHintCollector` caps private copy hints at 8,000; omitted new content
is downgraded to unknown. Old history snapshots still retain their own immutable
metadata and existing history/resource limits apply. No process-RAM cap is claimed.

`assertAuthoringData` validates JSON/open/MCP boundaries, rejecting malformed or
unsupported versions before source replacement. The ledger contains no source
copies, dense frame buffers or browser handles. No IO/timer/dispose is needed.
Native copy preparation remains bounded by existing source layer/key limits.

General key upsert still has its old identity/collision semantics; E−1.4 will
change those. To edit one existing key now, retain its ID and unspecified fields
with the existing value command or a freshly read track patch. Attribution
explains contribution; it does not block explicit edits or implement semantic
approval/merge policy. Preserve all unrelated human/agent/unknown data equally.

Tests cover mixed and unknown origins, key/easing preservation, spline IDs,
copy/import/clipboard lineage, malformed data, capacity, exact history restore,
portable JSON and both runtime adapters. MCP tests use the real broker and
browser dispatch; isolated Chrome acceptance also edits a live text field.
