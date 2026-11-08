# Particle, spline and Scene Explorer scripting

Read the connected `chorono://scripting` contract, capabilities and scene first. These namespaces edit the same native scene data as the editor. Use them through isolated MCP `run_script`, inspect a dry-run plan, commit that plan, then inspect real previews. Times on timelines are milliseconds; spline coordinates are layer-local; particle life positions are normalized to 0..1.

## Particle emitters

`scene.particlePresets` lists detached preset metadata: `id`, `name`, `category`, `description`, `tags`, `mobileSafe`, and `complexity`. Pass the metadata `id` to preset methods; a display name is not necessarily a recognized alias. Create an emitter with `scene.addEmitter(presetId,options)` and access its particle domain with `emitter.particles`.

| Read or operation | Signature and behavior |
| --- | --- |
| Full config | `particles.data` returns detached `ParticleEmitterData` |
| Presets | `particles.presets`; `getPreset(name)` returns a detached native config; `applyPreset(name)` replaces only the particle config, preserving the layer's name, transform and timing |
| Merge config | `patch(deepPartial)` recursively merges objects and replaces arrays; `Layer.configureParticles` uses this same validated deep merge |
| Config sections | `emission(patch)`, `visual(patch)`, `animation(patch)`, `random(patch)`, `rendering(patch)` |
| Deterministic seed | `seed(unsigned32BitIntegerOrString)`; repeated strings produce the same seed |
| Life channels | `life('scale'|'opacity'|'color',stops)`, `lifeKey(channel,t,value,easing?)`, `removeLifeKey(channel,t)`, `clearLife(channel)` |
| Motion modifiers | `motionModifiers` returns a copy; `addMotionModifier(type,options?)` returns an array index; `updateMotionModifier(index,patch)`, `removeMotionModifier(index)` |

Life stops have `{t,value,easing?}`. Scale and opacity values are numbers; color values accept supported CSS colors or canonical `{r,g,b,a}` channels, each 0..255. Stops are sorted and positions must be unique. Removing the last key clears that channel. Life-gradient easing belongs to the **destination stop**, unlike timeline easing, which belongs to the starting keyframe. `clearLife('color')` restores single-color mode.

Native motion modifier types are `noiseDrift`, `sineWave`, and `spiral`; options include `enabled`, `amount`, `speed`, and `phase`. Re-read indices after removing modifiers. This is serialized configuration, not a callback API.

Emitter shapes include point, line, circle, rectangle, path, and sourceLayer. Path emission uses `emitter.area.pathLayerId`; source-layer emission uses `area.sourceLayerId`. Create the referenced geometry first. Path/spline geometry and its hierarchy transforms drive actual emission. `area.emitFromEdge` selects circle/rectangle edges instead of interiors. Animated emitter configuration is evaluated deterministically for the requested frame; it does not integrate a separate configuration history over previous frames.

Current domain limits include 10,000 particles, 256 stops per life channel, 64 motion modifiers, and a one-hour emitter duration. Settings are validated against the actual model; unknown keys, invalid ranges, callbacks and native objects are rejected. Particle Flow graphs (`mode:'flow'`) and additional `burstMarkers` remain unimplemented and are rejected rather than stored as a working effect. Use separate native emitters for additional bursts.

## Spline geometry

Create a layer with `scene.addSpline(kind,params,options)`, then use `layer.spline`. Implemented primitive kinds are `line`, `rectangle`, `circle`, `ellipse`, `arc`, `donut`, `ngon`, and `star`; these primitive names differ from layer registry kinds such as `splineCircle`.

`spline.data` contains the complete detached sub-shape, contour, point, handle and segment records. `bounds` is the local geometry bounds. `getPoint(id)`, `getHandle(id)`, `getSegment(id)`, `getContour(id)` and `getSubShape(id)` return detached records or null.

| Operation | Signature |
| --- | --- |
| Append a primitive | `appendPrimitive(kind,params,{x?,y?,name?})` |
| Add a custom contour | `addContour(anchors,{closed?,subShapeId?,name?})`; an anchor has `{x,y,type?,in?,out?}` |
| Add/move/remove a point | `addPoint(contourId,{x,y,type?},{afterPointId?})`, `movePoint(id,x,y)`, `removePoint(id)` |
| Point type and lock | `setPointType(id,'corner'|'smooth'|'bezier'|'bezierCorner')`, `setPointLocked(id,boolean)` |
| Create/move a handle | `setHandle(pointId,'in'|'out',{x,y,locked?})` returns its handle id |
| Remove/lock a handle | `removeHandle(pointId,'in'|'out')`, `setHandleLocked(handleId,boolean)` |
| Segment editing | `setSegmentType(id,'line'|'cubic')`, `setQuadraticControl(id,{x,y})`, `splitSegment(id,t)` |
| Contour editing | `setContourClosed(id,boolean)`, `reverseContour(id)`, `removeContour(id)` |
| Sub-shapes and fill | `setSubShape(id,{name?})`, `removeSubShape(id)`, `setFillRule('nonzero'|'evenodd')` |
| Affine geometry edit | `transform({a,b,c,d,e,f},{subShapeId?})` |

Append/contour creation returns `{subShapeIds,contourIds,pointIds,handleIds,segmentIds}`; `addPoint` returns a point id; `splitSegment` returns `{pointId,segmentIds}`. Reuse these returned ids. Split progress must be strictly between 0 and 1. Read the resulting geometry after topology edits instead of guessing new ids.

Geometry edits preserve the layer's transform, parent, pivot and size. Handle movement follows the native point-type constraints. Locked points/handles and locked or frozen ancestor layers are respected. Instance geometry can be read, but edits require explicitly opening the source layer. Destructive edits remove tracks targeting deleted spline elements in the same undoable operation, preventing stale animation data from recreating deleted points.

