# Chorono Animator — Timeline Wireframe Brief

> **Copy-paste prompt for Claude Design / AI design tool.**
> Self-contained: includes context, style system, current state, target spec, primitives reference, and output constraints. **Do not skip the embedded code blocks** — they are the design contract.

---

## 1 · Context

Chorono Animator is a cross-platform animation builder (Next.js editor → JSON → C++ runtime on Android/iOS/WASM). The Editor is a desktop-first tool, modeled after Adobe After Effects' timeline, Figma's interaction (snap, multi-select), and Lottie/Rive's keyframe simplicity.

You are working in a **low-detail wireframe system** — gray scale only, structural skeleton, no production colors. Annotations and "feel" rather than pixel-perfect output. Existing wireframes use React + JSX with custom primitives, rendered through Babel-standalone.

### What needs to be redesigned

**ONLY the Timeline panel** (the bottom-of-editor area). Top bar, toolbar, layer panel (left), canvas (center), and properties panel (right) stay as-is. The current timeline is one-track-deep and lacks 30+ features a real animation tool needs.

---

## 2 · Style System (must follow — do not invent colors)

```css
:root {
  /* gray scale */
  --w-white: #ffffff;
  --w-bg: #fafafa;
  --w-fill-1: #f4f4f4;
  --w-fill-2: #ececec;
  --w-fill-3: #e0e0e0;
  --w-fill-4: #d4d4d4;
  --w-fill-5: #b8b8b8;
  --w-fill-6: #888888;
  --w-fill-7: #555555;
  --w-fill-8: #2a2a2a;

  --w-border: #d4d4d4;
  --w-border-strong: #9b9b9b;
  --w-border-dashed: #b0b0b0;

  --w-text: #1a1a1a;
  --w-text-2: #555;
  --w-text-3: #888;
  --w-text-4: #b0b0b0;

  --w-accent: #2a2a2a;  /* near-black "primary" */

  --w-font: "Inter", system-ui, sans-serif;
  --w-mono: "JetBrains Mono", Menlo, monospace;
}
```

**Rules:**
- Backgrounds: `--w-white` (panel) or `--w-bg` (chrome) or `--w-fill-1/2` (subtle fills)
- Borders: `--w-border` (default), `--w-border-strong` (emphasis), `--w-border-dashed` (annotation)
- Mono font for: time readouts, frame numbers, tick labels, IDs, code, badges
- Inter for: layer names, button labels, headings, body text
- Only one "accent" color: `--w-fill-8` (near-black) for selected / active states
- **Never use real product colors** (blue, orange, etc.) — wireframe is intentionally desaturated

---

## 3 · Available Primitives (use these — do not roll new ones)

These exist in `wireframe-primitives.jsx`. Reference signature:

```jsx
<Box style={{}} dashed fill={1|2|3} className="">…</Box>
<Bar w="100%" h={8} dk />                          // ghost text bar
<Img w={120} h={80} label="ASSET" />               // diagonal-striped placeholder
<Icon label="✎" size="lg|xl" />                    // 16/28/40 gray icon box
<Btn variant="primary|ghost" size="sm|lg" full>…</Btn>
<Badge solid>SHAPE</Badge>                          // mono uppercase pill
<Lbl style={{}}>UPPERCASE LABEL</Lbl>              // 9px mono uppercase
<Mono>00:01.280</Mono>                              // 11px mono
<Input value="…" size="sm" focus suffix="px" />
<Rule />                                            // 1px gray hr
<KF variant="dk|ring" />                            // 9px keyframe diamond
```

CSS utility classes available:
```
.w-spread  → flex space-between
.w-row     → flex row, gap 12
.w-col     → flex column
.w-anno    → yellow sticky-note annotation
```

**Add these new primitives** as part of this brief (define them inside your output file, or note that they should be added to `wireframe-primitives.jsx`):

