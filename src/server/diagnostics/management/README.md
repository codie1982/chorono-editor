# D2 private issue management API

Actual entry: `GET` / `PATCH /api/diagnostics/issues`. It is independent of
anonymous ingestion and remains usable while `CHORONO_DIAGNOSTICS_ENABLED=0`.
Only a configured server-side admin secret enables it:

```sh
export CHORONO_DIAGNOSTICS_ADMIN_TOKEN='<32–256 random nonspace ASCII characters>'
export CHORONO_DIAGNOSTICS_DIR=/absolute/private/diagnostic-depot
```

The token is operator-owned and must never be put in `NEXT_PUBLIC` env, scene
JSON, query strings, client storage, cookies or source control. The management
client holds it only in memory and sends `Authorization: Bearer ...`. Token
rotation is read on each request. Missing/invalid token config returns 404; invalid
credentials return 401 without echoing the header, environment or file paths.
An invalid private depot path returns 503. SHA256 digests are compared with
`timingSafeEqual`; no project/JWT/MCP token is accepted. The request token is not
stored in the error repository.

Remote administration requires HTTPS. Loopback HTTP supports local development.
PATCH requires Origin to equal the served origin; GET permits the usual absent
same-origin Origin header but rejects explicit foreign origins. No CORS grants
or browser sessions are issued. The served Host is strictly validated because
Next can normalize 127.0.0.1 URL hosts to localhost. Forwarded headers are not
trusted; deployment ingress must preserve the correct HTTPS request URL/Host.

## Contracts

`GET ?status=all&sort=recent&offset=0&limit=50[&appVersion=0.2.0]` returns
`{items,total,counts:{new,investigating,fixed},offset,limit}`. Status values are
all/new/investigating/fixed, sort is recent/occurrences, default 50/max 100 rows and
offset 0..10,000. App version is exact valid SemVer. Unknown/duplicate query
fields are 400. Domain validation comes from the repository's shared query
helper, not a second set of sorting/filter rules in the route.

`PATCH` accepts exactly `{key,status,expectedRevision}` with a 64-character issue
hash, one status enum and a nonnegative safe-integer revision. It returns
`{issue}` only after repository commit. The body is at most 1 KiB actual streaming
UTF-8 bytes; Content-Length is not trusted alone. The existing diagnostic input
reader is reused with a lower limit. Unknown fields, arbitrary text/notes,
compressed input and malformed JSON are rejected.

Conflict 409 (`issue-conflict`) means reload rather than overwrite. A retained
issue that no longer exists is 404 (`issue-not-found`). Malformed query/update
is 400, too many bytes 413, wrong media type 415, origin 403, bounded admission 429,
and storage/config failure 503. Responses have `no-store`, `no-referrer`, nosniff
and no secret/exception details. The process-local admin gate admits at most 120
starts/minute and 4 concurrent operations; PATCH body IO has a 10-second deadline
(`DiagnosticManagementApi.patch`), distinct from D1's 15-second report deadline.

## Ownership and verification

`DiagnosticManagementApi` owns HTTP sequencing, admission and timeout cleanup;
configuration/authentication and representation conversion are separate modules.
The shared `DiagnosticIssueRepository` contract performs aggregation/triage CAS
under the same atomic depot lock as ingestion. `service.ts` composes lazily per
directory, starts no timer, and does no depot IO before authorization succeeds.

Tests cover disabled/bad auth, strict queries and body limits, privacy-safe error
responses, same-origin/Host normalization/HTTPS, active-operation admission,
actual Next GET/PATCH against real temporary files, paused ingestion, persistence
after reopening, and stale revision 409. Feature-only full tests/build and real
HTTP/Chrome acceptance passed; [operator handoff and evidence](../../../../docs/tr/diagnostic-management.md)
record the run and limits. The D1 receiver API remains unchanged for old callers.
