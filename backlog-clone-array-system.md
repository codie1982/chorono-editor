# Clone & Array System — MVP Backlog (v2)

**Project**: Chorono Animator — Clone & Array System Implementation  
**Duration**: 6 weeks (MVP) + Phase 2 enhancements  
**Status**: Planning Complete (v2 Approved), Ready for Sprint 1

---

## v2 Architecture Improvements Applied

This backlog incorporates 8 critical revisions from user feedback:

1. ✓ **Count Semantics**: sourcePolicy flag clarifies Array total vs. new count behavior
2. ✓ **Resolver Separation**: ArrayTransformResolver (math) + ArrayLayerFactory (builder)
3. ✓ **Metadata Management**: EditorState.layerMetaById (not Layer pollution)
4. ✓ **Group Safety**: CloneTreeResolver with idMap reference remapping
5. ✓ **Track Parsing**: TrackTargetParser + remapTrackTarget for robust timeline integration
6. ✓ **Command Results**: EditorCommandResult (createdIds, selection) + makeSelectLayersCmd
7. ✓ **Transform Math**: Matrix-based world/local/parent coordinate space handling
8. ✓ **Type Safety**: Discriminated union ArraySettings (Linear|Grid|Radial)

See plan-v2 document for detailed architecture.

---

## Sprint 1: Foundation — Types & Core Resolvers (Week 1–2)

### Task 1.1: Type System Extensions
**File**: `src/lib/types/core.ts`  
**Effort**: 2h

- [ ] Add `CloneMode` enum: `'copy' | 'instance' | 'reference' | 'virtual'`
- [ ] Add `CloneMetadata` interface: `{ sourceId: string, mode: CloneMode, createdAt: number }`
- [ ] Add `_cloneMeta?: CloneMetadata` field to `Layer` interface (internal, excluded from export)
- [ ] Add `ArrayPattern` enum: `'linear' | 'grid' | 'radial' | 'spiral'`
- [ ] Add `TransformMode` type: `'incremental' | 'total'`
- [ ] Add `ArraySettings` interface with all fields: `pattern, countX, countY, transformMode, space, moveX/Y, rotation, scaleX/Y`
- [ ] Update TypeScript to ensure no type errors
- [ ] Add JSDoc comments explaining each field

**Definition of Done**:
- Types compile without errors
- Layer interface is backward-compatible (all new fields optional)
- _cloneMeta is tagged as internal (not in exports)

---

### Task 1.2: CloneResolver Implementation
**File**: `src/lib/clone/CloneResolver.ts` (NEW)  
**Effort**: 3h

- [ ] Create file structure: `src/lib/clone/`
- [ ] Import `cloneLayerForDuplicate` from `defaults.ts`
- [ ] Implement `cloneLayer(source, mode='copy', count=1, offsetX=0, offsetY=0) → Layer[]`
  - [ ] Deep clone using existing `cloneLayerForDuplicate()` pattern
  - [ ] Apply incremental offset to each clone's `transform.x` and `transform.y`
  - [ ] Attach `_cloneMeta` to each clone
  - [ ] Return array of cloned layers
- [ ] Add `getNextCloneId()` helper (similar to `nextKfId()`)
- [ ] Add unit test file: `src/lib/clone/__tests__/CloneResolver.test.ts`
  - [ ] Test: clones are independent (different IDs)
  - [ ] Test: offsets applied correctly
  - [ ] Test: _cloneMeta present on each clone
  - [ ] Test: count parameter respected (N clones returned)

**Definition of Done**:
- All tests pass
- No TypeErrors
- Offsets verified in test snapshot

---

### Task 1.3: ArrayResolver — Linear Mode
**File**: `src/lib/array/ArrayResolver.ts` (NEW)  
**Effort**: 4h

- [ ] Create file structure: `src/lib/array/`
- [ ] Implement `arrayLayer(source, settings) → Layer[]`
  - [ ] Route by `settings.pattern`