```jsx
<Marker type="note|beat|scene|export|warning" label="intro" />
<WaveformBar peaks={[…]} h={52} />                  // SVG polyline of audio peaks
<GraphLine d="M 0 50 C…" emphasized />              // SVG value-graph polyline
<TrimHandle side="start|end" />                     // 8w drag handle
<SnapLine ms="76" />                                // yellow vertical line + badge
<ContextMenu items={[…]} />                         // right-click menu
<Tooltip>frame 76</Tooltip>                         // mono tooltip pill
<Popover>…</Popover>                                // generic overlay
```

---

## 4 · Current State (what exists now — to be replaced)

The current Timeline is in `screens-editor.jsx` as `TimelineFooter` + `KeyframeTracks` + `GraphTracks`. Here is the relevant excerpt — **this is what you are replacing**:

```jsx
const TimelineFooter = ({ graph = false }) => (
  <div style={{ height: 240, borderTop: "2px solid var(--w-border-strong)",
                background: "var(--w-bg)", display: "flex", flexDirection: "column" }}>
    {/* toolbar — 36h */}
    <div style={{ height: 36, padding: "0 14px", display: "flex", gap: 14 }}>
      {/* play/pause buttons, time readout, Loop/Pingpong/Auto-key, Graph toggle */}
      {/* Right side: Snap, Speed, +Marker, +Timeline */}
    </div>
    {/* ruler — 22h */}
    <div style={{ height: 22, paddingLeft: 200 }}>
      {/* tick labels every 500ms, work-area shading, playhead */}
    </div>
    {/* tracks — flex */}
    {graph ? <GraphTracks /> : <KeyframeTracks />}
  </div>
);

const KeyframeTracks = () => {
  const rows = [
    { t: "▾ Background", indent: 0, color: "var(--w-fill-4)", kfs: [] },
    { t: "  opacity",    indent: 1, color: null,             kfs: [10, 92] },
    { t: "▾ Logo Group", indent: 0, color: "var(--w-fill-5)", kfs: [], bar: [10, 90] },
    { t: "  transform.x", indent: 1, color: null,            kfs: [22, 60, 80] },
    // …
  ];
  // Each row: 200w label column | flex track area with <KF /> diamonds positioned by %
};
```

**Problems:**
- Single timeline only (no tab navigation between multiple timelines)
- Markers don't exist on the ruler
- Work area shading is static — no drag handles
- Layer activity bars (`bar: [10, 90]`) are shown but no trim handles
- No snap indicator during drag
- No multi-select visual (orange highlight)
- No lasso selection rectangle
- No audio waveform track variant
- No keyframe state variants (selected, dragging, hold, custom-bezier)
- No drag preview / ghost
- No right-click context menus
- No empty/loading/error states
- No resize handle for panel height
- No solo/lock/hide buttons per layer in the timeline left column
- No color label per layer
- No keyframe Inspector (it currently lives in properties panel only — not timeline)
- Graph mode shows only one track, not the multi-track per-property graph
- No frame counter (only time)
- No snap settings popover
- No playback speed selector
- No auto-key recording indicator

---

## 5 · Target Design Specification

Replace the current TimelineFooter with a new component that has the following structure and elements. **All sizes in CSS px.**

### 5.1 Panel container

```
height: dynamic (default 280, range 120-560)
border-top: 2px solid var(--w-border-strong)
background: var(--w-bg)
position: relative — for absolute overlays (snap line, context menus, popovers)

Top edge: 4h drag handle (cursor: row-resize)
  → on hover: subtle background change (var(--w-fill-3))
  → annotate: "Drag to resize"
```

