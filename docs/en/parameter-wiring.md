# Parameter Wiring

Parameter Wiring lets one property **drive** another automatically. Instead of animating each layer independently, you connect properties together so that changing one value ripples through everything wired to it — no manual syncing required.

If you have used rigging in 3D tools like Maya or Cinema 4D, the concept will feel familiar: you are building a control rig for your animation properties.

---

## Why Use Parameter Wiring?

| Scenario | Without Wiring | With Wiring |
|----------|---------------|-------------|
| 5 layers fade out together | Animate opacity on all 5 layers separately | One "Master Opacity" parameter drives all 5 |
| Color theme change | Edit every layer's fill color | One color parameter updates the whole scene |
| Position-linked opacity | Manually keep keyframes in sync | Opacity formula reads from position automatically |
| Looping oscillation | Draw complex easing curves | Wire a phase formula to a parameter slider |

Parameter Wiring is most valuable when you want **one control point** for something that affects many things, or when a property should respond dynamically to another property rather than being set by hand.

---

## How to Wire a Property

### Opening the Wire Modal

Every animatable property in the Inspector has a small **link icon** (🔗) to its right. Click it to open the **Wire Parameter Modal** for that property.

The modal has three sections: **Source**, **Mapping**, and **Preview**.

### Choosing a Source

The **Source** section shows a hierarchical tree of everything that can drive the current property:

- **Scene Parameters** — global sliders and values you define (see below)
- **Layer properties** — any property from any layer in the scene, organized by layer name and then by property

Use the **search box** at the top to filter by name. Click a source item to select it. The source you choose is the input to the mapping formula.

> Example: To drive a layer's opacity from its X position, expand the layer in the source tree, find the **Position X** property, and select it.

### Choosing a Mapping Preset

The **Mapping** section is where you define the formula that converts the source value into the destination value. Chorono ships with 17 preset formulas organized into 6 categories:

#### Clamp
Limits the output value to stay within a minimum and maximum boundary, regardless of how far the source goes.

- **Clamp Min** — output never goes below a floor value
- **Clamp Max** — output never goes above a ceiling value
- **Clamp Range** — combines both: output is pinned between min and max

*Use case:* Drive opacity from a position but ensure it never drops below 10% or exceeds 100%.

#### Remap
Maps one numeric range to another. If the source goes from A to B, the output goes from C to D.

- **Remap Linear** — proportional mapping, straight-line relationship
- **Remap Clamped** — same as Remap Linear, but clamps the output so it never goes outside [C, D]

*Use case:* A horizontal position ranging from 0 to 500 pixels maps to a rotation from 0 to 360 degrees.

#### Range
Scales the source value to fit within a target output range, treating the source's natural min/max as the reference.

- **Range Scale** — scale the source into the output range
- **Range Normalize** — normalize source to 0–1, then scale to output

*Use case:* A parameter slider (0–100) drives a blur amount (0–40px).

#### Curve
Applies a custom easing function to the mapping, so the relationship between input and output follows a Bezier curve rather than a straight line.

- **Curve Ease** — smooth ease-in-out relationship
- **Curve Custom** — opens the curve editor so you draw the exact transfer function

*Use case:* An opacity that starts slow, then snaps quickly to full visibility as the source crosses a threshold.

#### Phase
Controls oscillation and cycling behavior — useful for properties that should pulse or repeat based on a driving value like time or position.

- **Phase Sine** — output oscillates as a sine wave
- **Phase Cosine** — same but offset by 90 degrees
- **Phase Triangle** — linear up-and-down oscillation
- **Phase Square** — binary on/off oscillation

*Use case:* Drive a scale property with a sine wave based on time, making an element pulse rhythmically without any keyframes.

#### Modulo
The output wraps back to zero each time the source crosses a threshold — like an odometer rolling over.

- **Modulo Wrap** — output = source mod N
- **Modulo Ping-Pong** — output counts up to N then counts back down, repeating

*Use case:* A rotation property that loops back to 0 every 360 units of source movement, so an element spins continuously as a slider increases.

---

## Live Preview

Below the Mapping section, the **Preview** area shows the current mapped output value in real time as you adjust formula parameters.

