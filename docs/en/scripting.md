# Scripting

Chorono scripts use JavaScript to create and edit native layers, timelines and interactions. The result stays editable. Scripts run once during authoring; the player evaluates the resulting animation on each frame.

For Claude and Codex, use MCP `run_script`. It executes synchronous code in isolated QuickJS with no Node, DOM, network, imports or filesystem access. Prepare external data with the agent's normal tools, then include JSON in the script or import assets with MCP. The manual Script Console still uses the legacy browser runner and does not have the MCP sandbox's isolation or execution limits.

## Discover and execute

Start with `list_sessions`, `get_capabilities`, `chorono://scripting` and `get_scene`. Choose an explicit `sessionId` when multiple editors are connected. Capabilities describe the running version's object kinds, property schemas, particle presets and limits.

1. Read the current scene and revision; preserve unrelated work.
2. Call `run_script({code,dryRun:true,expectedRevision,requestId})`.
3. Inspect the returned objects, timelines, logs and `planId`.
4. Commit with `apply_script_plan({planId,expectedRevision,requestId})` through the same running MCP server. Do not replay the script: the plan preserves generated ids. Plans expire after five minutes, a scene change, or a server restart; separate short-lived stdio server processes do not share plans.
5. Inspect actual `render_preview` images, validate, then `save_project`.

An error discards the working scene. A successful commit is one undo step. Separate import, playback, runtime-event, preview, save and export operations use MCP tools; these are not filesystem or browser APIs inside `scene`.

## Read and safely update existing data

`scene.snapshot()` returns a full detached scene snapshot. `scene.assets`, `assetCollections`, `parameters`, `triggers`, `bindings`, `parameterWires`, `stateMachines` and `initialState` expose detached data. `scene.composition()` and `scene.timelines` also return copies.

`scene.get(id)` and `scene.find(name)` return layer handles; `scene.layers` lists handles. `layer.data` returns the complete detached layer. `layer.get(path)` reads a nested property.

```js
const hero = scene.find('Hero card');
if (!hero) throw new Error('Hero card not found');
scene.log(hero.data, hero.get('style.fill.color'));
hero.patch({style:{stroke:{color:'#ffffff',width:2}}});
scene.log(scene.snapshot().layers.length, scene.assets.length);
```

`layer.patch(partial)` recursively merges objects and replaces arrays, preserving unspecified nested fields. `layer.set(partial)` keeps its original shallow replacement behavior: replacing `audio`, `style`, `transform` or another nested object replaces that whole object. Changing a detached snapshot does not edit the scene. Use handles or entity commands to commit edits. Layer identity cannot be changed through a patch.

## Create a scene with several animations

Adapt composition settings and ids when extending existing work. All times are milliseconds and rotations are degrees.

```js
scene.composition({width:960,height:540,durationMs:4000,frameRate:30,backgroundColor:'#0b1220'});
const intro = scene.createTimeline({id:'intro',durationMs:2000});
const idle = scene.createTimeline({id:'idle',durationMs:Math.PI*1000,loop:true});
const hero = scene.add('rect');
hero.set({name:'Hero card'});
hero.pos = [90,160];
hero.size = [300,180];
hero.fill = '#2563eb';
hero.cornerRadius = 24;
intro.key(hero,'transform.x',0,90,'easeOut').key(hero,'transform.x',1800,480);
intro.key(hero,'style.fill.color',0,'#2563eb').key(hero,'style.fill.color',1800,'#f97316');
idle.track('layers.'+hero.id+'.transform.y',{
  controller:{type:'waveform',waveform:{shape:'sine',amplitude:12,frequency:1/Math.PI,phase:0,offset:160,duty:0.5}}
});
scene.log(hero.id,intro.data,idle.data);
```

Timeline names do not sequence animations. Use absolute key times on one master timeline for a continuous film, or explicit state-machine transitions for interactive sequences. With overlapping tracks, inspect the combined result; do not assume values add.

`scene.useTimeline(id)` chooses the target of subsequent `Layer.key`, `scene.clone` and `scene.array` calls. Without a script selection, the first timeline is used. The editor's selected tab does not choose this target. `Timeline.key` always uses its own id. Clone/array can explicitly override the timeline; inspect the current scripting resource for their signatures. `scene.cloneTimeline(id,newId)` duplicates tracks with fresh keyframe ids while sharing the objects.

