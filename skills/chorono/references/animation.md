# Script and timeline patterns

Read `chorono://scripting` and the connected tool schemas before adapting these examples. Times are milliseconds; rotations use the documented layer/track units. The sandbox creates editable tracks and does not execute animation callbacks during playback.

## Independent animations

`scene.createTimeline` requires a unique id. Reuse an appropriate existing timeline or choose a new id after reading the scene. `Timeline.key` always targets that timeline. `Layer.key` targets `scene.useTimeline(id)`, or the first timeline when none is selected in the script; the browser's selected tab does not choose the script target.

The following is a starting point for a new, empty scene. For an existing project adapt the dimensions, names and ids instead of clearing it.

```js
scene.composition({width:1080,height:1920,durationMs:5000,frameRate:30,backgroundColor:'#0b1020'});
const intro = scene.createTimeline({id:'intro',durationMs:2000});
const idle = scene.createTimeline({id:'idle',durationMs:Math.PI*1000,loop:true});
const outro = scene.createTimeline({id:'outro',durationMs:1000});
const hero = scene.add('rect');
hero.set({name:'Hero card'});
hero.pos = [90,200];
hero.size = [900,600];
hero.fill = '#152442';
hero.cornerRadius = 48;
intro.key(hero,'opacity',0,0,'easeOut').key(hero,'opacity',600,1);
intro.key(hero,'transform.y',0,280,'easeOut').key(hero,'transform.y',1000,200);
// A layer track also includes its owner in explicit timeline membership.
idle.track('layers.'+hero.id+'.transform.y',{
  controller:{type:'waveform',waveform:{
    shape:'sine',amplitude:100,frequency:1/Math.PI,phase:0,offset:200,duty:0.5
  }}
});
outro.key(hero,'opacity',0,1,'easeIn').key(hero,'opacity',1000,0);
scene.log(hero.id,intro.id,idle.id,outro.id);
```

These timelines have independent local clocks; their names do not make them run sequentially. To inspect `intro`, use `render_preview({timeMs:1000,timelineIds:['intro']})`. To chain intro → idle → outro interactively, bind them to explicit state-machine states and events. For a single continuous film, place all tracks on one master timeline with the required absolute times.

When timelines affect the same property, inspect the combined result instead of assuming their values add together. Use `control_playback` with `timelineIds` to isolate one or several timelines and `[]` to restore all. `timelineId` chooses the editable tab; `timelineIds` chooses runtime isolation.

## Continuous sine and sampled curves

The `idle` controller above evaluates `y = 200 + 100 * sin(2 * tSec)`, where `tSec` is that timeline's local time in seconds. Its period is π seconds, matching the loop duration. Key times and `durationMs` use milliseconds; waveform `frequency` uses cycles per second (Hz), and `phase` and trigonometric inputs use radians. Setting `frequency:2` would mean two complete cycles per second.

Controllers ignore stored key values. `Timeline.track` now records an existing layer owner in explicit membership as `Timeline.key` does. Curve Editor displays zero-key numeric controllers with evaluated ranges and bounded graph samples; these display samples never become source keys. Use **Bake… → Preview bake → Apply bake** when you need editable keys:

```js
const idle = scene.timeline('idle');
const hero = scene.find('Hero card');
if (!hero) throw new Error('Hero card not found');
idle.bake('layers.'+hero.id+'.transform.y',60,0);
```

This replaces the signal with linear keys over the full timeline at 60 fps; tolerance `0` disables simplification. Optional fourth argument `{startMs,endMs}` selects a local-ms window; native `bake_track` exposes those optional fields too. Existing keys outside the window and unrelated track metadata stay, but controller/OOR/modifiers/time remapping are removed globally. Outside the window the remaining keys/constant endpoints drive the channel. Undo restores original source and membership. FPS must be positive up to 240, tolerance 0..1, and at most 20,000 samples are allowed. Tolerance bounds normalized vertical simplification error at sampled times; between-sample accuracy depends on FPS. Preview reports sample and midpoint errors, not guaranteed continuous equality. To generate other sampled formulas, use synchronous loops and `Timeline.key`, computing values with ordinary JavaScript such as `Math.sin(2 * timeMs / 1000)`.

