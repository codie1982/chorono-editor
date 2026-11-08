# Continuing an edited scene

## Read the current source

At the start of every new follow-up editing turn, call `get_scene` against the chosen editor before preparing a script or patch. Confirm the session still represents the intended document; an old session id or a healthy server alone does not establish that. The returned objects, property values, keys, paths, timelines and parent-child relationships are the source of truth. Earlier generated code and chat descriptions explain intent but do not supersede the live scene.

Keep existing ids and edit the requested part in place. Do not remove and rebuild a scene, layer, timeline or path to make it match an earlier script. Rebuilding can discard manual work even when the result looks similar. Replace or delete existing content only within the user's requested scope.

This fresh-read rule applies to a new editing turn, not every individual action inside an atomic batch. During the turn, use mutation responses for revision updates. Read again and reconsider the edit if the user reports a new manual change, the document changes, or a revision conflict occurs.

## Revisions, plans and retries

- Pass the latest known scene revision as `expectedRevision` on scene mutations. A successful write returns the revision for the next dependent operation.
- For procedural edits, prepare `run_script` with `dryRun:true` against that revision, inspect the returned plan, and commit its `planId` through `apply_script_plan` at the plan's revision. Do not rerun the code to commit it; that can generate different ids.
- If a revision changes before commit or the plan expires, read the current scene, reconcile the requested change and prepare a new plan. Do not force an old plan onto a new scene or silently raise its expected revision.
- Use a stable `requestId` for each mutation and reuse it only for an identical transport retry. A changed payload or a newly prepared plan needs a new request id. After an uncertain outcome, read the scene before deciding to issue a replacement mutation; a timeout does not prove that the editor rejected the original request. Retry deduplication is bounded and must not be assumed to survive disconnection or server restart.

The current API accepts an optional `expectedRevision`; it does not enforce that an agent freshly read the scene or provide per-property human/Hermes authorship. The workflow above is required agent behavior, not a shipped read-lease or ownership feature. Do not invent provenance methods, actor flags or Hermes-specific tool calls. If documented attribution is unavailable, the author is unknown; absence of metadata does not establish agent ownership.

## Preserve values and metadata outside the edit

Read complete affected records through `layer.data`, `Timeline.data` or `scene.snapshot()`, and use domain getters for spline elements and particle settings. Those reads are detached copies. Prefer focused native commands, domain operations or `layer.patch` to change only the requested fields. Keep unrelated settings and unknown serializable metadata intact; do not reconstruct a record from only its familiar fields.

`layer.patch` recursively merges objects but replaces arrays, scalars and null. `Layer.set` and native `patch_object` shallowly replace nested objects. For example, changing a fill color through a partial `style` object passed to `set` can remove an existing stroke. Use a focused setter or deep patch. When replacing an array is necessary, start from its freshly read complete contents and preserve the other entries and their metadata; prefer element-by-id domain operations when available.

Inspect affected tracks before adding keys. Generic key upsert can replace a nearby key within its time tolerance, including its id and easing/segment settings. Do not regenerate a complete keyframe array or track to adjust one value. Use a supported focused key edit that retains unspecified fields, or explicitly preserve the current record when the documented operation requires replacement. Stable key and spline-element ids are safer references than array indices or remembered times.

Preserve manual-looking and unattributed values equally unless the request calls for changing them. For example, if the current clock was set to **9:05**, a request to smooth its hand movement keeps **9:05** by default. An explicit request to change the displayed time authorizes that change. Ask only when the requested result materially conflicts with an existing value and the intended choice remains ambiguous; identify the conflicting value and proposed effect instead of asking for general permission to continue.

## Names and hierarchy

Reuse existing objects and meaningful groups. Name new layers for their visual or functional role, and place related new objects under an appropriate parent when that structure helps editing. Use returned ids in later calls; names are display labels, and `scene.find(name)` returns the first match rather than proving uniqueness or authorship.

Use `scene.explorer` to inspect the actual tree and perform structured rename, group, reorder or reparent operations. Preserve an existing user's naming and hierarchy unless changing them serves the request. Explorer reparent preserves world placement by default and reports unsupported animated or lossy cases; raw `Layer.parent` only changes the parent relationship. Follow [domains.md](domains.md) for the exact hierarchy contracts. Do not reorganize unrelated layers or bypass a hierarchy limitation to complete an otherwise narrow edit.

After the focused edit, inspect real previews at relevant times, validate and save through the main skill's delivery workflow. Report what changed and any unresolved conflict or exporter warning; do not claim that provenance protection was added to the application.
