# Getting Started with Chorono Animator

Welcome to Chorono Animator — a professional, web-based animation tool built for motion designers, developers, and creative teams. Whether you are crafting a short UI micro-interaction or a full broadcast-quality sequence, Chorono gives you the tools to do it in the browser with no installation required.

---

## What Is Chorono Animator?

Chorono Animator is a **web-based, GPU-accelerated animation editor** that runs entirely in your browser. Key highlights:

- **No installation** — open a URL and start animating.
- **GPU-accelerated rendering** — hardware-backed canvas rendering for real-time preview even with complex blur and glow effects.
- **AI-powered authoring** — an integrated AI panel that understands plain-English commands, writes animation scripts, suggests keyframe values, and builds scenes from a description.
- **After Effects-inspired workflow** — layer panel, timeline with keyframes, easing curves, and property tracks that feel familiar to motion designers.
- **Scriptable** — every scene element exposes a JavaScript scripting API for procedural animation and interactivity.
- **Exportable** — render to raster sequences, vector formats, and more from the built-in export dialog.

---

## System Requirements

### Using the Hosted Editor

| Requirement | Minimum |
|---|---|
| Browser | Chrome 110+, Edge 110+, Firefox 115+, Safari 16.4+ |
| WebGL2 | Must be enabled (it is on by default in all modern browsers) |
| RAM | 4 GB (8 GB recommended for video and particle-heavy projects) |
| Display | 1280 x 800 or larger |