The `sine` **modifier** uses normalized time within each keyframe segment, with frequency in cycles per segment; it is different from the waveform controller's clock. A single-key track has no advancing segment time. Parameter-wire expressions receive `source` (alias `s`), not `t` or `x`; write `sin(2 * source)` with explicit multiplication. Both aliases use the current pre-wire evaluated source (then static/default fallback), not a guessed zero. Empty/invalid/non-finite inputs and cycles keep the target's pre-wire value with diagnostics. Expressions do not iterate feedback or read other outputs from the same wire pass. Numeric layer sources retain their scalar type; numeric-string/boolean coercion remains available for scene parameters. Arithmetic needs no whitespace; `1e-3` works. Power is right-associative and binds before unary sign: `-2^2` is `-4`; use `(-2)^2` for `4`. Text is limited to 4096 chars, 1024 tokens/nodes and 64 nesting levels; functions require their documented arity. Unknown names, division/domain errors and non-finite intermediates fail explicitly. Arbitrary time-expression controllers and per-frame script callbacks are not available.

## Live scalar property expressions

Discover `get_capabilities.propertyExpressions` and the `replace_layer_fields` patch schema. A2 adds optional `Layer.propertyExpressions` v1, with a `fields` map keyed by layer-local numeric target paths. Each definition has `resultType:'number'`, `formula`, explicit `timelineId`, and named `sources`. A source is `{layerId,propertyPath,valueType:'number'}` or `{propertyPath:parameterId,valueType:'number'}` for a scene parameter. Formulas use `pi`, `e`, `timeMs`, `timeSec`, `timeNormalized` and those names; time is local to the chosen timeline. No `layer.expression` method or per-frame script callback exists.

After a fresh scene read, preserve existing field records and authored fallback with `layer.set({propertyExpressions:{version:1,fields:{...oldFields,'size.width':{resultType:'number',formula:'height+20*sin(2*timeSec)',timelineId:clock.id,sources:{height:{layerId:layer.id,propertyPath:'size.height',valueType:'number'}}}}}})`. Read `layer.data` for `oldFields`; verify this target has no keys/controller/binding/Wire or constant `inputExpressions` recipe. Do not overwrite human drivers to add one. A2 sources are actual finite numbers; string/boolean coercion belongs only to legacy Wire parameter input. Invalid/cyclic/missing sources keep pre-driver/authored values with diagnostics. Legacy Wire→Wire reads retain pre-wire snapshot semantics; new live expression↔Wire dependencies use a shared ordered cycle-checked graph.

Copy/Array remap internal named refs while external refs and timeline/parameter IDs remain shared. Animation scope applies to live recipes too. Limits: 512 live drivers per scene, 128 per layer, 16 named inputs per driver and the existing parser limits. `Properties fx → Live on timeline` edits the same source; its explicit Convert, Keep authored value and native-key bake are separate operations. `Timeline.bake`/`bake_track` still target native tracks, not these property recipes. Basic/native runtime and animated SVG require explicit property bake; full-scene Web SDK/raster/static SVG evaluate live recipes. Global-time property bake captures parameters and rejects state-machine-owned clocks requiring explicit state recording. See the repository's `docs/tr/property-expressions.md` for actual contracts and limits.

Boolean/conditional extension: `resultType:'boolean'` supports `text.uppercase`, `text.underline`, `path.closed`; named sources may be exact `number`/`boolean`. Comparisons, `&&`, `||`, `!`, `test ? a : b` and lazy `if(test,a,b)` use strict scalar types. No numeric truthiness in property formulas. Explicit v1 named refs called `true`/`false` keep their bound meaning; otherwise those names are boolean constants. Preserve other recipes and unrelated keys exactly as above. Boolean can Convert to value or explicitly bake to native hold keys. See `docs/tr/boolean-expressions.md` and the typed extension below.

## Tracks and easing

- Exact-time `Layer.key` / `Timeline.key` and native `upsert_keyframes` updates preserve the existing key ID, tangents and segment settings. Omit easing to preserve it; provide easing explicitly to replace it. New keys default to linear. Equality uses a tiny `1e-6 ms` tolerance, not a ±1 ms deletion window: a nearby fractional key stays separate. Ambiguous coincident source keys are rejected; read their IDs and resolve them explicitly. These are source-channel edits, not automatic controller/binding baking.
- Easing belongs to the **starting** keyframe of a segment. Supported names include `linear`, `hold`, `easeIn`, `easeOut`, `easeInOut`. A custom curve is `{type:'customBezier',bezier:{cx1:0.2,cy1:0,cx2:0.3,cy2:1}}`.
- For `Timeline.key(layer,property,...)` pass a layer-local property such as `transform.x`. Track-editing methods take full targets such as `layers.<id>.transform.x`.
- `scene.cloneTimeline(id,newId)` duplicates an animation without cloning the objects. Its keyframes receive fresh ids so edits stay independent. Read the cloned timeline before referring to individual keys. It also duplicates existing tracks; remove or replace tracks that should not be inherited.
- For a narrow native key edit use advertised `upsert_keyframes` (`set_keyframes` in legacy clients). `update_timeline` is also advertised. Advanced `update_track`, `remove_track`, `add_modifier`, `clone_timeline`, `delete_timeline` and `bake_track` can be discovered with `get_capabilities({toolName:...})` and used in `batch_actions` when marked `callableInBatch`. Read [tool-choice.md](tool-choice.md); schema discovery does not register a new direct tool in the client.
- Track patches support out-of-range behavior, easing/time-warp/multiplier curves and procedural controllers. Discover their schema rather than guessing nested keys. Use `bake_track` or `timeline.bake(target,fps,tolerance,{startMs?,endMs?})` when the output needs sampled keyframes.

