# Diagnostic issue management UI (D2)

Entry: `/diagnostics` → `DiagnosticManagementPanel`. The page renders an empty
login shell during SSR and never fetches until explicit Connect. The controller
keeps the admin token in memory only, clears it on disconnect/unmount, aborts
pending queries/edits and rejects late responses by login/query generations.
No localStorage, cookie, URL credential, automatic polling or report upload is
part of this UI. The configured receiver is the same origin as this page.

`DiagnosticManagementApi` owns fixed GET/PATCH adaptation, secure-origin checks,
10s cancellation and existing bounded128KiB response reading. Wire conversion
reconstructs code-only immutable rows/pages. Remote plaintext origins are
rejected before constructing credential headers. Unknown/raw server errors are
mapped to fixed UI messages. Shared issue/query/status types come from the
browser-safe `@/lib/diagnostics/management` contract, not server implementations.

`DiagnosticManagementController` owns one active query and one edit per row.
Filters reset the cursor; manual refresh preserves current rows on failure.
Status changes use the observed revision, wait for server ACK, then refresh.
A409 refreshes the newer state without overwriting it. Logout and filter races
cannot repopulate unauthorized or old-query data. All callbacks are isolated.

The view displays one aggregate per exact version/build/static failure point.
Counts are occurrences across retained days, not users. Receipt times use the
browser timezone with ISO time-element values. Generic unhandled categories
remain labelled Unclassified. Details expose only existing static code metadata.
The table alone scrolls horizontally on narrow screens; filters and login wrap.

Tests cover passive mount/login, credential-free snapshots/URLs, TLS gating,
strict/bounded responses, stale query/edit/logout replies, CAS conflict refresh,
failed edit preservation, one-row aggregation, accessible states and controls.
The root task owns actual Next/browser acceptance, server lifecycle and builds.