### 5.2 Top Bar — 44h, three regions

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ LEFT: playback                CENTER: timeline tabs              RIGHT: settings
│
│ [⏮][◀][▶/⏸][▶▶][⏭]  00:01.280 / 00:03.200  frame 76 / 192  Speed 1× ▾
│                                                                                │
│ |  [intro •][hover][exit] [+ Timeline]                                         │
│                                                                                │
│ |  Snap ◉ ▾  ⬦ AutoKey  ▦ Graph    |  − 1.5× +  Fit                            │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Detail:**
- **Playback buttons**: 26×26 each, `<Box>` with monospace icon. Play/pause is the active one (background `--w-fill-2`).
- **Time readout**: mono 12px, format `mm:ss.fff / mm:ss.fff`. The "now" part bold, the "total" part `--w-text-3`.
- **Frame counter**: mono 10px, secondary color. Toggleable display next to time.
- **Speed selector**: small dropdown chip — values 0.25× / 0.5× / 1× / 1.5× / 2×. Default 1×.
- **Timeline tabs**: horizontal list of timeline pills. Each pill = `<Box>` with name + ⋮ menu trigger. Active pill is filled `--w-fill-3`. `+ Timeline` ghost button at end. Show 3 tabs in the wireframe.
- **Snap toggle + popover trigger**: magnet icon with ▾. Show the popover content separately (4 checkboxes: Frame / Key / Marker / Grid). Sketch the popover **once** in an annotated callout.
- **Auto-key toggle**: `⬦ AutoKey` chip. When active, add a small red dot indicator (use `--w-fill-7` since no real colors).
- **Graph mode toggle**: `▦ Graph` chip. When active, filled `--w-fill-3`.
- **Zoom group**: `− 1.5× + Fit` — 4 small mono buttons. Mono text 10px.

Annotate (sticky note): "Selected timeline settings appear in the top-bar's far right when there's space"

