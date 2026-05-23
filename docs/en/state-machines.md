# State Machines

A **State Machine** (also called a Finite State Machine, or FSM) lets you define multiple named animation states — like "idle", "walking", and "jumping" — and connect them with transition rules. At runtime, your animation responds to events and parameter changes by automatically moving between states. This is the same concept used in tools like Rive and Unity's Animator Controller.

---

## When to Use a State Machine

State Machines are the right tool when your animation is **reactive** — when what plays next depends on what happened, rather than just playing a fixed sequence from start to finish.

Common use cases:

- **Character animation cycles** — idle at rest, walk when moving, run when speed is high, fall when airborne
- **UI component states** — button default / hover / pressed / disabled, each with its own micro-animation
- **Loop vs one-shot** — a character idles in a loop, then plays a one-shot "wave" animation when triggered, then returns to idle
- **Scene transitions** — intro plays once, then the scene holds on a looping ambient state
- **Game-style interactivity** — any object whose appearance reacts to user input or data from your app

If your animation always plays the same way from start to finish, a regular Timeline is simpler. Use a State Machine when the animation needs to branch, loop conditionally, or respond to external input.

---

## Switching to State Machine Mode

The toolbar at the top of the canvas has a **mode toggle**:

```
[● Animation]  [○ State Machine]
```

Click **State Machine** to enter the FSM editor. The canvas switches to the **node graph view** — a visual editor where states appear as nodes and transitions appear as arrows. Your existing layers and timelines are unchanged; you are just adding a layer of logic on top of them.

Click **Animation** to return to the standard Timeline view at any time. Both modes share the same canvas and the same layers.

---

## The Node Graph Editor

The node graph is an SVG-based canvas. You can pan by clicking and dragging the background, and zoom with the scroll wheel.

### States

Each **state node** represents one animation clip. It shows the state name and the duration of its linked Timeline.

- **Add a state** — Right-click anywhere on the canvas background and choose **Add State**. A new node appears.
- **Rename a state** — Right-click the node and choose **Rename**, or double-click the node label.
- **Set as entry state** — Right-click the node and choose **Set as Entry**. The entry state plays first when the animation loads. It is marked with a filled arrow indicator on its left edge.
- **Delete a state** — Right-click the node and choose **Delete**.

Each state is backed by a **Timeline** — an independent animation clip that loops or plays once, depending on how you configure it. When a state is active, its Timeline plays. When a transition fires, playback switches to the new state's Timeline.

### Transitions

A **transition** is an arrow from one state to another. It defines when and how the State Machine moves from the source state to the destination state.

- **Create a transition** — Hover over a state node until the connection port appears (a small circle on the edge of the node). Drag from that port to another state node. An arrow appears between them.
- **Select a transition** — Click on the arrow. The **Transition Inspector** opens in the right panel.
- **Delete a transition** — Select it and press Backspace, or right-click the arrow and choose **Delete**.

**Transition appearance:**
- A solid arrow is a triggered transition (fires on an event or a parameter threshold).
- A dashed arrow is a guard-only transition (fires automatically as soon as the guard condition is met, with no explicit trigger needed).

---

## Configuring Transitions

Select a transition to open its inspector. There are three settings:

### Trigger type

| Type | When it fires |
|---|---|
| **SDK auto** | The SDK dispatches the trigger event automatically (e.g., when a timeline finishes) |
| **Manual dispatch** | Your code calls `player.dispatch('eventName')` explicitly |
| **Guard-only** | No trigger needed — fires as soon as the guard condition is true |

### Guard condition

A guard is a parameter-based rule that must be true for the transition to fire. Guards are optional for triggered transitions and required for guard-only transitions.

Examples:
- `speed > 5` — transition fires when the `speed` parameter exceeds 5
- `isJumping == true` — transition fires when the `isJumping` boolean is set to true
- `health <= 0` — transition fires when `health` drops to 0 or below

You build guards using the parameters you define in the **Parameters panel** (see below).

### Transition duration

Set how long the crossfade between states takes (in seconds). A value of `0` switches states instantly.

---

## Parameters Panel

