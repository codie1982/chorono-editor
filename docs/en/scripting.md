# Scripting

Chorono has a built-in scripting engine that lets you automate tasks, generate animations programmatically, and build reusable workflows — all in plain JavaScript. There is no custom language to learn: if you know JS, you are ready to script.

---

## Why Script?

The visual editor is great for hand-crafted animations, but scripting unlocks a different class of work:

- **Automate repetitive tasks** — rename 50 layers, reposition a grid of shapes, or set uniform timing across a sequence in seconds rather than minutes.
- **Generate complex animations** — create hundreds of keyframes with mathematical precision that would be impractical to place by hand.
- **Build reusable workflows** — save scripts as macros and replay them on any scene, across any project.
- **Integrate with external data** — feed JSON, CSV, or API responses directly into your scene to create data-driven animations.

---

## Opening the Script Panel

1. Go to **Window → Script Panel**, or press **`** (backtick).
2. The panel slides in from the bottom of the workspace.
3. Type or paste JavaScript in the editor area on the left.
4. Click **Run** (or press **Shift+Enter**) to execute.
5. Output and errors appear in the console area on the right.

The editor supports syntax highlighting, bracket matching, and multi-line editing.

---

## The Scene API

All scripting is done through the global `scene` object. It is always available in the script environment — no imports needed.

### Adding Layers

```javascript
const rect = scene.add('rect', {
  name: 'My Box',
  x: 100,
  y: 100,
  width: 200,
  height: 200
})
```

Supported layer types: `'rect'`, `'ellipse'`, `'text'`, `'image'`, `'group'`, `'spline'`, `'null'`.

The returned object includes the layer's `id`, which you need for subsequent operations.

### Updating Properties

```javascript
scene.update(rect.id, { opacity: 0.5, fill: '#FF0000' })
```

Pass any number of properties in the second argument. Changes are applied immediately and are reflected in the Inspector panel.

### Deleting Layers

```javascript
scene.delete(rect.id)
```

### Querying Layers

```javascript
// Get all layers in the scene
const layers = scene.getLayers()

// Find by name
const bg = layers.find(l => l.name === 'Background')

// Filter by type
const allText = layers.filter(l => l.type === 'text')
```

### Adding Keyframes

```javascript
// Animate x from 0 at t=0 to 500 at t=2s
scene.addKeyframe(rect.id, 'transform.x', { time: 0,    value: 0   })
scene.addKeyframe(rect.id, 'transform.x', { time: 2000, value: 500 })
```

The `time` field is in milliseconds. The `value` can be a number, string (for colors), or array (for multi-component properties like position).

You can also set the easing function per keyframe:

```javascript
scene.addKeyframe(rect.id, 'opacity', {
  time: 1000,
  value: 0,
  easing: 'easeInOutCubic'
})
```

### Working with Timelines

```javascript
// Create a new timeline
const timeline = scene.createTimeline({ duration: 5000, name: 'Intro' })

// Set the active timeline
scene.setActiveTimeline(timeline.id)

// Get current playhead time (ms)
const now = scene.getCurrentTime()
```

---

## Undo / Redo

Every operation you perform through the Scene API is fully undoable. Chorono wraps each call in an undoable command, so **Ctrl+Z** (or **Cmd+Z** on Mac) reverses script actions just like manual edits.

If you want to group multiple operations into a single undo step:

```javascript
scene.beginUndoGroup('My batch operation')

scene.add('rect', { name: 'A', x: 0,   y: 0 })
scene.add('rect', { name: 'B', x: 100, y: 0 })
scene.add('rect', { name: 'C', x: 200, y: 0 })

scene.endUndoGroup()
// Ctrl+Z now removes all three rects at once
```

---

## Event System

Scripts can listen to scene events in real time. This is useful for building reactive tools or for triggering logic when something changes in the editor.

```javascript
// Fire when any layer is added
scene.on('layer:added', (layer) => {
  console.log('New layer:', layer.name)
})

// Fire when a layer's properties change
scene.on('layer:updated', (layer, changes) => {
  console.log('Changed:', changes)
})

// Fire when the selection changes
scene.on('selection:changed', (selectedIds) => {
  console.log('Selected:', selectedIds)
})

// Fire when a layer is deleted
scene.on('layer:deleted', (layerId) => {
  console.log('Deleted layer id:', layerId)
})

// Fire when playback state changes
scene.on('playback:stateChange', (state) => {
  // state is 'playing', 'paused', or 'stopped'
})

