# Timeline

The Timeline is where you give your animation its shape over time. Every property change you want to animate lives here as a keyframe, and the Timeline gives you the tools to arrange, adjust, and fine-tune them with precision.

---

## The Basics

### Tracks

Each layer in your scene appears in the Timeline as one or more **tracks**. A track corresponds to a single animatable property — position, opacity, rotation, and so on. Click the disclosure arrow on a layer row to expand it and see all its tracks.

**Track types:**
- **Position** — X and Y coordinates (or X/Y/Z in 3D modes)
- **Scale** — uniform or non-uniform scaling
- **Rotation** — angle in degrees
- **Opacity** — transparency from 0 (invisible) to 100 (fully opaque)
- **Color** — fill or stroke color values
- **Custom properties** — any property defined by a plugin or script

### Keyframes

A keyframe stores the value of a property at a specific point in time. The Timeline draws a line between any two keyframes and interpolates the property smoothly between them.

Keyframes appear as diamond-shaped markers on the track row. Selected keyframes turn yellow.

### The Playhead

The vertical red line is the **playhead**. It marks the current time. All property values shown in the inspector reflect the values at the playhead position.

Drag the playhead to scrub through your animation, or click anywhere on the ruler to jump to that time.

### Work Area

The **work area** (shown as a lighter region on the ruler) defines the portion of the timeline used for playback and rendering. Setting a precise work area lets you preview or export just the section you are working on without touching the full timeline.

---

## Adding Keyframes

There are two quick ways to add a keyframe:

1. **Diamond icon** — In the Inspector panel, each animatable property has a small diamond icon to its left. Click it to set a keyframe at the current playhead position for that property.
2. **Right-click a track** — Right-click anywhere on a track row in the Timeline and choose **Add Keyframe at Playhead** from the context menu.

Once a property has at least one keyframe, Chorono records a new keyframe automatically whenever you change that property's value (as long as **Auto-Keyframe** is enabled in the toolbar).

> Tip: Move the playhead to the moment you want, change the value in the Inspector, and a keyframe appears. That is the fastest animation workflow for most tasks.

---

## Editing Keyframes

### Selecting Keyframes

- **Click** a single keyframe to select it.
- **Shift+click** to add or remove keyframes from the selection.
- **Drag** on an empty area of the track to draw a selection rectangle (rubber-band select).
- **Shift+drag on the ruler** to select all keyframes within a time range across all visible tracks.

### Moving Keyframes

Drag selected keyframes left or right along the track. Hold **Shift** while dragging to snap to whole frames.

To move keyframes by an exact number of frames, select them and use the **Time Offset** field in the keyframe inspector at the bottom of the panel.

### Copying and Pasting Keyframes

Select one or more keyframes, then **Cmd+C** (Mac) / **Ctrl+C** (Windows) to copy. Move the playhead to the destination time and press **Cmd+V** / **Ctrl+V** to paste. Pasted keyframes land at the playhead position, preserving their relative timing if you copied multiple keyframes.

### Deleting Keyframes

Select keyframes and press **Backspace** or **Delete**.

### Staggering Keyframes

**Stagger** lets you offset a group of keyframes so they start at slightly different times — useful for making a set of layers animate in sequence rather than all at once.

1. Select keyframes across multiple layers (rubber-band or Shift+click).
2. Right-click and choose **Stagger**.
3. Enter the **offset** in frames. Each successive layer's keyframes will be delayed by that amount.

For example, staggering 5 layers with an offset of 3 frames means layer 1 starts at frame 0, layer 2 at frame 3, layer 3 at frame 6, and so on.

---

## Easing Curves

The curve between two keyframes controls how the property value changes over time. A flat section means slow change; a steep section means fast change.

### Built-in Presets

Select one or more keyframes and choose an easing preset from the right-click context menu or the easing dropdown in the keyframe inspector:

| Preset | Feel |
|--------|------|
| **Linear** | Constant rate of change — mechanical, no acceleration |
| **Ease In** | Starts slow, ends fast — like a ball rolling downhill |
| **Ease Out** | Starts fast, ends slow — like a ball rolling to a stop |
| **Ease In-Out** | Slow start, fast middle, slow end — natural and polished |
| **Hold** | The value snaps instantly at the destination keyframe — no interpolation |

### Custom Curve Editor

For full control, double-click a keyframe or select it and press **E** to open the **Curve Editor**.

The Curve Editor shows a Bezier graph. Drag the control handles on either side of a keyframe point to reshape the curve:

- Pull a handle closer to horizontal to make the motion decelerate near that keyframe.
- Pull a handle more vertical to make the motion accelerate.
- Hold **Alt** and drag one handle to break the symmetry and control the in-curve and out-curve independently.

You can edit multiple tracks simultaneously — use the track list on the left side of the Curve Editor to toggle which tracks are visible.

---

## Out-of-Range Modes