> To check if WebGL2 is available in your browser, visit [get.webgl.org](https://get.webgl.org/webgl2/).

### Self-Hosting

If you want to run Chorono on your own server or develop locally:

| Requirement | Version |
|---|---|
| Node.js | 18.17.0 or later |
| Package manager | npm 9+ or pnpm 8+ |

```bash
# Clone and start the development server
git clone <repo-url>
cd chorono-nextjs
npm install
npm run dev
```

The editor will be available at `http://localhost:3000`.

> **Important:** Never run `npm run build` while the development server is running. Stop the server first, build, then restart.

---

## Quick Start: Your First Animation in 5 Minutes

Follow these steps to create a simple bouncing circle animation.

### Step 1 — Open the Editor

Navigate to the Chorono URL in your browser. The editor loads with an empty scene.

### Step 2 — Add a Shape Layer

Click the **Add** button in the Layer Panel (top-left area) and choose **Shape > Circle**. A circle appears at the center of the canvas.

### Step 3 — Set a Starting Keyframe

1. In the **Properties Panel** (right side), find the **Position** field.
2. Move the **playhead** in the Timeline to frame 0.
3. Click the keyframe diamond icon next to Position to record the starting position.

### Step 4 — Animate to a New Position

1. Move the playhead to frame 30 (roughly 0.5 seconds at 60 fps).
2. Drag the circle upward on the canvas — or type a new Y value in the Properties Panel.
3. A keyframe is added automatically.

### Step 5 — Add an Easing Curve

Right-click the second keyframe in the Timeline and choose **Ease In/Out** for a natural bounce feel.

### Step 6 — Preview

Press **Space** to play the animation. The circle moves from its starting position to the new one with easing.

### Step 7 — Export

Click **File > Export**, choose your format (PNG sequence, video, or vector), and click **Render**.

Congratulations — you have created your first Chorono animation.

---

## Interface Overview

The Chorono editor is divided into six main areas:

```
┌──────────────────────────────────────────────────────────────┐
│  Top Toolbar  (tools, alignment, view controls)              │
├──────────┬───────────────────────────────────┬───────────────┤
│  Layer   │                                   │  Properties   │
│  Panel   │           Canvas                  │  Panel        │
│          │                                   │               │
├──────────┴───────────────────────────────────┤               │
│              Timeline Panel                  │               │
├──────────────────────────────────────────────┴───────────────┤
│  AI Panel / Asset Panel (tabbed, bottom or side)             │
└──────────────────────────────────────────────────────────────┘
```

### Canvas

The main working area where you see and interact with your scene. Use the scroll wheel to zoom and the **H** tool (or middle-mouse drag) to pan. The canvas renders in real time using GPU acceleration.

### Layer Panel

Lists every layer in your scene. From here you can:
- Add, delete, and reorder layers.
- Toggle visibility (eye icon), lock a layer (padlock), solo it, or pin it.
- Apply color labels to organize complex projects.
- Expand groups to see child layers.

### Timeline Panel

The horizontal strip at the bottom where time lives. Key concepts:
- **Playhead** — the vertical line representing the current time. Drag it or click anywhere on the ruler to scrub.
- **Tracks** — each animated property of a layer has its own track row.
- **Keyframes** — diamond markers that record a property value at a specific time.
- **Dope Sheet mode** — see all keyframes at once; drag to retime them.

### Properties Panel

Context-sensitive panel on the right. When a layer is selected it shows:
- **Transform** — position, scale, rotation, anchor point.
- **Appearance** — opacity, blend mode, fill, stroke.
- **Effects** — blur, glow, shadow, tint, and more.
- **Layer-type-specific settings** — shape geometry, text styling, video playback, etc.

### AI Panel

Type a plain-English command and the AI will generate or modify the scene for you. Examples:
- "Add a rotating star that fades in over 2 seconds."
- "Make the selected layer bounce three times."
- "Create a loading spinner with three dots."

The AI panel also explains errors and suggests fixes for scripting problems.

### Asset Panel

Manage imported assets — images, videos, audio files, and fonts. Drag an asset from the panel directly onto the canvas to create a layer.

---

## Core Workflow

Most animations in Chorono follow the same five-step rhythm:

1. **Add layer** — use the Add button, right-click on the canvas, or type a command in the AI panel.
2. **Set properties** — adjust position, size, color, and other visual properties in the Properties Panel.
3. **Add keyframes** — move the playhead to a new time, change a property value, and a keyframe is recorded.
4. **Preview** — press **Space** to play back, or scrub the playhead to check individual frames.
5. **Export** — when satisfied, open **File > Export** and render.

Repeat for each layer or animation segment. Complex scenes are just many layers each following this rhythm.

---

## Keyboard Shortcuts

Shortcuts are context-aware: the same key can do different things depending on whether your pointer is over the canvas or the timeline.

### Global (work everywhere)

| Shortcut | Action |
|---|---|
| Space | Play / Pause |
| Cmd/Ctrl + Z | Undo |
| Cmd/Ctrl + Shift + Z | Redo |
| Delete / Backspace | Delete selected layers or keyframes |
| Arrow Left | Step back 1 frame |
| Arrow Right | Step forward 1 frame |
| Shift + Arrow Left | Step back 10 frames |
| Shift + Arrow Right | Step forward 10 frames |
| Cmd/Ctrl + / | Show keyboard shortcuts reference |

### Canvas Tools

| Shortcut | Tool |
|---|---|
| V | Select tool |
| H | Pan tool |
| P | Pen tool (path drawing) |
| G | Move tool |
| R | Rotate tool |
| S | Scale tool |
| A | Anchor point tool |
| B | Box select |
| L | Lasso select |
| O | Circle select |
| W | Paint select |

### Canvas Actions

| Shortcut | Action |
|---|---|
| Cmd/Ctrl + D | Duplicate selected layer(s) |
| Option/Alt + Cmd/Ctrl + D | Clone with animation (live instance) |
| Shift + Cmd/Ctrl + A | Open Array dialog |
| Cmd/Ctrl + C | Copy |
| Cmd/Ctrl + V | Paste |
| Cmd/Ctrl + G | Group selected layers |
| Shift + Cmd/Ctrl + G | Ungroup |
| Alt + A | Align left |
| Alt + D | Align right |
| Alt + W | Align top |
| Alt + S | Align bottom |

### Timeline Context (pointer over timeline)

| Shortcut | Action |
|---|---|
| P | Show Position track for selected layer |
| S | Show Scale track |
| R | Show Rotation track |
| T | Show Opacity track |
| U | Show all animated properties |
| Alt + P | Add/Remove Position keyframe at playhead |
| Alt + S | Add/Remove Scale keyframe |
| Alt + R | Add/Remove Rotation keyframe |
| Alt + T | Add/Remove Opacity keyframe |
| J | Jump to previous keyframe |
| K | Jump to next keyframe |

### Drag Gestures on Canvas

| Gesture | Action |
|---|---|
| Shift + drag | Clone layer (static copy) |
| Alt + drag | Instance clone (live-linked copy) |

---

## Tips for Beginners

**Start with one layer.** It is tempting to add everything at once. Build your first layer, get the animation right, then duplicate or add the next.

**Use the AI panel freely.** If you are not sure how to achieve something, describe it in plain English in the AI panel. It can scaffold a complex animation in seconds that you then refine.

**Press U in the timeline.** With a layer selected, pressing U (with your pointer over the timeline) reveals only the properties that have keyframes — great for staying focused.

**Zoom the timeline.** Scroll horizontally in the timeline to zoom in on a specific time range. Hold Ctrl/Cmd while scrolling to zoom instead of scroll.

**Alt + drag creates a live instance.** If you need multiple copies of an animated element, use Alt + drag to create an instance clone. Changing the original updates all instances automatically.

**Check the Properties Panel tabs.** The Properties Panel has multiple tabs — look for tabs like Transform, Appearance, Effects, and Interact. Many settings are in tabs that are easy to overlook at first.

**Save often.** Chorono auto-saves your work to browser storage, but use **File > Save** regularly and keep a local backup for important projects.

**Learn the easing shortcuts.** Right-click any keyframe to set its easing curve. The **Easy Ease** (default) works for most natural motion. Explore Bezier easing in the curve editor for precise control.
