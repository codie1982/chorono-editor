# Diagnostic receiver (D1)

Actual Node/Next entries:

- `POST /api/diagnostics/reports`: one strict `DiagnosticReport`, max16KiB.
- `OPTIONS /api/diagnostics/reports`: explicit credential-free CORS preflight.
- `GET /api/diagnostics/version`: trusted current release metadata, no client
  current-version query or tracking ID. Unconfigured release returns204.
- `OPTIONS /api/diagnostics/version`: same origin/header constraints.

Disabled by default. No read/list reports endpoint exists. Project/account/JWT
middleware and MongoDB scene collections are deliberately not used.

## Configuration

```sh
CHORONO_DIAGNOSTICS_ENABLED=1
CHORONO_DIAGNOSTICS_ALLOWED_ORIGINS=http://127.0.0.1:2000
CHORONO_DIAGNOSTICS_DIR=/absolute/private/diagnostic-depot
# Optional release data for consented version checking:
CHORONO_DIAGNOSTICS_LATEST_VERSION=0.2.1
CHORONO_DIAGNOSTICS_RELEASE_NOTES_URL=https://example.com/releases/v0.2.1
```

The default directory is `.chorono/diagnostics`. Allowed origins are an explicit
comma-separated list of at most20 exact origins: HTTPS, or loopback HTTP for
local development. Wildcards, credentials and path/query/fragment are rejected.
The browser's own origin must be listed, including for same-origin requests.
An enabled receiver with malformed/missing origin configuration fails503.
Missing/unapproved Origin fails403 for POST/preflight. Public version GET may
omit Origin (ordinary same-origin browser GET); an explicit Origin must still be
allowed, and no-origin responses grant no CORS access. Deployment proxy/CDN/WAF must independently
minimize IP/full-UA/access logging; application code logs no request or raw error.

POST and version GET require `X-Chorono-Diagnostics-Policy: summary-v1`.
POST requires `application/json` without nonidentity Content-Encoding. This
marker is **not authentication or proof of human consent**. D1's browser owner
must enforce persistent permission and cookies/referrer policy before any call.
CORS controls browsers, not hostile direct clients; the finite global ingress
gate and deployment network controls provide separate admission bounds.

## Persistence, idempotency and failure

`FileDiagnosticRepository.accept()` validates strict data again. It records a
random report UUID + canonical payload digest and counts the delta once. Same
UUID/payload is ACKed with `duplicate:true`; different payload under that UUID
fails409. ACK resolves only after a flushed atomic state replacement. Restarts
re-read the committed state; there is no cached mutable count that can overwrite
another process's replacement.

`FileStateStore` creates a private0700 directory and0600 replacement files. A
configured preexisting directory must already be private; it is rejected rather
than silently changing permissions on an unrelated operator directory. A mkdir
operation lock encloses every load/change/save, including separate instances or
same-host processes. At most32 pending operations per instance and one second
lock waiting are allowed. A leftover `.write-lock` after a process crash fails
closed; an operator must first verify **no active writer**, then remove that
directory. The implementation never steals a lock using an unsafe age heuristic.
This adapter supports **one host, a local filesystem with atomic rename/fsync**.
Shared/network filesystems and multi-host replicas require a transactional
database adapter before deployment; do not share this directory across hosts.

On-disk state is capped at16MiB,10,000 live receipts and10,000 daily groups.
Capacity returns503 rather than dropping live dedup identities or silently
double-counting later retries. Ingress is capped at120 admitted starts/minute
and4 concurrent body/IO operations per process; a rejected request gets429 with
Retry-After60. Body reading has a15s deadline and reuses existing bounded binary
and text readers; actual byte limits do not trust Content-Length alone.

Examples and receipts expire after7days; daily code/build/site counts expire
after90days. Expiry is checked on every accept/inspect. The process composition
also owns one unref'd hourly cleanup after first enabled POST. Thus expired
physical state is removed on the next operation or hourly cleanup while running.
A stopped/serverless process cannot promise wall-clock file deletion: such a
deployment must schedule `repository.inspect()` cleanup externally or use a
managed database TTL. Configure and verify this before public collection.

Only code-only summaries/examples and random-ID digests are persisted: no raw
body, IP, UA, message/stack, authored project, media, object/path or account data.
Corrupted/oversized state fails closed, never resets existing counts silently.
Public errors contain only fixed categories, not exception messages or paths.

## Public contracts and checks

Shared `validateDiagnosticReport(input)` rejects unknown top-level/sample fields
and delegates canonical code/build/date/count validation to the D0 converter.
The client uses this same strict contract for restored queue items. Receiver
components do not mutate source scenes, local Interaction logs or client consent.

Tests run the actual Next POST against temporary real file storage, reopen the
repository, concurrently submit deltas/duplicates, verify ID conflicts, private
permissions, TTL pruning, state corruption/caps, ingress/CORS/policy/byte limits,
and disabled/unconfigured/valid release routes. Root orchestrates full repository
tests/build and real HTTP/browser acceptance; no route is published by this file.
