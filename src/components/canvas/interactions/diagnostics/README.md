# Local interaction diagnostics

Public entry: `components/canvas/interactions/diagnostics/index.ts`.
`interactionTrace` owns a disabled-by-default, 300-event local ring buffer.
It has no React, scene, renderer, transport, console, persistence or timer
dependency. The Resources panel owns collection controls and JSON download.
The separate client persistence adapter remembers opt-in collection and bounded
evidence in **this tab's sessionStorage**, including across a page reload. A
fresh tab with no saved diagnostic setting starts with collection off.

```ts
import { interactionTrace } from './diagnostics'

interactionTrace.clear()
interactionTrace.setEnabled(true)
// Perform the object/guide/Pan interaction in the viewport.
interactionTrace.setEnabled(false)
const json = interactionTrace.exportJson()
```

`subscribe` / `getSnapshot` implement the external-store contract for
`useSyncExternalStore`: snapshots, record arrays, records and scalar metadata
are immutable, and snapshot identity changes only for a real collection/state
change. Stopping retains evidence; Clear removes records/eviction count while
preserving collection state. Sequence/session IDs remain monotonic across clears.
An always-mounted editor effect acquires `ensureInteractionTracePersistence()`
and returns its cleanup. Closing Resources therefore does not release recording
or persistence. The browser bootstrap guards server rendering, reference-counts
leases, and the last cleanup flushes/relinquishes storage ownership.

Gesture adapters may pass optional `diagnostics: { owner, details }` to
`PointerGestureSession` or `EditorPointerSession`. Source sessions correlate a
native child through `details.sourceSessionId`. `previewSummary` is an optional
scalar observer sampled only on the first/final source preview while enabled;
exceptions in that observer cannot cancel an edit. Disabled collection calls
neither summary observers nor source-reference diagnostic helpers.

Native records describe start, capture availability, the first pressed movement,
terminal coordinates, total moves/rejected samples, release recovery and cancel
reason. They do not append an event for each move. Source records describe start,
first/final preview, source/transaction/document guards, commit, cancellation
and close. A terminal `source-cancel.details.reason` distinguishes native blur,
pointer cancellation, lost capture, scope cleanup, source divergence, no changes,
no movement, drag threshold and failed commit. Native recovery uses the last
pressed point, not a later hover coordinate.

Native coordinates and drag threshold distances are **CSS px**; concrete source
adapters explicitly name composition values (`appliedX`, `appliedPosition`, etc.)
and include canvas rect/scale context when needed. `timeMs` is Unix epoch time,
not animation time. Source reference IDs come from a WeakMap: they identify
baseline/expected/current object identity without retaining scene snapshots or
serializing source JSON.
Every record also carries a runtime `bootId`; source-reference IDs can restart
after reload and are compared only within that boot. Sequence/session counters
are persisted independently of the ring so clearing records cannot reuse IDs.

The versioned export (`schemaVersion: 1`) includes bounded scalar IDs, reason
codes, coordinates, counters and flags. Callers must not provide object names,
scene JSON, media, raw errors or credentials. Non-scalar/nonfinite values are
discarded; owner/event/key labels, string values and metadata field count are
bounded. Errors are recorded as categories, never raw messages. No records are
uploaded automatically. JSON download/persistence belongs to the UI adapter.

`persistence/TraceSessionStorage.ts` coalesces actual changes at 200 ms, flushes
pending changes on `pagehide`/dispose, and owns its subscription, timer and event
listener. It never polls. Storage security/quota errors leave in-memory logging
usable. The converter rejects unknown versions or malformed/scalar-invalid data
before restore, limits parsing/storage to 2 MiB UTF-8, and keeps only the latest
owner-capacity events. Rare Unicode-heavy payloads may evict older persisted
events sooner; the in-memory 300-event ring is independent. No scene or media
payload enters storage. sessionStorage survives reload in this tab; browser
crash/storage denial can still lose pending evidence, so Download JSON remains
the explicit durable handoff.

Tests cover bounded eviction, immutable snapshots, disabled no-op behavior,
subscriber isolation, privacy bounds, terminal correlation, source divergence,
cancel categories, recovery coordinates and preserved commit behavior.
