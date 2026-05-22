# Layers

Every visual and audio element in a Chorono scene is a **layer**. Think of layers as the building blocks of your animation — each one has its own position, timing, appearance, and set of animated properties. Mastering layers is the single most important skill in Chorono.

---

## What Is a Layer?

A layer is a self-contained object in your scene. It has:

- **Geometry** — where it lives on the canvas and how it is shaped.
- **Appearance** — color, opacity, blend mode, effects.
- **Timeline** — when it appears, disappears, and how its properties change over time via keyframes.
- **Hierarchy** — layers can be nested inside groups, creating a parent-child scene graph.

Every layer you see in the Layer Panel corresponds to one row in the Timeline. A scene is essentially a stack of layers rendered from bottom to top.

---

## Layer Types

Chorono supports a rich set of layer types. Choose the right type for what you want to create.

### Shape

Shape layers draw geometric primitives directly on the canvas. They are the fastest way to create illustrations and UI elements without importing assets.

Available shapes:

| Shape | Description |
|---|---|
| **Rect** | Rectangle or square. Adjustable corner roundness. |
| **Circle** | Perfect circle (a constrained ellipse). |
| **Ellipse** | Oval with independent width and height. |
| **Polygon** | Regular polygon from 3 to 12 sides (triangle, pentagon, hex…). |
| **Star** | Multi-pointed star with adjustable inner and outer radius. |
| **Ring** | Hollow circle (donut shape) with adjustable inner radius. |
| **Arc** | A segment of a ring, defined by start and end angles. |
| **Capsule** | Rectangle with fully rounded ends. |
| **Line** | Straight line with stroke styling. |
| **Arrow** | Line with an arrowhead at one or both ends. |
| **Spiral** | Archimedean spiral with adjustable turns and tightness. |
| **Wave** | Horizontal sine wave with adjustable amplitude and frequency. |
| **Blob** | Organic irregular closed shape seeded by a noise function. |

All shape layers support fill (solid or gradient), stroke, trim path, and all standard effects.

### Text

Text layers render styled text. You can animate any text property — position, scale, color, opacity, character spacing, and more. Text layers support:

- Font family, weight, size, line height, letter spacing.
- Fill and stroke (solid color or gradient).
- Multi-line blocks with alignment (left, center, right, justify).
- Per-character animation via the text animator (rigging individual letters).
- **Convert to Spline** — explodes the text into editable bezier outlines.

### Image

Imports a raster image (PNG, JPG, WebP, GIF, SVG) as a layer. Image layers can be transformed, masked, and animated just like any other layer. Use the Asset Panel to import images before adding them.

### Video

Embeds a video file as a layer with its own playback timeline. The video can be trimmed, looped, or synced to the scene playhead. GPU-accelerated decoding keeps performance smooth.

### Audio

Adds an audio track to the scene. Audio layers are visible in the Timeline as a waveform. You can animate volume and use the audio engine for scrubbing feedback during editing.

### Path / PathStroke

A hand-drawn bezier path layer created with the **Pen tool** (P). Unlike shape layers, path layers are fully point-editable: move anchors, adjust handles, and change segment type (line, quadratic, cubic). Useful for custom shapes, motion paths, and calligraphic strokes.

### Spline