Move the playhead in the Timeline or drag the source property's value to see the output react. Confirm the mapping looks right before clicking **Apply**.

---

## Managing Wires

### The Wiring List Panel

Open the **Wiring List** from the Window menu (or press **W**) to see every active wire in the scene in one place.

Each row shows:
- **Destination** — the layer and property being driven
- **Source** — what is driving it
- **Formula** — the mapping preset name
- **Status** — active (green), disabled (grey), or broken (red)

From this panel you can:
- **Enable / Disable** a wire by toggling the checkbox — useful for temporarily bypassing a connection without deleting it
- **Edit** a wire by clicking the pencil icon, which reopens the Wire Parameter Modal for that connection
- **Delete** a wire by clicking the trash icon

### Wired Track Indicator

In the Timeline, any track that has an active wire shows a 🔗 icon in its track header. This is a quick visual reminder that the property is not free to animate manually — its value is controlled by the wire.

If you add keyframes to a wired property, the keyframe values combine with the wire output (the keyframe is treated as an additive offset unless you configure otherwise).

### Broken Wire Detection

If a wire's source property or source layer is deleted or renamed, Chorono marks the wire as **broken** and displays a red warning indicator in both the Wiring List and the track header.

Click the warning to open the Wire Parameter Modal, where you can pick a new valid source or delete the broken wire.

---

## Scene Parameters

**Scene Parameters** are global values you define yourself — think of them as custom sliders for your scene. They have no intrinsic meaning until you wire them to something.

To create a Scene Parameter:

1. Open the **Scene Parameters** panel (Window menu).
2. Click **+** to add a new parameter.
3. Give it a name (e.g., "Master Opacity"), a type (Number, Color, Boolean), and a range (e.g., 0 to 100).

Once created, the parameter appears at the top of the source tree in every Wire Parameter Modal. Wire multiple properties to the same Scene Parameter and control them all from one slider.

---

## Practical Example: Master Opacity Slider

Here is a step-by-step example of wiring a single slider to control the opacity of 5 layers simultaneously.

**Goal:** Fade 5 background layers in and out together using one control.

**Step 1 — Create the parameter**

1. Open the **Scene Parameters** panel.
2. Click **+**, name it `Master Opacity`, set type to **Number**, range 0 to 100, default value 100.

**Step 2 — Wire the first layer**

1. Select Layer 1 in the scene.
2. In the Inspector, find the **Opacity** property and click its 🔗 icon.
3. In the **Source** picker, expand **Scene Parameters** and select `Master Opacity`.
4. In **Mapping**, choose **Remap Linear** with source range 0–100 and output range 0–100 (a 1:1 mapping for now).
5. Check the **Preview** — moving the slider should change the opacity value displayed.
6. Click **Apply**.

**Step 3 — Wire the remaining layers**

Repeat Step 2 for Layers 2 through 5, selecting the same `Master Opacity` parameter each time.

**Step 4 — Test it**

Open the **Scene Parameters** panel. Drag the `Master Opacity` slider from 100 down to 0. All 5 layers fade together. Drag it back up and they return.

You can now animate the `Master Opacity` parameter in the Timeline — add a keyframe at frame 0 with value 0 and another at frame 30 with value 100, and all 5 layers fade in together with a single two-keyframe track.

---

## Tips and Best Practices

**Name your Scene Parameters clearly.** `Master Opacity` is better than `param1`. You will thank yourself when the scene has 20 wires.

**Use the Wiring List as your control panel.** Before making manual edits to a layer, check the list to see if any of its properties are wired — editing a wired property by hand may feel like it is not working if you forget the wire is active.

**Disable, don't delete, while experimenting.** Toggle a wire off in the Wiring List to compare wired vs. unwired behavior without losing your configuration.

**Layer wires on top of keyframes sparingly.** Wires and keyframes can coexist, but it gets hard to predict the result. For clarity, either use keyframes or a wire on a given track — not both.

**Remap is your workhorse.** When in doubt, start with Remap Linear. It is the most predictable formula and handles the majority of real-world drive-one-thing-from-another needs.