- [ ] Implement `solveLinear(source, settings) → Layer[]`
  - [ ] Handle `transformMode: 'incremental'`
    - [ ] stepX = settings.moveX, stepY = settings.moveY
    - [ ] For i in 0..countX-1: clone[i].x += i * stepX
  - [ ] Handle `transformMode: 'total'`
    - [ ] stepX = settings.moveX / (countX - 1)
    - [ ] Same positioning logic
  - [ ] Apply rotation and scale steps similarly
  - [ ] Use `CloneResolver.cloneLayer()` for base cloning
- [ ] Add unit tests: `src/lib/array/__tests__/ArrayResolver.test.ts`
  - [ ] Test: incremental mode (5 copies, moveX=50 → x: 0, 50, 100, 150, 200)
  - [ ] Test: total mode (5 copies, moveX=200 → x: 0, 50, 100, 150, 200)
  - [ ] Test: rotation step applied
  - [ ] Test: scale step applied (verify power-law for scale)

**Definition of Done**:
- solveLinear returns correct positions
- Both transformMode variants tested
- No floating-point rounding errors >0.1px
- Snapshot tests capture layout

---

### Task 1.4: ArrayResolver — Grid Mode
**File**: `src/lib/array/ArrayResolver.ts` (continuation)  
**Effort**: 3h

- [ ] Implement `solveGrid(source, settings) → Layer[]`
  - [ ] Nested loop: `for y in 0..countY-1, for x in 0..countX-1`
  - [ ] Position: `baseX + x * stepX, baseY + y * stepY`
  - [ ] Apply rotation per row/column (if settings provide rowRotationStep, colRotationStep)
  - [ ] Support row offset (stagger even/odd rows by dx)
- [ ] Add unit tests
  - [ ] Test: 3×2 grid, 100px column spacing, 80px row spacing
  - [ ] Test: staggered rows (alternate offset)
  - [ ] Test: verify all 6 instances have correct x/y

**Definition of Done**:
- Grid layout correct (2D positions)
- Stagger option works
- Tests pass

---

### Task 1.5: ArrayResolver — Radial Mode
**File**: `src/lib/array/ArrayResolver.ts` (continuation)  
**Effort**: 3h

- [ ] Implement `solveRadial(source, settings) → Layer[]`
  - [ ] Reuse `RepeaterResolver.toPolar()` math or implement inline
  - [ ] Parameters: centerX, centerY, radius, startAngle, endAngle, reorient (boolean)
  - [ ] For i in 0..count-1:
    - [ ] angle = startAngle + i * (endAngle - startAngle) / count
    - [ ] x = centerX + cos(angle) * radius
    - [ ] y = centerY + sin(angle) * radius
    - [ ] if reorient: rotation = angle (layer faces outward)
  - [ ] Use `CloneResolver.cloneLayer()` for cloning
- [ ] Add unit tests
  - [ ] Test: 6-point circle (radius=100, closed=true)
  - [ ] Test: rotation correctly points outward
  - [ ] Test: arc (e.g., 180°, not closed)

**Definition of Done**:
- Circular layout verified
- Rotation alignment correct
- Tests pass

---

### Task 1.6: Clone & Array Commands
**File**: `src/lib/editor/commands-clone.ts` (NEW)  
**Effort**: 4h

- [ ] Import `makeAddLayerCmd`, `makeBatchCmd` from existing commands
- [ ] Implement `makeCloneCmd(source, count, offsetX, offsetY) → EditorCommand`
  - [ ] Call `CloneResolver.cloneLayer()`
  - [ ] Map each clone to `makeAddLayerCmd()`
  - [ ] Wrap in `makeBatchCmd()` for atomic undo
  - [ ] Label: "Clone {name} ({count} copies)"
- [ ] Implement `makeArrayCmd(source, settings) → EditorCommand`
  - [ ] Call `ArrayResolver.arrayLayer()`
  - [ ] Map each instance to `makeAddLayerCmd()`
  - [ ] Wrap in `makeBatchCmd()` for atomic undo
  - [ ] Label: "Array {name} ({count} copies)"
