# Consent-bound diagnostic outbox

Public entry: `src/lib/diagnostics/delivery/index.ts`. `DiagnosticDelivery` owns
the persistent summary queue and one active request, not the user's preference,
browser subscriptions or recurring scheduler. Browser composition supplies a
cross-tab Web Lock, durable storage, consent reader, fetch, UUIDs, clock and
visibility/online/gesture eligibility. Import and construction do no IO.

## Ownership and data flow

`record({ failureSite })` first reads current permission, converts through the
D0 static catalogue, releases the raw input reference, then waits for the host
lock. It checks the **same consent generation** again before reading/writing.
Old waiting occurrences cannot cross revoke/re-allow. At most 200 record calls
may wait for the lock; excess occurrences increment only a bounded drop counter.

The shared `chorono.diagnostics.outbox.v1` envelope is local-only. It is bound to
the disclosed endpoint, policy `summary-v1` and local consent generation. Reports
are revalidated by `validateDiagnosticReport` on restore. Corrupt/oversized or
obsolete-generation data is erased/reset, never uploaded as arbitrary JSON.

Unattempted reports for one day/build/code/site merge counts. The first actual
attempt persists a frozen UUID/count delta before sending. Later occurrences
use a new item; retry uses exactly the same ID and payload. The server's ACK
must match the ID and contain only accepted/reportId/duplicate; only then is an
item removed. A reused ID with a changed cumulative count is not a valid retry.

Defaults/policy caps: 20 distinct groups per UTC day, 1,000,000 per-group/drop
counts, 200 queued items, 256 KiB UTF-8 envelope, 24-hour item TTL, 16 KiB per
report. A new UTC day resets only the admission catalogue; unexpired queued
deltas from the previous day remain eligible. Backward/invalid clocks are
ignored, not normalized. `getSnapshot()` exposes frozen counters/status only.

## Delivery and lifecycle

`restore()` validates/expires state only after consent. `flush()` attempts at
most one item. Requests are at least five minutes apart across tabs, and only
when the injected canSend reports visible/online/no active gesture. No queue or
not yet due means no network. Root scheduling must not spin on a past due time
while eligibility is false: wait for visibility/online/gesture events or a floor
delay. There is no polling loop in this module.

The lock spans the native fetch/ACK, preventing concurrent tab uploads of one
item. A finite 10-second AbortController timeout bounds actual fetch lifetime;
the fetch port must honor AbortSignal, as native fetch does. Timer cleanup runs
after actual transport settlement. Network errors, 408/429/5xx and malformed
ACK retry with exponential delay, deterministic ID-derived jitter and bounded
Retry-After. Permanent status errors or five exhausted attempts drop the item.
A crash during the final persisted attempt cannot create a sixth attempt.

Transport sends only one validated report, using HTTPS (loopback HTTP is allowed
for local acceptance), no cookies/referrer/redirect following/keepalive. ACK
bytes use the existing BoundedBinaryReader with a 1 KiB cap; native body leases
release on all exits. Raw response bodies, errors and console strings are never
retained. UUID, timer, network and storage exceptions cannot affect scene/undo.

`cancel()` aborts synchronously. Revoke cleanup calls `clear()` after changing
the preference. Cleanup cannot erase another endpoint, a new generation or a
queue that is currently allowed. A late ACK cannot write after a changed consent
generation. Abort cannot recall a report already received by the server.

Storage failure is fail-closed: a report not durably admitted is never sent.
The user preference must therefore be durable independently; this module cannot
grant consent, infer consent from local Interaction recording or transmit old
trace history. Clearing the outbox does not edit the preference.

Focused tests exercise zero work before consent, ordinary cancellation filtering,
1,000-repeat grouping, daily/items/count/byte/TTL caps, restart/strict restore,
retry count deltas, ACK/error/timeout behavior, shared-lock duplicate prevention,
revocation races and stale generation/endpoint cleanup ownership.