## Procedural objects, paths and particles

Use ordinary synchronous loops for repeated objects and staggered keyframe times. `scene.clone` and `scene.array` expose editable cloning and layouts. Both use the timeline selected by `scene.useTimeline(id)`, falling back to the first timeline when none is selected. Explicit selection is `scene.clone(handle,count,{timelineId,...options})` or `scene.array(handle,layout,{timelineId})`. Read schemas for layout patterns and instance modes. Reuse returned handles instead of guessing generated ids.

For path motion, create `scene.addPath(points,{role:'motion',name:...})` or an appropriate spline, then `layer.followPath(path.id,{orientToPath:true})` and key `followPath.progress` from 0 to 1. Use capability definitions for spline parameters, trim and repeater properties.

For particles, select a real preset from `get_capabilities`, then use `scene.addEmitter(preset,options)` and `configureParticles`, or the native particle tools. Bound particle counts to the intended scene; inspect frames and avoid increasing counts merely to hide composition problems.

For deeper editing, use `layer.particles` for validated preset/config/life-gradient/motion-modifier operations, `layer.spline` for native point/handle/contour editing, and `scene.explorer` for hierarchy queries, grouping and reparenting. See [domains.md](domains.md) for signatures, returned ids, coordinate spaces and a complete path-emitter example.

For grouping, create a group and parent child handles with `child.parent(group)` or use the native `group_layers` / `ungroup_layer` tools. Check how parenting affects the existing transforms before moving an established hierarchy.

## Read, merge and animate data

`scene.snapshot()` returns the full editable scene as detached JSON. `scene.assets`, `assetCollections`, `parameters`, `triggers`, `bindings`, `parameterWires`, `stateMachines` and `initialState` expose copies. A layer's `data` contains its complete settings, and `get('style.fill.color')` reads one nested value. Modify the scene with handles rather than changing these copies.

Use `layer.patch({style:{stroke:{width:3}}})` to preserve sibling fields. `layer.set({style:...})` replaces the complete style object. Arrays are replaced by `patch`, not merged element by element. Do not change layer identity.

Animation overrides are applied to layer data before drawing, including shape, text, effect, mask, particle and repeater settings. Numbers interpolate with easing; color paths interpolate channels; ordinary strings and booleans switch at key boundaries; Vec2 values interpolate components. Numeric modifiers/controllers/bake operate on numbers. Use exact property paths from capabilities/data and inspect real frames. For geometry motion, key scalar coordinates of existing points/handles while preserving topology; whole-object geometry morphing is not supported.


Typed input extension (A4): `get_capabilities.propertyExpressions.resultTypes` includes number, boolean, string, color, vec2. Supported schema-backed visual values and stable-ID spline point/handle coordinates accept matching results. Use `rgb/rgba/color`, `vec2/x/y`, `concat/str/fixed`, and explicit typed named refs. RGBA records use all channels 0..255, while `rgba` alpha and `alpha(color)` use 0..1. Strings are bounded to 4096; select strings must match canonical choices. No implicit scalar coercion or member/host access. Preserve source values, unrelated definitions and existing driver ownership, with a fresh source read/token/revision before mutation.

Bake numbers/vectors/colors to linear native keys; booleans/strings to hold keys through the Properties fx review. Time uses composition/project sampling, current parameters are captured, and SM-owned global-time bake remains unavailable. Sample/midpoint reports are diagnostics, not continuous equality proofs. Basic runtime/animated SVG require explicit bake. A constant `inputExpressions` recipe preserves its formula + typed result but never replays after human changes; configuration calculators explicitly apply only a result and do not save/run a live job. Do not mark assets, URLs, source IDs or array stop indexes as live formula targets. See `docs/tr/typed-input-expressions.md` for source paths, field adapters and limitations.
