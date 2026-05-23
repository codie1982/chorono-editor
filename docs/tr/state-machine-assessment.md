# State Machine System — Current State & Missing Parts Assessment
**Date:** 2026-05-20  
**Status:** Foundation complete (Sprint 1-4), ready for production hardening (V2)

---

## Summary

The State Machine core is **production-ready at the algorithm level** but lacks the **integration layer** needed for real applications. The four main gaps are:

1. **Runtime Player** — exported JSON has nowhere to run outside the editor
2. **Editor UX** — feedback from testing identified friction points
3. **Authoring workflow** — states can't be made visually distinct without a better timeline selection flow
4. **Platform expansion** — no bridge for Android/iOS SDK use

---

## Part A: Completed ✅

### A1. Core Data Model
- `statemachine-base.ts` — Platform-agnostic FSM (state, transition, guard, action)
- `statemachine-chorono.ts` — Chrono extension (timeline-backed states)
- All types properly separated for future game engine / 3D ports

### A2. Runtime Engine
- `StateMachineRuntime` — Stateless state machine driver
  - `dispatch(event, params, wallMs)` — event-triggered transitions
  - `tickGuards(params, wallMs)` — parameter-driven auto-transitions
  - `getBlend(wallMs)` → `ActiveBlend` — deterministic cross-fade progress
  - `sync(newDef)` — live definition reloading without losing session
- `resolver.ts` — Transition selection (event matching, guard evaluation, priority)
- `guard.ts` — Parameter condition evaluation
- `blend.ts` — Cross-fade alpha calculation

**Key property:** Runtime code is **React-free** and **unit-testable in isolation**. Same engine runs in editor and future web/mobile players.

### A3. Editor Integration
- `useInteractiveRuntime` + `useSMRuntime` — React hooks bridging scene edits → runtime
- `evaluateFrame()` — Blends multiple timeline values based on active state/blend
- `evaluateSMPropertySet()` — Projects SM-controlled properties into canvas

### A4. Editor Commands (9 undoable operations)
```
• makeCreateSMCmd
• makeDeleteSMCmd
• makeAddSMStateCmd
• makeDeleteSMStateCmd
• makeUpdateSMStateCmd
• makeSetInitialStateCmd        ← NEW (last sprint)
• makeAddSMTransitionCmd
• makeDeleteSMTransitionCmd
• makeUpdateSMTransitionCmd
```
All support full undo/redo. History integrity verified by tests.

### A5. SVG Node Graph Editor
- Draggable state nodes with ● initial marker
- Bezier edges (solid = event, dashed = guard-only)
- Node positioning (manual drag + auto-layout in `graphLayout.ts`)
- Drag-to-connect with visual feedback
- Detail inspector for state / transition (right rail)
- Self-loop transitions render correctly

### A6. Test Mode
- Dispatch buttons for each transition's event
- Active state highlight during runtime
- Blend progress bar (shows cross-fade %)
- Reset button to return to initial state
- Per-frame tick when test mode is active

### A7. Export
- `RuntimeScene.stateMachines` — SM definitions in scene JSON
- Editor-only fields (x, y) stripped at runtime
- JSON schema ready for player consumption

---

## Part B: Missing / Incomplete ❌

### B1. Editor UX Polish (S — 2-3 days)

#### B1a. Connect Handles (Single-sided problem)
**Current:** Nodes have only a right-side output handle  
**Problem:** Drawing transitions in reverse (liked → idle) requires dragging in awkward directions  
**Solution:** Left + right handles with smart edge offset to prevent overlap

**Files to fix:**
- `components/panels/statemachine/graphLayout.ts` → `statePos()` returns handle positions
- `StateMachinePanel.tsx` → SVG handle rendering + drag-from-left detection

#### B1b. "+ Transition" Fallback Button
**Current:** Can only create transitions by drag-to-connect  
**Problem:** UX friction when precise drag is inconvenient (many nodes, small screen)  
**Solution:** Button opens a form: "From: [idle▼] To: [hover▼] Event: [text]"

**File:** `StateMachinePanel.tsx` → Add modal form

#### B1c. Pan / Zoom
**Current:** Fixed viewport, no scroll or zoom  
**Problem:** Large state machines overflow the panel  
**Solution:** SVG viewport + mouse wheel zoom + pan on middle-click drag

**File:** `StateMachinePanel.tsx` → Add zoom state + SVG transform

#### B1d. Multi-select & Delete key
**Current:** Single node/edge selection only  
**Problem:** Can't bulk-delete or organize multiple states  
**Solution:** Ctrl/Cmd + click = multi-select. Press Delete to remove all.

**File:** `StateMachinePanel.tsx` → Extend selection model to array