Parameters are named values that drive guard conditions. They live outside of any individual state and can be updated at runtime from your code.

Open the **Parameters panel** from the right sidebar in State Machine mode.

**Parameter types:**

- **Number** — A floating-point value (e.g., `speed`, `health`, `angle`)
- **Boolean** — A true/false flag (e.g., `isJumping`, `isSelected`)

**To add a parameter:**
1. Click **+ Add Parameter** at the top of the Parameters panel.
2. Choose the type (Number or Boolean).
3. Give it a name — this is the name you will use in guard conditions and in your code.
4. Set its default value.

Parameters are read at the time a transition is evaluated. If you update a parameter and a guard condition is satisfied, the transition fires immediately.

---

## Triggering Transitions at Runtime

Once your State Machine is exported, you control it through the **Chorono Web SDK** (or Android SDK). There are two approaches:

### Manual trigger — dispatch an event

Use this when you want explicit control over when a transition fires. The transition must have its trigger type set to **Manual dispatch** and the event name must match.

```javascript
const player = new ChronoPlayer('#canvas', sceneData);
await player.load();
player.play();

// Jump to the 'jump' state by dispatching the 'jump' trigger
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    player.dispatch('jump');
  }
});
```

### Parameter-based — set a parameter value

Use this when a transition should fire automatically based on a value from your app. The transition must have a guard condition referencing the parameter.

```javascript
// Update the 'speed' parameter — any guard watching 'speed' re-evaluates immediately
function onPlayerMove(velocity) {
  player.setParam('speed', velocity.magnitude);
}

// Toggle a boolean parameter
function onPlayerLand() {
  player.setParam('isJumping', false);
}
```

You can combine both approaches. For example, a "run" state might require both a manual trigger and `speed > 5` as a guard, so the transition only fires if the user presses the run button *and* the character is actually moving.

---

## Integration with Parameter Wiring

**Parameter Wiring** (PW) is Chorono's system for binding animated properties to external data sources. State Machines and Parameter Wiring work well together:

- Use the **active state name** from the State Machine as a PW source to drive other visual properties (e.g., change a background color based on which state is active).
- Use PW values as inputs to `setParam()` so your data pipeline drives state transitions automatically.
- For smooth visual blending between states, set a non-zero transition duration and let PW handle interpolating secondary properties (like tint or scale) in parallel.

---

## Scene Explorer

In State Machine mode, the **Scene Explorer** panel lists your states alongside their linked Timeline durations. For example:

```
States
  → idle          2.4 s   [entry]
    walk          1.2 s
    run           0.8 s
    jump          0.6 s   [one-shot]
    fall          loop
```

Click any state in the Scene Explorer to select its node in the graph and open its timeline in the preview strip at the bottom. This lets you scrub through a specific state's animation without leaving the FSM editor.

---

## Export and SDK Compatibility

The State Machine definition is saved as part of the **scene JSON**. No separate export step is needed — when you export the scene, the FSM is included automatically.

The exported JSON contains:

- The list of states and their linked timeline IDs
- All transitions with their trigger types, guard conditions, and durations
- The parameter definitions and default values
- The entry state marker

This format is supported by:

- **Chorono Web SDK** — `ChronoPlayer` handles state evaluation, transition timing, and parameter updates in the browser
- **Chorono Android SDK** — the same scene JSON runs natively on Android with the same API (`dispatch()`, `setParam()`)

If you update the State Machine in Chorono and re-export, the SDK picks up the new logic automatically on the next load — no code changes needed on the integration side, as long as the trigger and parameter names stay the same.

---

## Quick Reference

| Action | How |
|---|---|
| Switch to State Machine mode | Click **State Machine** in the toolbar toggle |
| Add a state | Right-click the canvas background → Add State |
| Create a transition | Drag from a state's port to another state |
| Set entry state | Right-click state → Set as Entry |
| Add a parameter | Parameters panel → + Add Parameter |
| Trigger a transition from code | `player.dispatch('triggerName')` |
| Update a parameter from code | `player.setParam('paramName', value)` |
| Preview a state's timeline | Click the state in Scene Explorer |
