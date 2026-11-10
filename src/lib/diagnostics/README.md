# Error summary foundation (D0)

Public entry: `src/lib/diagnostics/index.ts`. Application build metadata belongs
to the separate public `src/lib/version` entry. This foundation has **no active
collector, singleton, browser hook, persistence, queue, consent UI or transport**.
Importing it cannot enable local tracing or share any information. D1 will own
first-run permission and delivery; D2 owns the real service/update integration.

## Data flow and contracts

An explicit internal failure signal `{ failureSite }` passes through
`convertDiagnosticFailure` into the static catalogue. `DiagnosticSummaryStore`
counts that meaning for one fixed application build and UTC calendar day.
`convertDiagnosticReport` reconstructs an immutable, versioned DTO from the
summary plus a caller-supplied random report UUID. It never sends the DTO.

The only supported sites are the catalogue in `contracts/catalog.ts`: viewport
move/rotate/scale/anchor/resize/guide/shape-placement/motion-key preview, commit
or unexpected rollback, plus application render-failure/unhandled categories.
There is no inference from every `source-cancel`. Normal Escape, blur, below
threshold, empty clicks and successful edits have no failure signal. Future
adapters must call a site only after an actual unexpected failure is established.

Generic unhandled categories are marked `unclassified`. Their counter means a
category occurred, not that every occurrence is one proven root cause. Separate
static call sites should be registered when that information becomes available.
Adding a site requires catalogue/type/privacy/grouping test updates; it must not
accept a dynamically generated site, project string, message or raw stack.

## Ownership, units and limits

Each store owns its map and frozen snapshots, independently of all other stores.
Its constructor validates/copies `BuildInfo`; application version, official build
identity/channel and report schema version remain distinct from MCP protocol.
No raw input, Error, scene, media, DOM or resource handle is retained.

`record(input)` returns `recorded`, `overflow`, `saturated`, `ignored-input` or
`ignored-clock`. Unknown/accessor/inherited failure sites are ignored. Clock
input is injected epoch **milliseconds**, a safe integer from 1970 through 9999.
Invalid/throwing/backwards clocks cannot mutate evidence. Same timestamp is
valid; a valid later UTC day replaces the previous day's in-memory groups.
`getSnapshot()` never samples time. `clear()` drops evidence/overflow without
rewinding the clock or retained day. D1 must hand off pending deltas before day
rollover if it needs them; this store is not a durable delivery queue.

Defaults: at most **20 groups**, counts and overflow saturate at **1,000,000**.
Options may lower these caps, not raise them. Overflow counts occurrences that
do not fit, without retaining arbitrary keys. Group identity uses only fixed
version/build/channel/error code/module/site values. First-seen order and the
first safe sample are deterministic. Snapshot identity stays stable when visible
data does not change; previous snapshots and nested samples remain immutable.
Constructing a fresh store is not permission to activate automatic collection.

## Privacy and report conversion

Converters read only named own data fields, never enumerate or serialize input,
and never call getters or custom `toJSON`. Extra fields are discarded. Static
samples have only operation/outcome codes. Build fields, real UTC dates, count
limits and UUID syntax are validated; inconsistent catalogue/build metadata is
rejected. Existing `measureJson` performs bounded 16 KiB report preflight.

No message, stack, name, authored ID/text/position/path, credential, URL, epoch,
installation identifier or local Interaction history enters the DTO. This is a
transport-neutral data contract, not a promise of network anonymity: D1/D2 must
still implement permission, cookies/referrer policy and hosting log controls.

## Minimal use (explicit signals, no automatic collection)

```ts
import { applicationBuildInfo } from '@/lib/version'
import { DiagnosticSummaryStore, convertDiagnosticReport } from '@/lib/diagnostics'

const summaries = new DiagnosticSummaryStore(applicationBuildInfo)
// An adapter will call this only for a known failure after permission in D1.
summaries.record({ failureSite: 'viewport.object-move.commit' })
const group = summaries.getSnapshot().groups[0]
// Placeholder example UUID: D1 supplies a fresh random UUID for each count delta.
const report = convertDiagnosticReport(group, '35dd0a72-388a-440b-98dc-b34411389502')
```

For retries D1 must freeze the same count delta/report ID/payload and put new
occurrences in a later batch. Re-converting a cumulative live summary under an
old ID is not a valid retry. Report conversion neither increments counts nor
implements server-side idempotency. No request begins in this example.

Tests cover the public pipeline, privacy canaries/accessors, classified and
unclassified codes, 1,000 repeats, static call-site separation, group/count
ceilings, immutability, real dates, UTC rollover and invalid/backward clocks.