## Appearance and animation values

Use `scene.add(kind)` with a kind from capabilities. Handles provide `pos`, `size`, `opacity`, `rotation`, `scale`, `fill`, `text`, `cornerRadius`, `blendMode`, plus `font`, `stroke`, `shapeParam`, `parent`, `interactive`, `followPath`, `configureParticles` and `key`.

Frame evaluation applies animated layer properties before rendering. This includes shape parameters, typography, effects, masks, repeater configuration and particle configuration. Values must fit the actual property schema. A property must exist in the renderer/model; an arbitrary property name does not create a new rendering feature.

Exact-time key updates preserve the existing ID, tangents, segment settings and omitted easing; supply easing explicitly to change it. New keys default to linear. Equality uses `1e-6 ms`; neighbouring fractional keys remain separate and ambiguous coincident keys are rejected. Inserting a sampled value does not promise to preserve an entire nonlinear segment. Driven controllers/bindings require their explicit bake/edit workflow.

Numeric values interpolate with easing. Color properties interpolate color channels; ordinary strings and booleans change at key boundaries. Vec2 values interpolate their components. Numeric controllers and modifiers remain numeric. Use scalar coordinate paths to animate existing path/spline points and handles while preserving topology; arbitrary whole-object/topology morphing is not supported.

Easing belongs to the starting keyframe: `linear`, `hold`, `easeIn`, `easeOut`, `easeInOut`, or `{type:'customBezier',bezier:{cx1:0.2,cy1:0,cx2:0.3,cy2:1}}`.

`Timeline.data` reads a full timeline. `set`, `key`, `track`, `removeTrack`, `modifier` and `bake` edit it. `key` takes layer-local properties such as `transform.x`; track methods take full targets such as `layers.<id>.transform.x`. Track patches expose out-of-range behavior, controllers, time warps, multiplier curves and modifiers. Bake numeric tracks when sampled keys are required.

## Paths, particles and interactions

Create paths with `scene.addPath(points,{role:'motion',name:...})` or `scene.addSpline(kind,params,options)`. Attach `layer.followPath(path.id,{orientToPath:true})`, then animate `followPath.progress` from 0 to 1. Use capability schemas for spline trim/style and particle/repeater data.

`scene.addEmitter(preset,options)` and `configureParticles` create native particle animations. Choose a real preset and inspect representative frames. Animated emitter settings are evaluated deterministically at the requested frame; scripts do not register particle callbacks.

## Particle, spline and Scene Explorer domains

| Namespace | Structured script access |
| --- | --- |
| `scene.particlePresets`, `layer.particles` | Detached config/preset reads; validated deep config edits; emission, visuals, animation, randomness and rendering sections; deterministic integer/string seeds; scale/opacity/color life keys; native motion-modifier CRUD |
| `layer.spline` | Detached geometry/bounds reads; primitive/contour creation; point and handle editing/locking; line/cubic/quadratic segment editing and splitting; contour closing/reversing; sub-shape removal/renaming; affine geometry transforms |
| `scene.explorer` | Tree/node/relationship reads; faceted search; grouping, ungrouping and reparenting; sibling render order; rename and bulk visibility/lock/solo/pin flags |

Use domain commands for structural edits and reuse returned ids. A spline's coordinates are layer-local; its transform, parent and pivot are preserved. Deleting spline elements also removes their animation tracks in the same undoable edit. Instance domain data is readable, while edits require explicitly opening the source layer. Point/handle locks and locked/frozen affected hierarchies are respected.

Particle life keys use normalized positions 0..1; their easing belongs to the **destination stop**. `life('color',stops)` accepts supported CSS colors or 0..255 RGBA data. Native motion types are `noiseDrift`, `sineWave`, and `spiral`; modifier indices must be re-read after removal. Path/source-layer emitters reference existing geometry through `area.pathLayerId` / `area.sourceLayerId`. Circle/rectangle `emitFromEdge` and modifier phase are evaluated by the native engine. Flow graphs and extra `burstMarkers` are not implemented; the particle API rejects them.