Out-of-range modes control what happens to a property's value **before the first keyframe** or **after the last keyframe**. Set the mode per-track by right-clicking the track header.

### Constant (default)

The property holds the value of the nearest keyframe indefinitely. Before the first keyframe it equals the first keyframe's value; after the last keyframe it equals the last keyframe's value.

*Visual:* Flat horizontal lines extending outward on both sides.

### Cycle

The keyframe sequence repeats from the beginning each time it ends, jumping back instantly to the starting value.

*Visual:* The animation curve repeats in identical blocks, with a sharp jump at each repeat boundary.

### Loop

Similar to Cycle, but the value at the end of one repetition connects to the value at the start of the next without a jump (the first and last keyframe values must match, or Chorono blends them).

*Visual:* A smoothly repeating wave with no visible seam.

### Ping-Pong

The animation plays forward, then reverses, then plays forward again — bouncing back and forth indefinitely.

*Visual:* A zigzag pattern on the curve graph.

### Linear

Extrapolates the curve beyond the last keyframe in a straight line, continuing the velocity from the nearest keyframe pair.

*Visual:* The curve continues as a straight diagonal line past the keyframe boundary — useful for properties that should keep moving at a constant rate.

---

## Timeline Tools

### Slide by Frame

Use the **◀F** and **F▶** buttons in the Timeline toolbar to step the playhead one frame backward or forward. Keyboard shortcuts: **Left Arrow** and **Right Arrow** (when the Timeline panel has focus).

Hold down the key for continuous stepping.

### Range Selection

To select all keyframes within a specific time range:

1. Hold **Shift** and drag along the ruler.
2. Chorono highlights the selected time range.
3. All keyframes of all visible tracks within that range become selected.

This is the fastest way to move a section of animation — select the range, then drag.

### Scale Handles

When two or more keyframes are selected, **scale handles** appear at the left and right edges of the selection bounding box.

Drag a scale handle inward or outward to compress or expand the timing of the entire selection proportionally. The keyframes at the anchor edge stay fixed; everything else scales relative to them.

Hold **Alt** while dragging to scale from the center of the selection.

---

## Work Area

The work area defines the playback and render region. By default it spans the full timeline, but you can narrow it to any range.

- Press **[** to set the work area **In** point to the current playhead position.
- Press **]** to set the work area **Out** point to the current playhead position.
- Drag the left or right bracket handle on the ruler to adjust the boundaries manually.

When you export or render, Chorono uses the work area start and end times as the export range unless you override them in the export dialog.

> Tip: Set your work area tightly around the section you are polishing and use **Spacebar** to loop-play just that range. You will notice timing issues faster with a tight loop.

---

## Markers

Markers are named flags you place on the ruler to label important moments — a beat, a scene cut, the start of a logo reveal.

### Adding Markers

- **Cmd+click** (Mac) / **Ctrl+click** (Windows) anywhere on the ruler to add a marker at that time.
- Markers appear as colored triangles on the ruler.

### Moving Markers

Drag a marker left or right along the ruler.

### Renaming, Recoloring, and Deleting Markers

Right-click any marker to open its context menu:
- **Rename** — give the marker a descriptive label
- **Color** — pick a color to group related markers visually
- **Delete** — remove the marker

### Jumping Between Markers

Press **[** to jump the playhead to the **previous** marker and **]** to jump to the **next** marker.

> Note: When no work area is set and no markers are present, [ and ] set the work area boundaries. If markers exist, they take priority and [ / ] navigate between them instead.

---

## Keyframe Spreadsheet

The **Keyframe Spreadsheet** (accessible from the Window menu or by pressing **K**) displays all keyframes for the selected layer in a table. Each row shows:

| Column | Description |
|--------|-------------|
| Track | Property name |
| Time | Frame number or timecode |
| Value | Raw numeric or color value |
| Easing | The easing preset applied |

You can click any cell to edit it directly. Changing the **Time** column moves the keyframe; changing **Value** updates what the property does at that moment; changing **Easing** updates the interpolation.

The spreadsheet is especially useful for setting precise numeric values that are hard to achieve by dragging — for example, exactly 45.0 degrees of rotation at frame 24.

---

## Multi-Layer Operations

### Bulk Select and Move

1. Click a layer name in the layer list to select it, then **Shift+click** additional layers.
2. All selected layers' tracks expand together.
3. Rubber-band select keyframes across all of them.
4. Drag to move the entire group simultaneously.

### Stagger Animation

To make a set of layers animate in sequence with a consistent delay between each one:

1. Select the keyframes on all relevant layers.
2. Right-click and choose **Stagger**.
3. Set the offset (e.g., 4 frames).

The first layer's keyframes stay in place. Each subsequent layer's keyframes shift later by the offset amount. A 5-layer stagger at 4 frames produces a cascading effect that spans 16 extra frames total.

This technique is commonly used for list items flying in, text characters appearing one by one, or icon sets animating into view.
