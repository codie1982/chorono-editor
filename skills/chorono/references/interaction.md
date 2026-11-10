# Parameters, events and state machines

Read the current scene and tool schemas. Reuse existing parameter ids, wires and state machines where they serve the requested behavior. Author definitions with scene tools/scripts and test the running result with runtime tools.

## State-driven timelines

Given distinct `intro`, `idle` and `outro` timelines, the script surface is:

```js
const machine = scene.addStateMachine('Presentation');
const entering = machine.addState('Entering','intro');
const resting = machine.addState('Resting','idle');
const leaving = machine.addState('Leaving','outro');
machine.setInitial(entering);
machine.addTransition(entering,resting,'entered',{blendMs:180});
machine.addTransition(resting,leaving,'dismiss',{blendMs:120});
scene.log(machine.id);
```

Transitions reference the **returned state ids**, not display names. The first state becomes initial automatically; `setInitial` makes the intended start explicit. `from:'*'`, guards, priorities and blending are supported; read schemas before adding their detailed structures. Explicit event transitions do not happen merely because a timeline finished: dispatch the event or use a supported completion/guard mechanism that you verified in the connected API.

Use `control_runtime({machineId,event:'entered'})` to exercise a transition, then `get_runtime` to verify the active state, timelines and parameters. Events enable test ticks even while the main playhead is paused; disable with `control_runtime({testMode:false})` after testing. Inspect `render_preview({})` for the actual live state. Explicit timestamp previews should include `timelineIds` and test an isolated timeline.

## Parameters and wiring

Create an authoring parameter with `scene.addParam(id,defaultValue,{type,min,max})`. Set its live value with `control_runtime({parameters:{...}})`. `render_preview({parameters:{...},timelineIds:[...]})` overrides parameters for that frame only; it does not persist a new parameter default.

Example: connect a numeric parameter to a specific layer's opacity:

```js
const hero = scene.find('Hero card');
if (!hero) throw new Error('Hero card not found');
scene.addParam('energy',1,{type:'number',min:0,max:1});
scene.wire('energy','opacity','source',{targetLayerId:hero.id});
```

For existing definitions, read `scene.parameters`, `triggers`, `bindings`, `parameterWires` and `stateMachines`, or the full `scene.snapshot()`. `scene.stateMachine(id)` opens an existing machine; its `data` is a copy. Machine methods edit metadata, states and transitions. Scene methods include `editEntity`, `updateParam/removeParam`, `updateTrigger/removeTrigger`, `updateWire/removeWire`, and `addBinding/updateBinding/removeBinding`. Read `chorono://scripting` for exact signatures. Advanced native definition tools can be discovered with `get_capabilities({toolName:...})` and used through `batch_actions` when marked `callableInBatch`; see [tool-choice.md](tool-choice.md). Runtime parameter values, parameter defaults, bindings and expression wires are different layers of the system. Inspect `evaluate_frame` with relevant values, then visually verify.

`scene.addTrigger(eventType,actionType,options)` and `layer.interactive(options)` author scene interactions. Use only supported event/action types and expression syntax from the connected schemas. There is no generic `scene.on`, async event handler or DOM listener inside the authoring sandbox.