- [ ] Add unit tests: `src/lib/editor/__tests__/commands-clone.test.ts`
  - [ ] Test: execute creates layers
  - [ ] Test: undo removes all layers
  - [ ] Test: redo recreates all layers
  - [ ] Test: batch label correct

**Definition of Done**:
- Commands execute/undo correctly
- Undo stack state is correct
- Tests pass

---

## Sprint 2: UI & Modals (Week 3–4)

### Task 2.1: CloneModal Component
**File**: `src/components/modals/CloneModal.tsx` (NEW)  
**Effort**: 3h

- [ ] Copy structure from `SegmentModal.tsx`
- [ ] Props: `{ source: Layer, timeline: Timeline, onApply: (count, offsetX, offsetY) => void, onClose: () => void }`
- [ ] State: `count, offsetX, offsetY`
- [ ] UI Elements:
  - [ ] Title: "Clone {source.name}"
  - [ ] Mode selector: Radio buttons (only 'Copy' enabled, gray-out others with "Coming Soon")
  - [ ] Count slider: 1–100, default 5
  - [ ] Offset X input: number field, default 20
  - [ ] Offset Y input: number field, default 20
  - [ ] Preview checkbox: Show/hide ghost outlines (future feature, disabled for now)
  - [ ] Buttons: [Apply] [Cancel]
- [ ] Styling: Dark theme, gray-900 bg, gray-700 borders (match existing modals)
- [ ] Add basic JSX tests (render, input change, button click)

**Definition of Done**:
- Modal renders correctly
- All inputs update state
- Apply/Cancel buttons work
- Matches design system

---

### Task 2.2: ArrayModal Component
**File**: `src/components/modals/ArrayModal.tsx` (NEW)  
**Effort**: 5h

- [ ] Props: `{ source: Layer, onApply: (settings: ArraySettings) => void, onClose: () => void }`
- [ ] State: `pattern, countX, countY, transformMode, moveX, moveY, rotation, scaleX, scaleY, space`
- [ ] UI Tabs/Sections:
  - [ ] **Pattern Tab**: Radio buttons (Linear, Grid, Radial)
    - [ ] Show/hide relevant fields based on pattern
  - [ ] **Count Section**:
    - [ ] Linear: "Count" input (1–500)
    - [ ] Grid: "Columns" + "Rows" inputs
    - [ ] Radial: "Count" input
  - [ ] **Transform Section**:
    - [ ] Mode toggle: "Incremental ↔ Total"
    - [ ] If Incremental: "Move X", "Move Y", "Rotate (°)", "Scale X%", "Scale Y%"
    - [ ] If Total: Same fields but label says "Total Move X", etc.
  - [ ] **Space Section**: Dropdown (World, Local, Parent)
  - [ ] **Preview Section**: Checkbox (Show/hide live preview) — disabled for MVP
- [ ] Buttons: [Apply] [Cancel]
- [ ] Validation: Count > 0, Columns/Rows > 0
- [ ] Add JSX tests

**Definition of Done**:
- Modal renders correctly
- Pattern switching updates visible fields
- TransformMode toggle works
- Validation prevents invalid input
- Matches design system

---

### Task 2.3: Context Menu Integration
**File**: `src/components/canvas/buildCanvasMenu.ts`  
**Effort**: 2h

- [ ] Add to `CanvasMenuHandlers` interface: `clone?: () => void`, `array?: () => void`
- [ ] In `buildCanvasMenu()`, add submenu:
  ```
  { kind: 'submenu', label: 'Clone / Array', items: [
    action('Clone (Quick)', '', h.clone),
    action('Clone with Settings…', '', () => setShowCloneModal(true)),
    sep(),
    action('Array…', '', () => setShowArrayModal(true))
  ]}
  ```
- [ ] Disable items if no layer selected
- [ ] Add test

**Definition of Done**:
- Menu items appear in context menu
- Handlers called correctly
- Items disabled when appropriate

