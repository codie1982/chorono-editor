# Chorono Animator — Backlog Audit Summary (2026-05-21)

## Executive Summary

**Total Backlog Items:** ~29 key items tracked in primary table (92 total with duplicates/reorg)
**Completed:** 20 items ✅
**In Progress:** 4 items 🔄  
**Paused:** 2 items ⏸
**Not Started:** 3+ items ⬜

**Code Status:** 813 tests passing · TypeScript clean · Multiple branches ready to merge

---

## ✅ COMPLETED ITEMS (20)

### P1 — Kritik UX (14/18 done)
| Item | Effort | Status | Notes |
|------|--------|--------|-------|
| **BL-01** AI Entegrasyonu | L | ✅ Faz 1 + 2 | Multi-turn agent loop, read tools, scene replay |
| **BL-02** Transform Gizmo System | L | ✅ | Move/Rotate/Scale/Anchor with 3ds Max logic |
| **BL-03** Pen Tool + Multi-select | M | ✅ | Segment anchor insert, group bbox, multi-select pivot |
| **BL-26** Snap Engine | M | ✅ | Central precision engine with context menu |
| **BL-45** Out-of-Range Core | M | ✅ | Runtime evaluator + CurveEditor visualization |
| **BL-07** Timeline Sprint 2 | M | ✅ | Slide keys / Range select / Scale handles / Stagger / Spreadsheet |
| **BL-11** Timeline Sprint 3 | S | ✅ | Work Area + Marker overlay + keyboard nav |
| **BL-05** Parameter Wiring | M | ✅ | 6 sprint: types + modal + tree picker + 17 presets + UI |
| **BL-60** Smart Selection Engine | M | ✅ | Select Similar + By Transform + canvas tools (Box/Lasso/Circle/Paint) |
| **BL-59** Clone & Array System | M | ✅ | 5 tool families + instanceOf + InstanceResolver + 626 test |
| **BL-46–51** Animation Signal System | L | ✅ | Modifier Stack + Noise/Fractal + TimeWarp + Physics + Procedural + Bake |
| **BL-13 V1** Particle Engine Sprint P1 | L | ✅ | Polymorphic emitter + 6 shapes + dedicated dock tab + scene-layer geometry |
| **BL-73** Spline Object System | L | ✅ | 3ds Max-style type:'spline' + 8 primitive + mouse draw + point edit + Text→Spline |
| **BL-66 / BL-67** Path System + Motion Path | M | ✅ | Interactive path drawing + motion path assignment flow |
| **BL-69** Parameter Binding UI | M | ✅ | 📎 button + popover for text/fill/stroke/color properties |
| **BL-70** Context Menu Enhancements | S | ✅ | Right-click menus on LayerPanel/Canvas/AssetsPanel/Parameters/Events |

### P2 — Yüksek Değer (6 completed)
| Item | Effort | Status | Notes |
|------|--------|--------|-------|
| **BL-24** Extra Primitives | M | ✅ | Spiral / Wave Line / Blob / Rounded Rect |
| **BL-25** Snap Settings Panel | S | ✅ | State lift for snap configuration |
| **BL-40** Curve Editor v2 | M | ✅ | Weighted tangents + isolation + value snap |
| **BL-43** Timeline Navigation | M | ✅ | Minimap + search + bookmarks |
| **BL-52–58** Scene Explorer Arc | L | ✅ | Foundation + column system + bulk ops + selection unification + display mgmt + ghost/onion-skin + faceted search |
| **BL-35 / BL-38 / BL-41** Timeline Tracks | M | ✅ | Track type architecture + Event/Audio/Color tracks + Solo/Pin/Filter |

---

## 🔄 IN PROGRESS (4 items)

