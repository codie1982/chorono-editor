# Runtime scene compilation

`RuntimeSceneCompiler` is the authoritative source-to-player field boundary.
Both `RuntimeOptimizer`/`RuntimeExporter` and the legacy `exportToRuntime`
adapter call it before applying their target-specific track policies.

Data flow:

1. An immutable `ChronoScene` snapshot enters `RuntimeSceneCompiler.compile`.
2. Player-visible composition, media assets, layers, timelines, parameters,
   bindings, parameter wires, state machines and initial state are retained.
3. Authoring provenance, editor guides/collections and physics ownership or
   recipe records are removed. Committed physics remains playable because its
   ordinary transform/opacity tracks stay in the timeline.
4. Audio is excluded by default and delivered by the separate WAV mixer. The
   explicit `includeAudio` option is for callers that own an audio-capable
   runtime contract.
5. A target optimizer may sort/deduplicate keys or bake supported signal
   tracks without creating another scene-field allowlist.

The compiler is stateless, owns no resources and does not mutate or clone the
source deeply. It preserves composition-pixel coordinates, millisecond times,
key identities and unwrapped degree values. Layer `hidden` is visual state and
is retained; locks, selection/solo/frozen affordances and editor-only input
expressions are removed.

Minimal use:

```ts
import { defaultRuntimeSceneCompiler } from './RuntimeSceneCompiler'

const runtimeScene = defaultRuntimeSceneCompiler.compile(sourceScene)
player.load(runtimeScene)
```

MCP first converts local media to portable URLs and then runs
`RuntimeExporter`, so exported runtime JSON contains usable embedded media but
does not expose editable bake ownership or solver recipes.