#### B1e. Parallel Edge Offset
**Current:** Multiple transitions between same nodes overlap  
**Problem:** Visual ambiguity (can't see both)  
**Solution:** Offset bezier curves so they don't overlap

**File:** `graphLayout.ts` → `edgePath()` detects same (from, to) pair and offsets curve

#### B1f. Auto-reset on initial state change
**Current:** Changing initial state doesn't update Test Mode playback  
**Problem:** Must click Reset manually  
**Solution:** When initial state changes and currentState == oldInitial, auto-snap to new initial

**File:** `useSMRuntime.ts` → `sync()` logic in runtime hook

---

### B2. Runtime Player (L — 5-7 days) ← **Highest priority**

This is the **core missing piece**. The editor exports JSON, but there's no way to load and run it outside the editor.

#### B2a. ChronoPlayer class
**What it is:** Standalone runtime that loads `RuntimeScene` JSON and drives state machine + timeline playback.

**Public API:**
```ts
const player = new ChronoPlayer(runtimeSceneJson, canvasElement, options?)

// Playback control
player.play()
player.pause()
player.stop()
player.getIsPlaying(): boolean

// State machine control
player.dispatch(eventName: string, payload?: Record<string, unknown>): void
player.setParam(name: string, value: number | string | boolean): void

// Queries
player.getCurrentState(): string
player.getCurrentStateName(): string

// Callbacks
player.on('stateChanged', (e: { fromState: string; toState: string }) => {})
player.on('transitionStarted', (e: { event: string }) => {})
player.on('transitionCompleted', (e: { to: string }) => {})
player.on('animationComplete', () => {})
```

**Architecture:**
```
ChronoPlayer
├── RuntimeSceneLoader       (parses JSON)
├── StateMachineRuntime      (existing, reused)
├── TimelineEvaluator        (evaluates keyframes at current time)
├── BlendResolver            (mixes source+target timeline)
├── RenderAdapter            (applies result to canvas/DOM)
└── EventBridge              (converts DOM/SDK events → dispatch)
```

**Key design rule:**  
The player uses **the exact same `StateMachineRuntime` class** from the editor. Zero code duplication. If Test Mode works, the player works.

**Files to create:**
- `src/lib/player/ChronoPlayer.ts`
- `src/lib/player/RuntimeSceneLoader.ts`
- `src/lib/player/RenderAdapter.ts`
- `src/lib/player/EventBridge.ts`
- `src/lib/player/__tests__/*.test.ts`

#### B2b. Player initialization & config
- Accept optional config: `{ autoplay: false, tickRate: 60, renderTarget: 'canvas' | 'dom' }`
- Load JSON synchronously (parsing error → throws with clear message)
- Validate state machine JSON structure

#### B2c. Event bridge
- DOM click → `player.dispatch('click')`
- onmouseenter/leave → `player.dispatch('hoverEnter' | 'hoverExit')`
- Custom events from host code → `player.dispatch('customEvent', { data })`

#### B2d. Timeline evaluation
- Reuse existing `evaluateFrame()` logic from editor
- Player must produce **identical results** to editor Test Mode

#### B2e. Render adapter
- Update canvas 2D context OR DOM elements based on frame output
- Support both Canvas and future WebGL/native targets

**Acceptance criteria:**
- [ ] Player loads `Like Button` exported JSON
- [ ] `player.dispatch('like')` triggers state transition
- [ ] Blend progresses smoothly
- [ ] Test Mode behavior matches player behavior
- [ ] Player unit tests pass (no editor dependencies)

---

### B3. Interactive HTML Export (M — 3-4 days)

**What it is:** One standalone .html file with embedded player + JSON + event bindings.

**Example output:**
```html
<html>
  <body>
    <button id="heart">♥ Like</button>
    <canvas id="chronoCanvas" width="400" height="300"></canvas>
    <script>
      // Bundled ChronoPlayer class
      // Bundled RuntimeScene JSON
      const player = new ChronoPlayer(runtimeSceneJson, canvas)
      player.play()
      document.getElementById('heart').addEventListener('click', () => {
        player.dispatch('like')
      })
    </script>
  </body>
</html>
```

**Files to create:**
- `src/lib/export/htmlExport.ts`

**Implementation steps:**
1. Serialize `RuntimeScene` to JSON
2. Minify + inline `ChronoPlayer.ts` code (or use a bundler)
3. Generate boilerplate HTML with canvas + script tags
4. Optionally embed suggested event handlers (comment blocks)

---

### B4. State-Specific Timeline Authoring (M — 3-4 days)

**Problem:** Currently, selecting a state in the graph doesn't switch the timeline panel. All states share the timeline view.

**Solution:**
- State selection → Timeline panel shows that state's timeline for editing
- Can't author visually different states without this

**Files to modify:**
- `app/page.tsx` (editor layout)
- `components/panels/TimelinePanel.tsx`
- `app/hooks/useEditorState.ts` → track `selectedStateId` globally

**Implementation:**
1. Add `selectedStateId` to editor state
2. When state is selected in graph, set `selectedStateId`
3. TimelinePanel checks: if `selectedStateId`, show that state's timeline; else show nothing
4. Keyframe edits automatically update the right state's timeline

**Acceptance:**
- [ ] Click state in graph
- [ ] Timeline panel switches to that state's timeline
- [ ] Edit keyframes in one state without affecting others

---

### B5. Duplicate State with Timeline Clone (S — 1-2 days)

**Command needed:** `makeDuplicateSMStateCmd(smId, stateId)`

**Behavior:**
1. Clone the state definition
2. Clone its timeline (copy all keyframes)
3. Assign new IDs
4. Add both to scene atomically
5. Undo restores both original state and timeline

**File:** `lib/editor/commands-statemachine.ts`

**Workflow improvement:**
```
1. Create idle state + animate base appearance
2. Duplicate idle → hover (clones timeline)
3. Adjust hover timeline (e.g., scale +5%, add glow)
4. Duplicate hover → pressed
5. Adjust pressed timeline
```

Much faster than manual state creation.

---

### B6. Scene Explorer Integration (XS — half day)

**What it is:** When state machine is selected, list its states in the Scene Explorer sidebar.

**Example:**
```
Button_01
├─ Transform
├─ Style
└─ State Machines
    └─ ButtonInteraction
        ├─ idle · 1.2s
        ├─ hover · 0.4s
        ├─ pressed · 0.2s
        └─ success · 0.8s
```

**Clicking a state entry** → Selects it in the graph + switches timeline panel

---

### B7. Android / SDK Platform Bridge (XL — future phase)

**Not in MVP, but design is important.** The FSM core is already platform-agnostic; this phase ports runtime to Kotlin.

**Conceptual classes (Kotlin):**
```kotlin
class ChronoRuntime(scene: RuntimeScene) {
  fun dispatch(event: String)
  fun setParam(name: String, value: Any)
  fun on(eventName: String, callback: (Event) -> Unit)
}

class AndroidEventBridge(runtime: ChronoRuntime) {
  fun onMotionEvent(event: MotionEvent)  // Maps ACTION_DOWN/UP/MOVE
  fun onHover(entered: Boolean)          // Maps hoverEnter/Exit
}
```

**Event mapping:**
- `MotionEvent.ACTION_DOWN` → `dispatch("pointerDown")`
- `MotionEvent.ACTION_UP` → `dispatch("pointerUp")`
- View.onClickListener → `dispatch("click")`
- View.onHoverListener → `dispatch("hoverEnter"|"hoverExit")`

**Same public API across all platforms:**
```
Web:    player.dispatch(event)
Android: runtime.dispatch(event)
iOS:    runtime.dispatch(event)
```

---

## Part C: Recommended Implementation Order

### Phase 1: Runtime Player (B2) — **Start here**
**Why first:** Unblocks testing outside editor. Highest value, highest impact.  
**Effort:** 5–7 days  
**Deliverable:** ChronoPlayer class + unit tests  
**Blocker for:** Interactive HTML export, SDK integration

### Phase 2: Editor UX Polish (B1) — Parallel or immediately after
**Why:** Identified pain points from canlı test; short turnaround  
**Effort:** 2–3 days  
**Deliverable:** Dual-sided handles, pan/zoom, fallback transition button  
**Risk:** Low

### Phase 3: State Timeline Authoring (B4) — After player works
**Why:** Without this, states remain visually indistinguishable  
**Effort:** 3–4 days  
**Deliverable:** State selection switches timeline panel  
**Blocker for:** Production-quality authoring workflow

### Phase 4: Duplicate State (B5) + Scene Explorer (B6)
**Why:** Authoring quality-of-life improvements  
**Effort:** 1–2 days (B5) + half day (B6)  
**Deliverable:** Fast variant creation; intuitive state hierarchy

### Phase 5: Interactive HTML Export (B3)
**Why:** Demo & sharing  
**Effort:** 3–4 days  
**Deliverable:** Standalone .html files  
**Blocker for:** None (nice-to-have)

### Phase 6: Android SDK (B7)
**Why:** Platform expansion  
**Effort:** XL (separate sprint)  
**Deliverable:** Kotlin runtime, event bridge, Compose integration  
**Blocker for:** Mobile ship

---

## Part D: Key Design Constraints

### Shared Runtime Principle
**No code duplication between editor and player.**

```
Editor Test Mode  ─┐
                   ├─→ StateMachineRuntime
Web Player        ─┤
                   ├─→ resolveTransition()
Android SDK       ─┘   evaluateGuard()
                       getBlend()
```

If the core algorithm changes, it must change once and work everywhere.

### No Editor Specifics in Runtime
- Runtime code must NOT import React
- Runtime must NOT depend on DOM or canvas APIs (only consume RenderAdapter interface)
- Runtime must be testable in Node.js without a browser

### Immutable Scene Pattern
Editor mutations always return a new `ChronoScene` object. Undo/redo restores old references. This is already correct; maintain it.

### Visual State Fidelity
Exported JSON must render identically in player as in Test Mode. If a blend shows 47% in the editor, it shows 47% in the player (same `ActiveBlend` object, same timeline evaluation).

---

## Part E: Adjustments to the V2 Plan

The Turkish V2 plan is **directionally correct** but needs refinement:

### E1. Priority Clarification
**Original plan suggested:** A1+A2 (fast UX wins) → B (player) → C (authoring)  
**Revised recommendation:** B (player) first, then A/C in parallel

**Reasoning:**  
- Player unblocks testing outside editor (critical for production)
- UX polish is lower risk and can happen in parallel by a second person
- Authoring depth requires both editor UX AND player to be meaningful

### E2. Authoring Depth is Bigger Than Stated
The V2 plan underestimated **B4 (state-specific timeline switching)**. This isn't just a UI refinement—it's a core workflow blocker. Without it:
- States remain visually identical
- Authoring motivation is low ("why would I create multiple states if they look the same?")

### E3. Duplicate State Command is Critical
Added B5 as a separate task (not just "feature request"). Fast variant creation is essential for testing the system quickly.

### E4. Scene Explorer is Lower Priority
B6 is a UX nice-to-have, not a blocker. Can defer to Phase 4.

### E5. HTML Export Scope Clarified
B3 should produce **true standalone files** (single .html, no server). Inline everything. This requires:
- Minified ChronoPlayer code (or webpack/esbuild bundle)
- Base64-encoded JSON
- Event binding templates as HTML comments

Current plan didn't specify this clearly.

---

## Part F: Risk Assessment

| Task | Risk | Mitigation |
|------|------|-----------|
| B2 Player | Medium | Shared runtime principle enforces correctness; unit tests prove parity with editor |
| B1 Pan/Zoom | Low | Pure SVG viewport math; easily unit-testable |
| B1 Dual handles | Low | Geometry is simple; parallel-edge offset is the hard part |
| B4 Timeline switching | Medium | Requires global editor state refactor; can break other flows |
| B5 Duplicate state | Low | Straightforward command pattern; timeline clone is already safe |
| B3 HTML export | Medium | Bundling & minification needs careful planning; test across browsers |

---

## Part G: File Structure After Completion

```
src/lib/
├── statemachine/
│   ├── StateMachineRuntime.ts           ✅ Done
│   ├── resolver.ts                      ✅ Done
│   ├── guard.ts                         ✅ Done
│   ├── blend.ts                         ✅ Done
│   └── __tests__/
│
├── player/                              ❌ B2 — Create
│   ├── ChronoPlayer.ts
│   ├── RuntimeSceneLoader.ts
│   ├── RenderAdapter.ts
│   ├── EventBridge.ts
│   └── __tests__/
│
├── export/                              ❌ B3 — Create
│   └── htmlExport.ts
│
├── editor/
│   ├── commands-statemachine.ts         ✅ Done + B5 addition
│   └── __tests__/
│
└── types/
    ├── statemachine-base.ts             ✅ Done
    └── statemachine-chorono.ts          ✅ Done

components/panels/
├── StateMachinePanel.tsx                ✅ Done + B1 improvements
├── TimelinePanel.tsx                    ✅ Done + B4 integration
└── statemachine/
    ├── graphLayout.ts                   ✅ Done + B1 enhancements
    └── graphLayout.test.ts              ✅ Done

app/hooks/
├── useSMRuntime.ts                      ✅ Done + B1f auto-reset
└── useInteractiveRuntime.ts             ✅ Done
```

---

## Conclusion

**The foundation is rock-solid.** The state machine engine is correct, tested, and reusable. What's missing is the **integration layer** to make it useful outside the editor:

1. **Player** — Can't run exported machines
2. **UX** — Authoring friction reduces productivity
3. **Authoring** — Can't make states visually distinct
4. **Export** — No standalone demos

**Recommended next sprint:**
- Build ChronoPlayer (B2) + basic tests
- Fix editor handles + pan/zoom (B1)
- Wire up state-specific timeline editing (B4)
- Add duplicate state (B5)

**Est. effort:** 2.5–3 weeks for A+B+C. Enough to ship a production-quality feature.