| Item | Effort | Status | Branch | Issue |
|------|--------|--------|--------|-------|
| **BL-16** Editor Mode Foundation | M | ⏸ duraklatıldı | `feat/editor-mode-foundation` | Faz 1-4 + refactor done; Draw mode removed, Edit modal added. Awaiting stability check before merge |
| **BL-17 Faz 2** Sub-Object Editing | M | 🔄 | same branch | v1 exists; full UX incomplete. Vertex/Segment/Path modes |
| **BL-28 / 29 / BL-06 Faz 1** Angle/Scale Snap + Shape Draw | M | 🔄 | same branch | Toolbar buttons live. Waiting for main merge |
| **BL-72** Text Typography System | M–L | 🔄 | `feat/text-element-typography` | Phase 1 ✅ (measured size) + Phase 2 ✅ (char/style panel). Phase 3 ⬜ per-character animator. 771 test ✅. Not committed yet |
| **BL-76** Authoring Script — JS Host | M | 🔄 | | Sprint 1 MVP starting; independent of BL-74/75 |

---

## ⏸ PAUSED / REVERT (2 items)

| Item | Reason | Effort | Next Step |
|------|--------|--------|-----------|
| **BL-71** Align / Distribute / Spread Tools | Group child drag broke (drag handler still LOCAL; gizmos now WORLD). Reverted from main. | M | Fix drag/resize/anchor handlers to world-aware; test with grouped layers |
| **BL-39** Animation Layers / Additive Blend | Deferred to State Machine scope (BL-09 now owns this conceptually) | M | Re-evaluate post BL-09 |

---

## ⬜ NOT STARTED — Critical Path (3 items)

| Item | Effort | Blocker | Notes |
|------|--------|---------|-------|
| **BL-27** Vertex / Segment / Path Snap | M | BL-26 ✅ done; BL-17 Faz 2 merge pending | P1. Pen tool snap integration |
| **BL-74** Multi-Mode Architecture Foundation | L (3 wks) | None | P4. ISceneObject / IScene / IRenderer abstraction. Code unchanged, layer added |
| **BL-75** Interactive Runtime + Console | L (3-3.5 wks) | None | P3. Headless ChronoPlayer + REPL + Watch. 70% infrastructure exists |

---

## ⬜ NOT STARTED — P2 / P3 (Sampling)

| Item | Effort | Priority | Notes |
|------|--------|----------|-------|
| **BL-79 S0** AI Transaction + Intent + Bounds | S | P2 | `AITransactionCommand` (single undo for all AI edits) + bounds read tool |
| **BL-79 S1** AI Auto-Check + QualityScorer | M | P2 | Post-build checker auto-run + overlap detection |
| **BL-79 S2** High-Level Animation Tools | M–L | P2 | `create_stagger`, `center_layer`, `align_layers`, `fit_to_canvas`, `create_loop` |
| **BL-04** Universal Import Foundation | M | P2 | Asset manager + type registry + handler pipeline |
| **BL-05–11** Asset & Document Handlers | L | P2 | Image/Video/Audio/Font; SVG/Lottie/Chorono JSON; dotLottie/GIF/Sprites |
| **BL-18–23** Modifier Stack & Boolean | L | P2 | Geometry modifier stack + bend/wave/vortex + boolean ops + brush + bake |
| **BL-30–34** Advanced Snap System | L | P2–P3 | Smart guides / ruler guides / numeric snap / modifier snap / constraint snap |
| **BL-80–92** Export Pipeline | L | P1–P4 | PNG/WEBP/MP4/WEBM/GIF/SVG/Lottie/EXR; binary format; offline renderer; render queue |

---

## 📊 EFFORT SUMMARY — REMAINING WORK

### By Priority

```
P1  (Critical UX)     3 items   ~2–3 weeks   (BL-27, BL-71 fix, BL-16/17 merge)
P2  (High Value)      30+ items ~6–8 weeks   (AI enhancements, imports, modifiers, export)
P3  (Power User)      10+ items ~4–6 weeks   (Script console, constraints, advanced snap)
P4  (Architecture)    10+ items ~3–4 weeks   (Multi-mode, offline render, GPU, binary format)
```

**Total Estimate:** ~15–21 person-weeks remaining (assuming ~5 days dev sprint)

### By Effort Category

| Category | Count | Effort | Notes |
|----------|-------|--------|-------|
| **S (1–2 days)** | 5 | ~1 week | Quick wins: BL-74 foundational, some snap items |
| **M (3–5 days)** | 15 | ~3 weeks | Bulk of work: UI panels, snap modes, image handlers |
| **L (1 week+)** | 15+ | ~8+ weeks | Major systems: export pipeline, modifier stack, multi-mode, particle V2+ |
| **XL (2+ weeks)** | 5 | ~5 weeks | Advanced: bone/IK, state machine optimization, GPU acceleration, particle flow |