For animated geometry, first establish the topology, then key scalar coordinates such as `spline.points.<pointId>.x` or `spline.handles.<handleId>.y` on an explicit timeline. Whole-object/topology morphing is not a keyframe feature. `layer.followPath(splineLayer.id,options)` attaches another object to an editable spline.

## Scene Explorer hierarchy

`scene.explorer` exposes the hierarchy and relationships shown by the Explorer, with the same faceted search grammar. It reads scene data independently of panel selection, columns, temporary filters, collapsed rows, pin-first display order and UI sorting.

| Read or operation | Result and behavior |
| --- | --- |
| Root ids | `explorer.roots` |
| Flat nodes / tree | `explorer.nodes`, `explorer.tree`; tree nodes add `children` |
| One node | `node(id,{timelineId?,timeMs?})`; also includes complete `data` |
| Relationships | `children(idOrNull)`, `ancestors(id)`, `descendants(id)` return id arrays; ancestors are ordered root to parent |
| Search | `query(searchString,options?)` or `query({search,timelineId,timeMs,parentId,recursive,includeAncestors,offset,limit})` |
| Rename | `rename(id,name)` |
| Flags | `setFlags(idOrIds,{hidden?,locked?,solo?,pinned?})` |
| Group / ungroup | `group(ids,{name?})` returns the group id; `ungroup(id,{keepWorld?})` returns child ids |
| Reparent | `reparent(idOrIds,parentIdOrNull,{keepWorld?,timeMs?})` returns moved root ids |
| Order | `reorder(id,siblingIndex)`, `moveBefore(id,referenceId)`, `moveAfter(id,referenceId)` |

Nodes include parent/child/ancestor ids, sibling index, own/inherited flags, asset/source/path/mask links, effect data, selected-timeline track summaries and rendered `worldBounds`. Hidden geometry or audio can have null bounds. Default reads use the script-selected timeline (or the first timeline) at time 0; pass options to inspect a specific animation/time. `nodes`, `tree` and query results contain metadata; use `node(id).data` or `scene.get(id).data` for complete layer data.

Examples of queries are `type:spline`, `type:particleEmitter`, `has:keyframes`, `has:masks`, `is:locked`, `name:Hero` and `parent:<id>`. Query results contain matches by default; set `includeAncestors:true` to retain their parent chain. `parentId` restricts the scope; `recursive:true` includes descendants. Results follow authored scene order, and query pagination is bounded to 5,000 nodes.

Group sibling layers before adding transform animation. Reparent/ungroup preserve world placement by default, including anchors; lossy changes involving shear, singular transforms, animated/bound transforms or group compositing require baking first or an explicit `keepWorld:false` local-space move. Hierarchy edits reject cycles and locked/frozen affected layers. Sibling ordering changes render order, not the panel's temporary sorting preference.

## Build a path-emitter system with code

This example adds a small native system without clearing existing work. Choose a fresh timeline id and adapt coordinates to the current composition. The geometry is created and grouped before its point animation is authored.

```js
const timelineId = 'domain_demo';
if (scene.timelines.some(t => t.id === timelineId)) throw new Error('Choose a fresh timeline id');
const timeline = scene.createTimeline({id:timelineId,durationMs:3000,loop:true});
scene.useTimeline(timeline.id);

const guide = scene.addSpline('line',{x1:-140,y1:0,x2:140,y2:0},{x:360,y:260,name:'Emission guide'});
if (!guide) throw new Error('Line spline unavailable');
guide.patch({style:{fill:{opacity:0},stroke:{color:'#526885',width:2}}});
const segmentId = Object.keys(guide.spline.data.segments)[0];
guide.spline.setQuadraticControl(segmentId,{x:0,y:-110});
const inserted = guide.spline.splitSegment(segmentId,0.5);
const point = guide.spline.getPoint(inserted.pointId);

const emitter = scene.addEmitter('magicDust',{name:'Path particles',x:360,y:260,durationMs:3000,loop:true});
emitter.particles.seed('editable-path-particles')
  .emission({shape:'path',ratePerSecond:24,maxParticles:96,area:{pathLayerId:guide.id}})
  .visual({shape:'circle',size:{min:2,max:5}})
  .random({positionRandomness:0})
  .animation({lifetimeMs:{min:900,max:1400},positionOffset:{x:{min:0,max:0},y:{min:-40,max:-20}}})
  .life('opacity',[{t:0,value:1},{t:1,value:0}])
  .life('color',[{t:0,value:'#5de0cf'},{t:1,value:'#9c9bff'}]);
const modifierIndex = emitter.particles.addMotionModifier('sineWave',{amount:5,speed:0.8,phase:0});
emitter.particles.updateMotionModifier(modifierIndex,{amount:8});

const systemId = scene.explorer.group([guide.id,emitter.id],{name:'Editable particle system'});
scene.explorer.setFlags(systemId,{pinned:true});
const pointY = 'spline.points.'+point.id+'.y';
timeline.key(guide,pointY,0,point.y,'easeInOut').key(guide,pointY,1500,point.y-25,'easeInOut').key(guide,pointY,3000,point.y);
timeline.key(emitter,'particleEmitter.emitter.ratePerSecond',0,12).key(emitter,'particleEmitter.emitter.ratePerSecond',1500,36).key(emitter,'particleEmitter.emitter.ratePerSecond',3000,12);
scene.log(systemId,scene.explorer.children(systemId),scene.explorer.query({search:'type:particleEmitter',parentId:systemId,recursive:true,timelineId}));
```

Inspect actual `render_preview` images with `timelineIds:['domain_demo']` around 500, 1500 and 2500 ms. Check both the particle distribution and editable guide shape. Validate and save the portable project after inspection.