Explorer reads use authored scene order and the script-selected timeline (or first timeline) at time 0 by default. `node(id,{timelineId,timeMs})` includes complete layer data; `nodes`, `tree` and `query` return metadata. `query({search:'type:spline',includeAncestors:true})` uses the same search grammar as the panel. Children/ancestors/descendants are id lists. UI selection, collapse, columns and temporary sorting/filter state are separate. World-preserving reparent/ungroup defaults to `keepWorld:true`; animated/bound transforms, shear, singular transforms and lossy group compositing require baking or an explicit local-space move.

See the [domain API reference and complete path-emitter example](../../skills/chorono/references/domains.md) for method signatures, returned ids and constraints.

## Interaction definitions

`scene.addParam`, `scene.addTrigger`, `scene.wire`, `scene.addBinding` and `scene.addStateMachine` define interactions. Read existing definitions before editing them. `scene.stateMachine(id)` opens an existing machine. Machine handles expose detached `data`, metadata/state/transition editing and `setInitial`. Scene entity commands update/remove parameters, triggers, wires and bindings. Consult `chorono://scripting` for exact signatures.

Dispatch runtime events and parameter overrides with `control_runtime`, then inspect `get_runtime` and live previews. Authoring scripts do not provide `scene.on`, `scene.update`, asynchronous event listeners, macro recording or per-frame callbacks.

## Audio and files

`scene.audioClip(assetId,{timelineId,startMs,name})` reuses an imported audio asset. Its returned handle supports `audioGain`, `audioFades`, `moveAudio`, `trimAudio` and `splitAudio`; these share the editor's native non-destructive audio commands. `splitAudio` returns the right-hand clip. Set a key time when changing animated gain. Raw layer timing patches do not implement audio trimming semantics.

Import new files with MCP `import_asset`. `render_preview` produces PNG; audio preview/export produces WAV. Validate and save a portable project with `save_project`; report its returned path and warnings. Three.js/modeling APIs are outside this script surface.

## Limits

The current MCP limits are 128 KiB script text, 2 seconds, 32 MiB QuickJS memory and 20,000 commands per run; scene totals are 5,000 layers, 100 timelines and 50,000 keyframes. Read connected capabilities for exact limits. These are workload limits, not a playback frame-rate guarantee.

See the [MCP reference](../tr/mcp.md) and [authoring skill](../../skills/chorono/SKILL.md).


## Procedural graph, expressions and bake

The waveform above is `160 + 12*sin(2*tSec)` (Hz frequency, radian phase). Layer `Timeline.track` calls ensure membership. Zero-key numeric controllers appear in Curve Editor with evaluated ranges and bounded display samples. Those graph probes are not source keys. Use the track's **Bake…** button to preview source/baked paths and measured sample/midpoint errors before applying one undoable edit.

`timeline.bake(target,60,0.005,{startMs:0,endMs:1000})` and native `bake_track` optional `startMs`/`endMs` use timeline-local milliseconds; omitted bounds use the full timeline. FPS is positive up to 240, at most 20,000 samples, tolerance 0..1 is normalized vertical simplification error at samples. Existing keys outside the window and unrelated metadata stay; controller/OOR/modifiers/time remapping are removed globally. Remaining keys/constant endpoints drive outside the window. Sampling error depends on FPS, so tolerance is not a continuous accuracy guarantee. Invalid/non-finite/stale source is rejected; Cancel does not change source.

Wire expressions share one safe parser/evaluator in preview and runtime. `source`/`s` means the current pre-wire evaluated input; no implicit time variable/multiplication. `2+3`, scientific notation and explicit multiplication work; `^` is right-associative and precedes unary sign (`-2^2=-4`, `(-2)^2=4`). Wrong arity, unknown names, non-finite/domain errors and cyclic dependencies are diagnosed; the target retains its pre-wire value. Wires read one common input frame, not iterative feedback. Layer sources are scalar numeric; scene parameters retain boolean/numeric-string coercion. Limits: 4096 characters, 1024 tokens/nodes, nesting depth 64. General free-time expression controllers remain a separate feature.