// Remove a listener when you no longer need it
const handler = (layer) => console.log(layer.name)
scene.on('layer:added', handler)
scene.off('layer:added', handler)
```

Event listeners registered in the Script Panel persist until you close the panel or reload the scene.

---

## Practical Examples

### Create 10 circles with staggered fade-in

```javascript
for (let i = 0; i < 10; i++) {
  const circle = scene.add('ellipse', {
    name: `Circle ${i + 1}`,
    x: 80 + i * 90,
    y: 300,
    width: 60,
    height: 60,
    fill: `hsl(${i * 36}, 80%, 55%)`
  })

  const delay = i * 150  // stagger by 150ms per circle

  scene.addKeyframe(circle.id, 'opacity', { time: delay,       value: 0 })
  scene.addKeyframe(circle.id, 'opacity', { time: delay + 400, value: 1, easing: 'easeOutQuad' })
}
```

### Batch rename all layers with a prefix

```javascript
const prefix = 'SCENE_01_'

scene.getLayers().forEach(layer => {
  scene.update(layer.id, { name: prefix + layer.name })
})
```

### Auto-distribute layers evenly across the canvas

```javascript
const { width: canvasWidth } = scene.getCanvasSize()
const selected = scene.getSelectedLayers()

if (selected.length < 2) {
  console.log('Select at least 2 layers first.')
} else {
  const step = canvasWidth / (selected.length + 1)

  selected.forEach((layer, i) => {
    scene.update(layer.id, { x: step * (i + 1) })
  })
}
```

### Generate a grid of shapes

```javascript
const cols = 6
const rows = 4
const cellW = 120
const cellH = 120
const startX = 60
const startY = 60

scene.beginUndoGroup('Generate grid')

for (let row = 0; row < rows; row++) {
  for (let col = 0; col < cols; col++) {
    scene.add('rect', {
      name: `Cell_${row}_${col}`,
      x: startX + col * cellW,
      y: startY + row * cellH,
      width: 100,
      height: 100,
      fill: `hsl(${(row * cols + col) * 15}, 70%, 60%)`
    })
  }
}

scene.endUndoGroup()
```

---

## Animation Modifiers via Script

Animation Modifiers let you apply procedural signals on top of keyframed values. You can add and configure them through script for precise control.

```javascript
// Apply a sine wave to a layer's Y position
scene.addModifier(rect.id, 'transform.y', {
  type: 'sine',
  amplitude: 30,    // peak deviation in pixels
  frequency: 0.5,   // cycles per second
  phase: 0          // offset in radians
})

// Apply a pulse (square wave) to opacity
scene.addModifier(rect.id, 'opacity', {
  type: 'pulse',
  low: 0,
  high: 1,
  frequency: 2
})

// Quantize noise for a jittery, frame-by-frame feel
scene.addModifier(rect.id, 'transform.x', {
  type: 'quantizeNoise',
  amplitude: 10,
  frequency: 8,
  steps: 4
})
```

### Physics Modifiers

```javascript
// Spring: overshoots and settles
scene.addModifier(rect.id, 'transform.y', {
  type: 'spring',
  stiffness: 200,
  damping: 12,
  mass: 1
})

// Bounce: simulates gravity + floor bounce
scene.addModifier(rect.id, 'transform.y', {
  type: 'bounce',
  gravity: 980,
  restitution: 0.6   // 0 = no bounce, 1 = perfect bounce
})

// Elastic: snappy overshoot
scene.addModifier(rect.id, 'transform.x', {
  type: 'elastic',
  amplitude: 50,
  period: 0.3
})
```

Remove a modifier:

```javascript
scene.removeModifiers(rect.id, 'transform.y')
```

---

## Running Scripts

**Script Panel** — the primary way to write and run one-off scripts. Open it with the backtick key and click **Run**.

**AI Assistant** — when you use Chorono's built-in AI to make changes to your scene, it uses the same `scene` scripting API internally via `run_script`. You can inspect what the AI ran in the Script Panel's history tab.

**Saved Scripts** — click the **Save** button in the Script Panel to give a script a name. Saved scripts appear in **Window → Scripts** and can be assigned keyboard shortcuts via **Edit → Keyboard Shortcuts**.

---

## Macro Recording

Macro recording lets you capture a sequence of manual editor actions and export them as a reusable script.

1. Open the Script Panel and click **Record**.
2. Perform your actions in the editor: add layers, move things, set keyframes, etc.
3. Click **Stop Recording**.
4. The panel shows the generated JavaScript. Review, edit, and save it.

Recorded macros are fully editable — use them as a starting point for more complex automation.

---

## Console and Debugging

The right half of the Script Panel is the console:

- `console.log()`, `console.warn()`, and `console.error()` all write here.
- Runtime errors are shown with a stack trace and the offending line highlighted in the editor.
- Click **Clear** to reset the console output.
- Use **History** (the clock icon) to recall and re-run previous scripts.
