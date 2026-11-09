# Local interaction diagnostics

Public entry: `components/canvas/interactions/diagnostics/index.ts`.
`interactionTrace` owns a disabled-by-default, 300-event local ring buffer.
It has no React, scene, renderer, transport, console, persistence or timer
dependency. The Resources panel owns collection controls and JSON download.

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

The versioned export (`schemaVersion: 1`) includes bounded scalar IDs, reason
codes, coordinates, counters and flags. Callers must not provide object names,
scene JSON, media, raw errors or credentials. Non-scalar/nonfinite values are
discarded; owner/event/key labels, string values and metadata field count are
bounded. Errors are recorded as categories, never raw messages. No records are
uploaded automatically. JSON download/persistence belongs to the UI adapter.

Tests cover bounded eviction, immutable snapshots, disabled no-op behavior,
subscriber isolation, privacy bounds, terminal correlation, source divergence,
cancel categories, recovery coordinates and preserved commit behavior.