---

### Task 2.4: Page-Level Modal State
**File**: `src/app/page.tsx`  
**Effort**: 3h

- [ ] Add state variables:
  - [ ] `showCloneModal, setShowCloneModal`
  - [ ] `showArrayModal, setShowArrayModal`
  - [ ] `cloneSelectedLayer: Layer | null`
  - [ ] `arraySelectedLayer: Layer | null`
- [ ] Add handler functions:
  - [ ] `handleClone(count, offsetX, offsetY)`:
    - [ ] Call `ed.dispatchCommand(makeCloneCmd(...))`
    - [ ] Select first clone (optional)
    - [ ] Show toast: "Cloned {name}"
  - [ ] `handleArray(settings)`:
    - [ ] Call `ed.dispatchCommand(makeArrayCmd(...))`
    - [ ] Select first instance (optional)
    - [ ] Show toast: "Created array ({count} copies)"
- [ ] Add context menu handler dispatch:
  - [ ] Wire `buildCanvasMenu(..., { clone: () => setShowCloneModal(true), array: () => setShowArrayModal(true) })`
- [ ] Render modals at bottom (with other modals):
  - [ ] `{showCloneModal && <CloneModal source={cloneSelectedLayer} onApply={handleClone} onClose={...} />}`
  - [ ] `{showArrayModal && <ArrayModal source={arraySelectedLayer} onApply={handleArray} onClose={...} />}`

**Definition of Done**:
- Modals open/close correctly
- Handlers dispatch commands
- Toast notifications appear
- No console errors

---

## Sprint 3: Timeline Integration & Selection (Week 5)

### Task 3.1: Animation Track Duplication
**File**: `src/lib/editor/commands-clone.ts` (extension)  
**Effort**: 3h

- [ ] Implement `cloneLayerAnimationTracks(source, clone, timeline) → Track[]`
  - [ ] Find all tracks where `target.startsWith('layers.${source.id}')`
  - [ ] For each track, create new track with:
    - [ ] Target updated to reference clone.id
    - [ ] Keyframes copied with fresh IDs (use `nextKfId()`)
    - [ ] Same easing, time positions
  - [ ] Return array of new tracks
- [ ] Update `makeCloneCmd()` to include track duplication:
  - [ ] Call `cloneLayerAnimationTracks()` for each clone
  - [ ] Wrap track-add commands in batch
- [ ] Update `makeArrayCmd()` similarly
- [ ] Add unit tests:
  - [ ] Test: tracks duplicated correctly
  - [ ] Test: keyframe IDs are fresh
  - [ ] Test: timing preserved

**Definition of Done**:
- Animation tracks copy to cloned layers
- Keyframe IDs are unique
- Tests pass

---

### Task 3.2: Post-Clone Selection
**File**: `src/app/page.tsx` (update handlers)  
**Effort**: 1h

- [ ] After clone/array apply:
  - [ ] Select the first cloned/arrayed layer
  - [ ] (Optional) Multi-select all if user held Shift
- [ ] Update `handleClone()` and `handleArray()` to find and select first result
- [ ] Verify LayerPanel updates to show new layers

**Definition of Done**:
- First clone is selected after operation
- LayerPanel updates visually

---

### Task 3.3: Edge Case Handling
**File**: `src/app/page.tsx` (handlers) + modals  
**Effort**: 2h

- [ ] **Locked layers**: Allow cloning locked layer, result is unlocked
  - [ ] Show toast warning: "Cloned layer is unlocked"
- [ ] **Group nesting**: Clone entire subtree (parentId preserved for children)
  - [ ] Verify in test
- [ ] **Prevent recursion**: If source has _cloneMeta, warn user
  - [ ] Toast: "Cloning a clone — consider the source instead"
- [ ] **Large counts**: If count > 500, show async toast
  - [ ] Optional: batch insertion in ~50-layer chunks

**Definition of Done**:
- Edge cases handled gracefully
- User feedback (toast) provided
- No state corruption

---

