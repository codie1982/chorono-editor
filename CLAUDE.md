# Chorono NextJS — Claude Code Guidelines

Repository-wide engineering rules are defined in [AGENTS.md — Software engineering standards](AGENTS.md#software-engineering-standards). Read them before implementation. They are the single source of truth for SOLID, ownership/directories, reuse, the 300-line class target, documentation and shared-mode boundaries. The notes below supplement those rules.

---

## 🏗️ Code Style & Architecture

### OOP & Class Hierarchies
Follow the repository standards in `AGENTS.md`. Memory notes such as **[[coding_standards_oop]]** are supplementary. Summary:

- **Singleton**: Only for specific cases (shared utilities, managers)
- **Class hierarchies**: Use an abstract base for purposeful shared behavior
  - Keep one cohesive responsibility; use composition/strategies for variable algorithms
  - Private mutable state, meaningful accessors/operations and readonly data contracts
  - Example: `Shape (abstract) → Rect, Circle, Polygon`
- **Access**: `private` properties, `public` methods/classes (default)
- **Deviate only if**: Performance-critical, framework demands, type-safety requires

### General Rules
- Search and extend existing owners first; create a cohesive module only when an existing one does not fit
- **Document classes and functions above their declarations** with clear contracts, units/spaces, ownership, edge cases and limitations as relevant; detailed explanations may exceed the implementation length
- Keep comments synchronized with behavior; explain non-obvious reasoning and avoid empty repetition
- **Class size target: 300 implementation lines**, excluding documentation/blank lines/generated code; record justified exceptions without arbitrary fragmentation
- Avoid premature abstraction (3 lines > abstract class)
- Trust internal code; only validate at system boundaries
- No error handling for impossible scenarios
- Security first: prevent XSS, SQL injection, OWASP top 10
- **Reuse-before-create**: search implementations and tests; reuse, compatibly extend or add an explicitly different implementation/version. Keep general utilities, converters and algorithm strategies with their owning domain

---

## ⚡ Operations & Safety

### Next.js Build
**CRITICAL**: Never run `next build` while dev server is running.
- Corrupts `.next` directory
- Blanks the app on reload
- Always: stop dev server → build → restart dev

### Multi-Mode System
- Foundational contracts live in `src/lib/core`; 2D source types live in `src/lib/types`, and implementations stay in their owning feature directories. Understand Layer, Timeline, Track, Keyframe and ChronoScene before changing their contracts
- Share geometry/topology/math and meaningful render preparation through explicit adapters; preserve 2D/3D coordinate and backend differences
- Use ModeRegistry when a new mode is explicitly in scope; the active roadmap remains 2D/2.5D
- See [[arch_multi_mode_system]] in memory

### Scripting & Events
**MANDATORY**: Every new class must emit/expose its events per script-event structure.
- Silent bugs if you skip this
- See [[arch_scripting_event_system]] in memory

### SceneCanvas Drag Invariants
- Live-scale + ref-stable handlers are **critical**
- Break them → objects escape/bounce
- See [[feedback_scenecanvas_drag_invariants]] in memory

---

## 🤖 Agent & Prompt Quality

When delegating planning/exploration tasks, see **[[agent_prompt_quality]]** in memory:

- **Planning tasks** need quality score **8+** before running Plan agent
- Ask enrichment questions (constraints, scope, success criteria, prior art)
- Use right agent type: Plan (strategy), Explore (search), Simplify (review)
- Document answers so future sessions don't re-learn context

---

## 📁 Structure

- Feature branches: `codex/*` for Codex work; follow an explicit branch convention requested for the task
- Main branch: `main`
- Commits: Use existing git user (codie1982)
- Memory: Supplementary context may be read from `~/.claude/projects/.../memory/MEMORY.md`; keep actionable standards and handoff details in repository documentation

---

## 🔗 Key References

- Source mutations require a fresh `get_scene` read in this MCP connection/editor, `expectedRevision` and its one-use `readToken`; dry-run commit uses the plan's returned token/revision. On conflict read again and preserve the current manual edits. See [the MCP guide](docs/en/mcp.md#mandatory-source-read-and-revision).
- [MCP animation authoring](AGENTS.md) — connected editor workflow for Claude and Codex
- [Engineering standards](AGENTS.md#software-engineering-standards) — canonical coding and maintainer handoff rules
- [MCP setup and capabilities](docs/tr/mcp.md) — isolated scripts, multi-timeline animation, previews and portable projects

- [[arch_multi_mode_system]] — App fundamentals (start here)
- [[arch_scripting_event_system]] — JS scripting + events (mandatory for new classes)
- [[coding_standards_oop]] — OOP rules, Singleton, abstract classes
- [[agent_prompt_quality]] — Prompt scoring & enrichment questions