---

## 🎯 CRITICAL PATH — IMMEDIATE NEXT STEPS

### Week 1 — Merge Stability (BL-16/17/28/29/06 family)

```
1. Stabilize BL-16 (Editor Mode Foundation)
   - Fix: Draw mode removed, Edit modal mode added — verify no UX regression
   - Trigger BL-17 Faz 2 finalization (Sub-Object Editing UX)
   - Trigger BL-28/29/06 Faz 1 merge (Angle/Scale Snap + Shape Draw)
```

### Week 1–2 — P1 Unblocking (BL-27 + BL-71)

```
2. BL-71 Drag Handler Fix — World-aware drag/resize/anchor
   - Fix local↔world mismatch in MoveState/ResizeState/AnchorState
   - Test with grouped layers deeply
   - Re-merge Align/Distribute/Spread tools
   
3. BL-27 Vertex/Segment/Path Snap
   - Pen tool snap integration
   - Only unblocked by BL-17 Faz 2 merge
```

### Week 2–3 — P2 Launches

```
4. BL-72 Text Typography Phase 3 — Per-Character Animator
   - Commit Phase 1 + 2 (771 test ✅)
   - Design Phase 3 spec
   
5. BL-79 S0/S1 — AI Transaction Command + Auto-Check
   - Single-undo wrapper for AI edits
   - QualityScorer (deterministic, no LLM)
   - Should be ~1 week effort

6. BL-18 Modifier Stack Foundation
   - Non-destructive geometry pipeline (3ds Max model)
   - Unblocks BL-19–23
```

---

## ⚠️ BLOCKING ISSUES

| Issue | Impact | Workaround | Status |
|-------|--------|-----------|--------|
| **BL-16 merge uncertainty** | Blocks BL-17/28/29/06 | Stabilize then merge; or re-plan in v2 | Awaiting decision |
| **BL-71 coordinate system** | Blocks align/distribute relanding | Fix drag handlers world-aware | Known, documented |
| **BL-09 State Machine optimizations** | Affects multi-turn agent loop UX | BL-01 Faz 2 works; defer blend tuning | V2 production plan written |
| **Particle V2 scope creep** | Depends on BL-18 modifier stack | V1 foundation ✅; V2 deferred pending priority | On track |

---

## 📝 RECENT MAJOR MERGES (Last 72 hours)

```
2026-05-21  BL-73 Spline Object System → main (no-ff `3c8e149`)
            48 files, +2923 LOC, 786 test ✅
            
2026-05-21  BL-72 Text Typography Phase 1+2 (branch, not yet committed)
            771 test ✅, tsc clean
            
2026-05-21  BL-01 Faz 2 complete (branch `feat/multi-mode-architecture-bl74`)
            Multi-turn agent loop, read tools, scene replay
            
2026-05-20  BL-59 Clone & Array System + BL-60 Smart Selection → main
            Combined 9+ commits, 2000+ test ✅
```

---

## 📌 FILES TO WATCH

```
BACKLOG.md              — This file (primary truth)
feat/editor-mode-foundation  — Critical: decide merge/replan
feat/text-element-typography — Phase 3 pending
feat/particle-effect-engine-bl13 — V2 sprints defined
feat/ai-enhancement-bl79 — Next AI push (S0/S1/S2)
docs/state-machine-assessment.md — V2 production roadmap
~/.claude/plans/           — All detailed sprint plans
```

---

## 🚀 RECOMMENDATION

**Immediate priority:**
1. Decide on BL-16 merge → stabilize editor mode foundation
2. Land BL-17 Faz 2 sub-object editing
3. Fix BL-71 drag handlers and re-land align/distribute
4. Start BL-79 AI enhancement (high value, moderate effort)

**Secondary (parallel):**
5. Commit BL-72 Phase 1+2 text typography
6. Begin BL-18 modifier stack design
7. Plan BL-74 multi-mode architecture (P4)

**Deferred (post-P1):**
- BL-75 interactive runtime / console
- BL-04–11 import/asset system
- BL-80–92 full export pipeline
- BL-39+ advanced features