## Sprint 4: Performance & Testing (Week 6)

### Task 4.1: Optimization
**File**: `src/lib/clone/CloneResolver.ts`, `src/lib/array/ArrayResolver.ts`  
**Effort**: 2h

- [ ] Batch layer insertion: Collect all clones/instances, insert once
  - [ ] Modify `makeCloneCmd()` and `makeArrayCmd()` to batch add-layer commands
- [ ] ID generation caching: Pre-compute all IDs for a batch
  - [ ] Generate array of nextKfId() calls upfront
- [ ] Animation track linking: Use Map for O(1) lookup
  - [ ] In `cloneLayerAnimationTracks()`, build Map<targetPrefix, Track[]> once

**Definition of Done**:
- Batch insertion reduces array mutation
- ID generation optimized
- No observable perf regression

---

### Task 4.2: Performance Tests
**File**: `src/lib/clone/__tests__/performance.test.ts`, `src/lib/array/__tests__/performance.test.ts`  
**Effort**: 2h

- [ ] Test: Clone 1000 layers → should complete in <500ms
- [ ] Test: Array 100×10 grid (1000 instances) → should complete in <500ms
- [ ] Test: Undo 1000-layer array → should be instant (<50ms)
- [ ] Test: Memory: 1000-layer array should not exceed 10MB heap delta

**Definition of Done**:
- All perf tests pass
- No timeout errors

---

### Task 4.3: Unit Test Coverage
**File**: Across all new test files  
**Effort**: 3h

- [ ] CloneResolver: 80%+ line coverage
  - [ ] All cloning paths tested
  - [ ] Offset calculation verified
  - [ ] _cloneMeta assignment verified
- [ ] ArrayResolver: 80%+ line coverage
  - [ ] solveLinear, solveGrid, solveRadial each tested
  - [ ] incremental vs. total modes tested
  - [ ] Edge cases (count=1, rotation wrapping, scale 0%)
- [ ] Commands: 90%+ line coverage
  - [ ] execute/undo round-trips tested
  - [ ] Batch atomic structure verified

**Definition of Done**:
- Coverage report shows 80%+ for lib code
- All test pass
- No flaky tests

---

### Task 4.4: Documentation & Code Comments
**File**: All new files  
**Effort**: 1h

- [ ] Add JSDoc comments to exported functions
- [ ] Explain transform math in `solveLinear()`, `solveRadial()` (reference 3ds Max logic)
- [ ] Explain `_cloneMeta` internal tagging in core.ts
- [ ] Add usage examples in CloneResolver, ArrayResolver header comments
- [ ] Update project CLAUDE.md with Clone & Array tool overview

**Definition of Done**:
- All exported functions have JSDoc
- Math is explained in comments
- New developers can understand pattern

---

## Optional Sprint 5: Advanced Modes (Week 6+, if time)

### Task 5.1: Spiral Mode
**File**: `src/lib/array/ArrayResolver.ts`  
**Effort**: 2h

- [ ] Implement `solveSpiral(source, settings) → Layer[]`
  - [ ] Parameters: centerX, centerY, startRadius, radiusStep, angleStep, scaleStep, opacityStep
  - [ ] For i in 0..count-1:
    - [ ] angle = i * angleStep
    - [ ] radius = startRadius + i * radiusStep
    - [ ] x = centerX + cos(angle) * radius
    - [ ] y = centerY + sin(angle) * radius
    - [ ] scale *= scaleStep^i
    - [ ] opacity *= (1 - opacityStep*i)
  - [ ] Add unit tests

**Definition of Done**:
- Spiral layout correct
- Scale/opacity fade tested

---

### Task 5.2: Clone & Align (Minimal)
**File**: `src/components/modals/CloneAlignModal.tsx`  
**Effort**: 3h

- [ ] Modal for selecting source object and multiple target positions
- [ ] Align options: Position (X, Y, both), Rotation, Scale
- [ ] For each target, place clone of source at target's position (optional rotation/scale match)
- [ ] Add unit tests