Spline layers are the advanced, point-editable path system in Chorono. They are designed for complex illustrations and shape morphing. See the [Spline Layers](#spline-layers) section below for full details.

### Group

Groups contain one or more child layers. Transforming a group transforms all children together. Groups can be nested to create complex hierarchies.

Groups are also the foundation for masking: a group can clip its children to a mask shape drawn inside it.

### Repeater

A Repeater layer clones its child layers a set number of times and distributes them in space. Each copy can be offset in position, rotation, scale, and opacity. Repeaters are ideal for:

- Rows of identical elements (e.g., icons in a grid).
- Radially distributed items (e.g., clock tick marks).
- Staggered reveals where each copy's animation is delayed by a fixed offset.

### Particle Emitter

Spawns a continuous stream of particles (small shape or image layers) with physics-like behavior. Control:

- Emission rate, lifetime, and initial velocity.
- Gravity, drag, and turbulence.
- Size and opacity over the particle's lifetime.
- Color over lifetime (using the gradient editor).

Particle layers are rendered on the GPU for high particle counts without dropping frames.

---

## Adding Layers

There are three ways to add a layer to your scene:

### Add Button

Click the **+** (Add) button at the top of the Layer Panel. A menu appears with all layer types grouped by category. Click a type to add it to the center of the canvas.

### Right-Click Menu

Right-click anywhere on an empty area of the canvas to open the context menu. Choose **Add Layer** and then the layer type. The layer is placed at the position you clicked.

### AI Command

Type a description in the **AI Panel** at the bottom. Examples:

- `"Add a blue rectangle in the top-left corner"`
- `"Create a text layer that says 'Hello' in white, 48px"`
- `"Add a particle emitter with orange sparks"`

The AI creates the layer with sensible defaults based on your description.

---

## Layer Panel Controls

The Layer Panel gives you fine-grained control over each layer without opening any dialog.

### Reordering

Drag a layer row up or down to change its stacking order. Layers at the top of the list are rendered on top. You can also drag a layer onto a group to nest it inside.

### Visibility (Eye Icon)

Click the eye icon to hide a layer. Hidden layers are not rendered but remain in the scene. Useful for decluttering the canvas while working on other elements.

### Lock (Padlock Icon)

Click the padlock to lock a layer. Locked layers cannot be selected on the canvas, preventing accidental moves. You can still adjust them in the Properties Panel by clicking their row in the Layer Panel.

### Solo

Hold Alt and click the eye icon to solo a layer — this hides every other layer, letting you focus on one element. Alt-click again to unsolo.

### Pin

Pinned layers stay visible in the Layer Panel even when you collapse groups or scroll through a long list. Useful for reference layers you return to often.

### Color Labels

Right-click a layer row and choose a color label. Labels are purely organizational — they color the row and the layer's track in the Timeline, making it easy to spot related layers at a glance.

---

## Transform

Every layer has the following transform properties, available in the **Properties Panel** under the Transform section:

| Property | Description |
|---|---|
| **Position (X, Y)** | Location of the layer's anchor point in scene coordinates. |
| **Scale (X, Y)** | Size multiplier. 100 = original size. Can be animated for grow/shrink effects. |
| **Rotation** | Angle in degrees. Positive values rotate clockwise. |
| **Anchor Point** | The pivot for rotation and scale. Defaults to the layer center. Move it to rotate around a corner, for example. |

All transform properties are animatable — click the keyframe diamond icon next to any value to record it at the current time.

**Tip:** Hold Shift while dragging on the canvas to constrain movement to horizontal or vertical.

---

## Appearance

### Opacity

Sets how transparent the layer is. 100% is fully opaque, 0% is invisible. Opacity applies to the entire layer including its effects.

Fill and stroke each have their own independent opacity control inside the Properties Panel, so you can have a semi-transparent fill with a fully opaque stroke.

### Blend Modes

Blend modes control how a layer composites with everything underneath it. Available modes:

| Mode | Effect |
|---|---|
| **Normal** | Standard compositing (default). |
| **Multiply** | Darkens — multiplies colors. Black stays black, white is transparent. |
| **Screen** | Lightens — inverse of Multiply. Black is transparent, white stays white. |
| **Overlay** | Boosts contrast — dark areas darken, light areas lighten. |
| **Darken** | Keeps the darker of the two pixels. |
| **Lighten** | Keeps the lighter of the two pixels. |
| **Color Dodge** | Brightens the layer below based on this layer's brightness. |
| **Color Burn** | Darkens the layer below. |
| **Hard Light** | Like Overlay but based on the top layer. |
| **Soft Light** | Softer version of Hard Light. |
| **Difference** | Subtracts colors — great for psychedelic or glitch effects. |
| **Exclusion** | Similar to Difference but lower contrast. |
| **Hue** | Uses the hue of this layer with the saturation and luminosity of the layer below. |
| **Saturation** | Uses the saturation of this layer. |
| **Color** | Uses hue and saturation of this layer, luminosity from below. |
| **Luminosity** | Uses luminosity of this layer, color from below. |

Blend mode can be set in the Properties Panel or — for groups — applies to the entire group as a unit.

---

## Grouping and Hierarchy

### Creating Groups

Select two or more layers, then press **Cmd/Ctrl + G** (or right-click and choose **Group**). The selected layers become children of a new Group layer.

### Parent-Child Relationships

When a layer is inside a group:
- The group's transform affects all children additively. Rotate the group and all children rotate around the group's anchor point.
- Each child still has its own independent transform on top of the group's.
- Opacity and blend mode set on the group affect the group as a composited unit.

### Scene Graph

Chorono uses a tree-structured **scene graph**. Groups can be nested inside other groups to any depth. The Layer Panel shows this as an expandable tree — click the arrow on a group row to expand or collapse it.

**Tip:** Keep hierarchy shallow when possible. Deep nesting makes the scene harder to reason about and can make selecting specific layers more tedious.

### Ungrouping

Select a group and press **Shift + Cmd/Ctrl + G** to ungroup. The children are promoted to the parent level.

---

## Spline Layers

Spline layers are Chorono's professional vector drawing system, inspired by the workflow of 3D application spline editors. They differ from basic shape layers in that every point on the path is directly editable.

### The Eight Core Primitives

When you add a Spline layer, you choose a starting primitive:

| Primitive | Description |
|---|---|
| **Circle** | Perfect circular spline. Edit points to make organic ovals. |
| **Line** | Straight line segment. Add points and curve handles to shape it. |
| **Rectangle** | Four-point rect. Round corners by dragging corner handles. |
| **Ellipse** | Oval spline with four Bezier control points. |
| **Arc** | An open arc segment. Adjust span by moving endpoints. |
| **Donut** | Two concentric closed paths (ring shape) that can be morphed. |
| **N-gon** | Regular polygon with N sides. Edit N in the Properties Panel. |
| **Star** | Star shape with separate inner and outer point editing. |

All primitives are fully editable after creation — nothing is locked.

### Point Editing

To enter point-edit mode on a Spline layer, double-click it on the canvas (or select it and press **P** to activate the Pen tool). In point-edit mode:

- **Click a point** to select it.
- **Drag a point** to move it.
- **Drag a handle** (the lines extending from a point) to adjust curvature.
- **Click a segment** to add a new point at that position.
- **Delete a selected point** to remove it (the path reconnects around the gap).

Each point has a type that controls how its handles behave:

| Point Type | Handle Behavior |
|---|---|
| **Corner** | No handles — sharp angle. |
| **Smooth** | Handles are collinear but can have independent lengths. |
| **Bezier** | Handles are collinear and equal length (mirrored). |
| **Bezier Corner** | Handles are fully independent on each side. |

Switch point types in the **Spline Point Inspector** that appears when a point is selected.

### Combining Sub-Shapes

A single Spline layer can hold multiple sub-shapes (contours). Each sub-shape can have a **Combine Mode**:

- **Add** — normal union (default).
- **Subtract** — cuts a hole in the layers below it within the same spline.
- **Intersect** — only the overlap is visible.
- **Exclude** — XOR (shows non-overlapping areas).

This lets you create complex compound shapes — like a letter O with a hole — in a single layer.

### Text-to-Spline Conversion

Select a Text layer and click **Convert to Spline** in the Properties Panel. Each character becomes an editable spline sub-shape. This is useful for:

- Custom lettering and logo design.
- Animating individual letter outlines.
- Trimming a stroke along text paths.

---

## Clone and Array System

Chorono has two complementary systems for creating multiple copies of a layer with minimal manual work.

### Clone Tool (Live Instances)

A **clone** is a live instance of another layer. It shares the original's shape and style — change the original and all clones update instantly.

**To create a clone:**
- Press **Option/Alt + Cmd/Ctrl + D** (Clone Quick shortcut).
- Or hold **Alt** while dragging a layer on the canvas.

Clones appear in the Layer Panel with a link icon indicating they are instances. You can move, rotate, and scale each clone independently. However, shape, color, and effect changes made to the original propagate to all its clones.

**Use case:** A set of decorative snowflakes where you want to tweak the snowflake design after placing all of them.

### Array Patterns

The **Array** system creates multiple copies of selected layers arranged in a pattern. Open the Array dialog with **Shift + Cmd/Ctrl + A** or via **Layer > Array**.

Available array types:

| Type | Description |
|---|---|
| **Linear** | Copies in a straight line with a fixed spacing offset. |
| **Grid** | Copies arranged in rows and columns with X and Y spacing. |
| **Radial** | Copies distributed evenly around a center point. |
| **Path** | Copies placed along a bezier path layer. |
| **Repeater** | Uses a Repeater layer (configured inside the layer itself). |

**Array options:**
- **Count** — number of copies.
- **Offset** — position, rotation, and scale delta applied cumulatively to each copy.
- **Stagger** — delays the start of each copy's animation by a fixed time offset, creating cascade effects.

**Use case example (Radial):** Eight clock tick marks evenly placed around a circle — set Count to 8, Center to the clock center, and the ticks are placed automatically.

---

## Smart Selection

When you have many layers on the canvas, selecting the right ones quickly is essential. Chorono provides four canvas selection tools plus modifiers for filtering.

### Selection Tools

Activate these tools from the Top Toolbar or with their keyboard shortcuts:

| Tool | Shortcut | How it works |
|---|---|---|
| **Box Select** | B | Drag a rectangle. Layers within the box are selected. |
| **Lasso Select** | L | Draw a freehand closed shape. Layers inside are selected. |
| **Circle Select** | O | Drag to define a circle. Layers within the circle are selected. |
| **Paint Select** | W | Click and drag like a brush. Layers you paint over are added to the selection. |

### Inside vs. Touching

At the top of the canvas when a selection tool is active, you will see a toggle:

- **Inside** — only selects layers whose entire bounding box fits within the selection shape. Useful when you want to avoid accidentally grabbing large background layers.
- **Touching** — selects any layer whose bounding box overlaps the selection shape at all.

### Select Similar

Right-click a layer on the canvas or in the Layer Panel and choose **Select Similar** to select all layers of the same type (e.g., all Text layers, all Circle shapes). Useful for batch property changes.

### Select by Transform

Also in the right-click menu: **Select by Transform** lets you select all layers that share a similar transform property — for example, all layers at the same X position, or all layers with the same scale. This is helpful when aligning or distributing a group of elements you did not originally organize into a group.

### Adding and Removing from Selection

- Hold **Shift** and click a layer to add it to the current selection.
- Hold **Shift** and click a selected layer to deselect it.
- Click on an empty area of the canvas to deselect everything.

---

## Practical Examples

**Creating a progress bar:** Add a Rect layer for the track, then a second Rect for the fill. Animate the fill's **Scale X** from 0 to 1 between two keyframes. Set the anchor point to the left edge so it grows from left to right.

**Making a radial menu:** Add an icon layer, then use **Array > Radial** with Count 6 to place six copies evenly around a center point. Apply a stagger to have them appear one after another.

**Custom logo outline:** Add a Text layer, type your logo text, then click **Convert to Spline** in the Properties Panel. Switch to point-edit mode and adjust individual letter curves. Animate the stroke **Trim Path** from 0% to 100% for a handwriting reveal effect.

**Masking a video:** Place a video layer inside a Group. Draw a shape layer inside the same group and enable **Use as Mask** in its Properties Panel. The video is now clipped to the shape's outline.
