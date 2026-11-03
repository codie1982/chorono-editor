# Script and timeline patterns

Read `chorono://scripting` and the connected tool schemas before adapting these examples. Times are milliseconds; rotations use the documented layer/track units. The sandbox creates editable tracks and does not execute animation callbacks during playback.

## Independent animations

`scene.createTimeline` requires a unique id. Reuse an appropriate existing timeline or choose a new id after reading the scene. `Timeline.key` always targets that timeline. `Layer.key` targets `scene.useTimeline(id)`, or the first timeline when none is selected in the script; the browser's selected tab does not choose the script target.

The following is a starting point for a new, empty scene. For an existing project adapt the dimensions, names and ids instead of clearing it.

```js
scene.composition({width:1080,height:1920,durationMs:5000,frameRate:30,backgroundColor:'#0b1020'});
const intro = scene.createTimeline({id:'intro',durationMs:2000});
const idle = scene.createTimeline({id:'idle',durationMs:2000,loop:true});
const outro = scene.createTimeline({id:'outro',durationMs:1000});
const hero = scene.add('rect');
hero.set({name:'Hero card'});
hero.pos = [90,500];
hero.size = [900,600];
hero.fill = '#152442';
hero.cornerRadius = 48;
intro.key(hero,'opacity',0,0,'easeOut').key(hero,'opacity',600,1);
intro.key(hero,'transform.y',0,580,'easeOut').key(hero,'transform.y',1000,500);
idle.key(hero,'transform.y',0,500);
idle.modifier('layers.'+hero.id+'.transform.y',{
  type:'sine',parameters:{amplitude:12,frequency:1}
});
outro.key(hero,'opacity',0,1,'easeIn').key(hero,'opacity',1000,0);
scene.log(hero.id,intro.id,idle.id,outro.id);
```

These timelines have independent local clocks; their names do not make them run sequentially. To inspect `intro`, use `render_preview({timeMs:1000,timelineIds:['intro']})`. To chain intro → idle → outro interactively, bind them to explicit state-machine states and events. For a single continuous film, place all tracks on one master timeline with the required absolute times.

When timelines affect the same property, inspect the combined result instead of assuming their values add together. Use `control_playback` with `timelineIds` to isolate one or several timelines and `[]` to restore all. `timelineId` chooses the editable tab; `timelineIds` chooses runtime isolation.

## Tracks and easing

- Easing belongs to the **starting** keyframe of a segment. Supported names include `linear`, `hold`, `easeIn`, `easeOut`, `easeInOut`. A custom curve is `{type:'customBezier',bezier:{cx1:0.2,cy1:0,cx2:0.3,cy2:1}}`.
- For `Timeline.key(layer,property,...)` pass a layer-local property such as `transform.x`. Track-editing methods take full targets such as `layers.<id>.transform.x`.
- `scene.cloneTimeline(id,newId)` duplicates an animation without cloning the objects. It also duplicates existing tracks; remove or replace tracks that should not be inherited.
- Native tools include `set_keyframes`, `update_track`, `remove_track`, `add_modifier`, `clone_timeline`, `update_timeline` and `delete_timeline`. Discover exact input schemas before calling them.
- Track patches support out-of-range behavior, easing/time-warp/multiplier curves and procedural controllers. Discover their schema rather than guessing nested keys. Use `bake_track` or `timeline.bake(target,fps,tolerance)` when the output needs sampled keyframes.

## Procedural objects, paths and particles

Use ordinary synchronous loops for repeated objects and staggered keyframe times. `scene.clone` and `scene.array` expose editable cloning and layouts; read the tool schemas for available array patterns and whether copies are instances. Reuse the returned handles instead of guessing generated ids.

For path motion, create `scene.addPath(points,{role:'motion',name:...})` or an appropriate spline, then `layer.followPath(path.id,{orientToPath:true})` and key `followPath.progress` from 0 to 1. Use capability definitions for spline parameters, trim and repeater properties.

For particles, select a real preset from `get_capabilities`, then use `scene.addEmitter(preset,options)` and `configureParticles`, or the native particle tools. Bound particle counts to the intended scene; inspect frames and avoid increasing counts merely to hide composition problems.

For grouping, create a group and parent child handles with `child.parent(group)` or use the native `group_layers` / `ungroup_layer` tools. Check how parenting affects the existing transforms before moving an established hierarchy.