**Definition of Done**:
- Modal allows source/target selection
- Alignment applied correctly
- Tests pass

---

## Documentation & Handoff

### Task 6.1: Update CLAUDE.md
**File**: `CLAUDE.md` (project root)  
**Effort**: 1h

Add section:

```markdown
## Clone & Array System

The project includes a professional clone and array tool suite (inspired by 3ds Max and After Effects).

**Files**:
- `src/lib/clone/CloneResolver.ts` — Core cloning logic (Copy mode MVP)
- `src/lib/array/ArrayResolver.ts` — Array pattern solvers (Linear, Grid, Radial)
- `src/lib/editor/commands-clone.ts` — EditorCommands for clone/array operations
- `src/components/modals/CloneModal.tsx` — Clone UI
- `src/components/modals/ArrayModal.tsx` — Array UI

**Usage**:
1. Select layer in canvas or layer panel
2. Right-click → Clone / Array → Choose operation
3. Configure in modal (count, offset, pattern, spacing)
4. Apply → Layers are cloned/arrayed atomically (one undo step)

**MVP Features**:
- Clone tool: Copy mode with offset
- Array tool: Linear, Grid, Radial patterns with incremental/total transform modes
- Timeline: Animation tracks duplicated to clones
- Undo/Redo: All operations atomic

**Future (Phase 2)**:
- Instance/Reference/Virtual clone modes (requires asset system)
- Path Array tool (requires path engine)
- Repeater Modifier (non-destructive, requires modifier system)
- Clone & Align tool (full feature set)
```

**Definition of Done**:
- Section added to CLAUDE.md
- Accurate, links to key files

---

## Backlog Summary

| Sprint | Task | File | Effort | Status |
|--------|------|------|--------|--------|
| 1 | Type extensions | types/core.ts | 2h | Pending |
| 1 | CloneResolver | clone/CloneResolver.ts | 3h | Pending |
| 1 | ArrayResolver Linear | array/ArrayResolver.ts | 4h | Pending |
| 1 | ArrayResolver Grid | array/ArrayResolver.ts | 3h | Pending |
| 1 | ArrayResolver Radial | array/ArrayResolver.ts | 3h | Pending |
| 1 | Clone & Array Cmds | editor/commands-clone.ts | 4h | Pending |
| 2 | CloneModal | modals/CloneModal.tsx | 3h | Pending |
| 2 | ArrayModal | modals/ArrayModal.tsx | 5h | Pending |
| 2 | Context Menu | canvas/buildCanvasMenu.ts | 2h | Pending |
| 2 | Page State | app/page.tsx | 3h | Pending |
| 3 | Track Duplication | editor/commands-clone.ts | 3h | Pending |
| 3 | Selection | app/page.tsx | 1h | Pending |
| 3 | Edge Cases | app/page.tsx | 2h | Pending |
| 4 | Optimization | Across | 2h | Pending |
| 4 | Perf Tests | __tests__ | 2h | Pending |
| 4 | Unit Tests | __tests__ | 3h | Pending |
| 4 | Documentation | All + CLAUDE.md | 1h | Pending |
| 5 | Spiral Mode | array/ArrayResolver.ts | 2h | Optional |
| 5 | Clone & Align | modals/CloneAlignModal.tsx | 3h | Optional |

**Total MVP Effort**: ~47 hours (6 weeks @ 8h/week)  
**Estimated Velocity**: 40 hours → 2 weeks with parallel work, 6 weeks with part-time effort

---

## Notes for Implementation

1. **Start with types** (Task 1.1) — unblocks all dependent tasks
2. **Resolvers next** (Tasks 1.2–1.5) — can be tested independently
3. **Commands and page state in parallel** (Tasks 1.6, 2.4)
4. **Modals can start before full integration** — use mock handlers
5. **Timeline integration last** — depends on commands working
6. **Test early and often** — unit tests for each resolver

---

**Next Step**: Begin Sprint 1, Task 1.1 (Type Extensions)