### 5.3 Ruler — 26h

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  LEFT COL                  │   RULER (flex)                                    │
│  (260w empty/title)        │                                                   │
│                            │ |0   250  500  750  1000  1250  1500  1750  2000 │
│                            │     ▒▒▒▒▒[████ work area ████]▒▒▒▒▒              │
│                            │     🚩intro           🚩climax  🚩warn            │
│                            │                  ▼ playhead diamond               │
└────────────────────────────┴──────────────────────────────────────────────────┘
```

**Detail:**
- **Tick labels**: mono 9px every major tick (adaptive — show one every ~80px). Major ticks 1px tall lines, minor ticks 4px shorter dashes.
- **Work area shading**: between `workAreaInMs` and `workAreaOutMs` add a `rgba(0,0,0,0.05)` rect across full track-area height. At each end draw **8w drag handles** (downward triangles above the ruler):
  ```
       ▼              ▼
  ─────╫══════════════╫─────  ← work area boundaries
  ```
- **Markers**: small flag glyph (🚩 placeholder, real version should be an SVG flag shape ~10×14). Each marker has:
  - Flag color = type indicator (5 grays: light → dark for note/beat/scene/export/warning — in this wireframe just use 5 `--w-fill-N` shades)
  - Label below flag (mono 9px, truncate)
  - On hover: tooltip with full label + time
  - Show 3 markers spread across ruler
- **Playhead**:
  - 1px vertical line spanning ruler + entire track area (use `position:absolute, bottom:0` extending down)
  - 12×12 diamond on top (rotated `<Box>`)
  - Color `--w-fill-8`
  - Annotation: "Drag anywhere on ruler to scrub"

### 5.4 Track Area — flex, two modes

The track area has a **fixed-width left column (260w)** and a **scrollable horizontal flex region** for tracks.

#### 5.4.1 Left column (260w)

```
┌────────────────────────────────┐
│ [+ Add animation ▾]            │  ← property picker dropdown
│ [✨ Apply preset ▾]            │  ← preset picker dropdown
│ ────────────────────────────── │
│ ▾ Logo Group       ● 🔒 S  ⋮  │  ← layer header (32h, color-label dot at left edge)
│   ◆ opacity            ⊗      │  ← property track (28h)
│   ◆ transform.x        ⊗      │
│   ◆ transform.y        ⊗      │
│ ▾ Background       ● 🔒 S  ⋮  │
│   ◆ opacity            ⊗      │
│ ▸ Glow Circle      ● 🔒 S  ⋮  │  ← collapsed group (▸ instead of ▾)
│ ▾ Soundtrack       ● 🔒    ⋮  │  ← audio layer (no S — audio always one channel)
│   ◆ volume             ⊗      │
└────────────────────────────────┘
```

**Detail per row:**
- **Layer header (32h)**:
  - Left edge: 3w solid color-label band (use 4 different `--w-fill-N` swatches for variety)
  - Expand triangle (▾/▸) — 8px mono
  - Layer type icon — `<Icon>` 16×16
  - Layer name — Inter 12, ellipsis
  - Right side: 3 inline toggle icons (●=visible, 🔒=lock, S=solo). Solo when active uses `--w-fill-7` text.
  - Far right: ⋮ kebab (right-click also opens menu)
- **Property track (28h)**:
  - Left indent 28px (visually nested under layer)
  - `◆` add-keyframe button — yellow-ish (use `--w-fill-6`)
  - Property name — mono 10px, truncate
  - `⊗` remove-track button — visible on row hover only
- **Picker dropdowns** (at top):
  - Both are 28h selects (`<Input size="sm">` styled with ▾ arrow)
  - Apply preset uses a different border treatment to look "magical" — `--w-border-dashed`

**State variants to draw (annotate as separate small thumbnails on the side):**
- Layer row: default · hover · selected (background `--w-fill-2` + 2.5px left border `--w-fill-7`) · multi-selected (background `--w-fill-1` + dashed border)
- Property row: default · hover (⊗ appears)
- Lock active: 🔒 stays filled even when row is unhovered
- Hidden: row opacity 0.45
- Solo active: row keeps emphasis even when other rows are dimmed

#### 5.4.2 Right region — Mode A: Dope Sheet

Each layer occupies one **layer-header bar row (32h)** + N **property track rows (28h)**.

**Layer header bar (32h):**
```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│      ║════════[ Logo Group ]════════║                           │
│      ↑                              ↑                           │
│  trim start                    trim end                         │
└────────────────────────────────────────────────────────────────┘
```
- A horizontal `<Box>` spanning from `startMs` to `endMs` (use percentages relative to total duration)
- Background fill = layer's color label color at 35% opacity
- Inside: layer name (Inter 9px white-ish, truncate)
- **Left trim handle (8w × 32h)**: `<TrimHandle side="start">` — visible on hover or when selected. Use a vertical 2-line glyph pattern.
- **Right trim handle (8w × 32h)**: `<TrimHandle side="end">`
- Center drag (between handles): grabbing cursor, moves whole bar
- **Selected state**: 1.5px outer border `--w-fill-7`

**Property track row (28h):**
```
┌────────────────────────────────────────────────────────────────┐
│ ░░░░░░░ value graph polyline behind ░░░░░░░░░░░░░░░░░░░░       │
│           ◆────────────◆──────────◆                            │
└────────────────────────────────────────────────────────────────┘
```
- Background: 10% blue-ish overlay (use `--w-fill-1`)
- **Value graph polyline** (SVG): `<GraphLine d="…" />` showing interpolated value over time, drawn at 40% opacity behind keyframes
- **Keyframes (`<KF />`)**:
  - Default: `<KF />` — gray diamond
  - Selected: `<KF variant="dk" />` — darker diamond + 1.5× scale ring
  - Hold easing: 9×9 square (not rotated) — add a new variant `<KF variant="hold" />` as a `<Box>`
  - CustomBezier: double ring `<KF variant="bezier" />` — diamond inside circle
  - Drag preview: ghost diamond at original position + solid at current position with horizontal arrow between

**Show in wireframe:**
- 3 layers with varying complexity
- 2-3 keyframes per property track
- One layer in "dragging" state with snap line visible
- One keyframe in "selected" state (darker + Inspector annotation arrow)
- One track row with the value graph polyline visible

#### 5.4.3 Right region — Mode B: Graph Editor

Toggle activated by `▦ Graph` in top bar. **Show as a separate full timeline mockup** (don't try to overlay both modes in one).

```
┌────────────────────────────────────────────────────────────────┐
│ value=100├───────────────────────────────────────────────────  │
│          │              ╱────╲                                 │
│ value= 50├─────────────╱──────╲────◆──────                     │
│          │            ╱        ╲                               │
│ value=  0├─────◆─────────────────╲──────────────────◆          │
│          └───────────────────────────────────────────          │
│              250    500    750   1000   1250   1500            │
└────────────────────────────────────────────────────────────────┘
```

- Each property track is **72h** tall (vs 28h in dope mode)
- Y axis: track's value range, normalized to row height
- Min/max value labels in left column (mono 9px)
- Polyline drawn at full opacity, 1.5px stroke `--w-fill-7`
- Keyframes positioned by **X (time) and Y (value)**
- **Bezier tangent handles** (rezerv): each kf has two small circles connected by dashed lines — sketch on 1-2 kfs to show the concept
- Non-numeric tracks (boolean, string): show as step bars instead of polyline

Show 2 tracks in graph mode — one number (opacity) and one rotation.

#### 5.4.4 Right region — Audio Track Variant

Audio layer has a unique track row:

```
┌────────────────────────────────────────────────────────────────┐
│  ▁▂▃▅▇▆▅▃▂▁▂▃▅▇▆▅▃▂▁ ▁▂▃▅▇▆▅▃▂▁  ← waveform (52h)             │
│         ◆──────────◆─────◆     ← volume keyframes              │
└────────────────────────────────────────────────────────────────┘
```

- Height 52h (taller than property tracks)
- Background: `<WaveformBar peaks={…} h={52} />` — SVG polyline showing audio peaks
- Volume keyframes superimposed on top
- Muted state: waveform at 30% opacity + a small 🔇 badge in upper-left

### 5.5 Snap Indicator (during drag)

When user drags a keyframe and it snaps to a target:

- **Vertical 1px line** spanning full track area
- Color `--w-fill-7`
- Top of line: small label badge — mono 9px on `--w-fill-2` background
  ```
  ┌─────────────────┐
  │ snapped to frame 76 │
  └────┬────────────────┘
       │
       │  (1px line down to bottom)
       │
       │
  ```
- Show this in the "dragging" state mockup

### 5.6 Lasso Selection

User drags from empty space in track area:
- Dashed rectangle, `--w-border-dashed` 1.5px
- Fill `rgba(0,0,0,0.05)`
- Keyframes inside light up (highlighted)

Annotate: "Shift+drag adds to existing selection"

### 5.7 Right-click Context Menus

Show **two** small popover variants:

**Keyframe context** (when right-clicking a kf):
```
┌────────────────────────┐
│ Move to playhead       │
│ Snap to frame          │
│ ─────────────────────  │
│ Copy           ⌘C      │
│ Cut            ⌘X      │
│ Delete         ⌫       │
│ ─────────────────────  │
│ Set easing         ▸   │
│ Convert to hold        │
└────────────────────────┘
```

**Ruler context** (when right-clicking ruler):
```
┌────────────────────────┐
│ Add marker here        │
│ ─────────────────────  │
│ Set work area in       │
│ Set work area out      │
│ Clear work area        │
└────────────────────────┘
```

Style: 200w, `<Box>` with 6px rounded corners, 1px border `--w-border`, e2 shadow (use simple `box-shadow`). Each row 28h, Inter 12, hover `--w-fill-1` background. Right-aligned shortcut hint in mono 9px.

---

## 6 · Composition / Layout

Render **at least these 3 full-page artboards** at `1280 × 940` (matching the existing `D_W × D_H_TALL`):

| # | Artboard | What it shows |
|---|---|---|
| 1 | **Timeline · Default (Dope Sheet)** | Editor with new Timeline; one layer selected, one keyframe selected, Inspector annotation; show 3 layers + 1 group + 1 audio track |
| 2 | **Timeline · Graph Editor Mode** | Same scene, graph mode active, 2 numeric tracks shown, bezier handles visible on 1 keyframe, Bezier popup floating |
| 3 | **Timeline · Drag & Snap (interaction)** | Keyframe being dragged, snap indicator visible, lasso selection in progress on another row, context menu opened on a third keyframe |

For each artboard, only the **bottom Timeline panel needs detail** — top bar, toolbar, layer panel, canvas, properties panel can be the existing dimmed/blurred state (like the existing `PropsShapeScreen` does with `opacity: 0.35`).

Also include a **detail callout sheet**:

| # | Callout | Content |
|---|---|---|
| A | Layer Header Bar variants | default · hover · selected · with trim handles visible |
| B | Keyframe variants | default · selected · hold (square) · custom-bezier (double ring) · drag-preview (ghost) |
| C | Marker types | 5 flag colors with labels |
| D | Snap popover | 4 checkboxes opened |
| E | Right-click menus | keyframe + ruler menus side by side |
| F | Audio waveform track | full and muted state |

---

## 7 · Output Format

- **Single JSX file** (Babel-standalone compatible, React 18)
- File name suggestion: `screens-editor-timeline-v2.jsx`
- Wrap all exports in `Object.assign(window, { … })` at the bottom (existing convention)
- Use the primitives listed in Section 3 — do not import from anywhere
- Inline styles for layout, CSS class for fill / typography (existing convention)
- Add new primitives at the top of the file if needed (don't modify `wireframe-primitives.jsx`)
- Add a `<TimelineV2Screen />` exported component that renders all 3 main artboards + the callout sheet inside a `<DesignCanvas>` (don't worry about wiring it to `Chorono Wireframes.html` — that's a follow-up step)
- Annotate generously with `<Anno>` yellow stickies and gray pointer arrows

---

## 8 · What NOT to do

- **Do not use real product colors** — no blue, orange, green, red. Gray scale only.
- **Do not add real icons** — use mono Unicode placeholders (◆ ◯ ▸ ▾ ⏵ ⏸ etc.) like the existing wireframe does
- **Do not redesign the top bar / toolbar / layer panel / canvas / properties panel** — only the bottom Timeline area
- **Do not add real fonts** — Inter + JetBrains Mono only
- **Do not show real animation** — wireframes are static
- **Do not add motion/transitions in the JSX** — pure presentation
- **Do not produce production-quality polish** — this is a low-detail structural wireframe
- **Do not omit annotations** — yellow `<Anno>` stickies are part of the deliverable (explain non-obvious interactions)

---

## 9 · Success Criteria

A reviewer should be able to look at your output and answer "yes" to all of these:

- [ ] Can I see the difference between dope-sheet mode and graph-editor mode?
- [ ] Do I understand how multi-timeline tabs work?
- [ ] Is it obvious where snap targets are and how the snap indicator looks?
- [ ] Can I count at least 5 distinct keyframe state variants?
- [ ] Is the layer header bar (with trim handles) clearly different from a property track row?
- [ ] Is the audio waveform track visually distinct?
- [ ] Are markers + work area handles drawn on the ruler?
- [ ] Are both right-click context menus shown?
- [ ] Does the panel have a resize handle annotation?
- [ ] Do all elements use only gray-scale colors from the system?

---

## 10 · Reference Mental Model

Think After Effects' timeline panel (layer rows with trim handles, dope sheet vs graph editor toggle, markers, work area) crossed with Figma's interaction polish (snap line, lasso, right-click menus, context popovers). Lottie's keyframe simplicity for the visual style. **Less Premiere, more After Effects + Figma.**

---

**End of brief.** Generate the JSX file now.
